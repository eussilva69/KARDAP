import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminBucket, adminDb } from "@/lib/firebase-admin";
import { isSafeId, parseOriginalPath, type ProductVideoDoc } from "@/services/video-worker/src/contract";

/** Falhas em que tentar de novo com o mesmo arquivo não muda o resultado. */
const PERMANENT = new Set(["invalid_file", "unsupported_format", "too_large", "too_long", "no_video_stream", "product_not_found", "upload"]);

/**
 * Pede ao worker para otimizar de novo um vídeo que falhou.
 * Não processa nada aqui: reescreve o original no Storage (nova geração do arquivo), o que gera
 * um novo evento para o worker. Só membros do estabelecimento podem pedir.
 */
export async function POST(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  let uid: string;
  try {
    uid = (await adminAuth().verifyIdToken(token)).uid;
  } catch (error) {
    if (String(error).includes("Firebase Admin não configurado")) {
      return NextResponse.json({ error: "Nova tentativa indisponível neste ambiente. Envie o vídeo outra vez." }, { status: 503 });
    }
    return NextResponse.json({ error: "Sessão inválida. Entre de novo." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { restaurantId?: unknown; videoId?: unknown };
  if (!isSafeId(body.restaurantId) || !isSafeId(body.videoId)) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const { restaurantId, videoId } = body;

  const db = adminDb();
  const restaurant = await db.doc(`restaurantes/${restaurantId}`).get();
  if (!restaurant.exists) return NextResponse.json({ error: "Estabelecimento não encontrado." }, { status: 404 });
  const isOwner = restaurant.get("ownerId") === uid;
  if (!isOwner && !(await db.doc(`restaurantes/${restaurantId}/membros/${uid}`).get()).exists) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  const videoRef = db.doc(`restaurantes/${restaurantId}/videos/${videoId}`);
  const video = (await videoRef.get()).data() as ProductVideoDoc | undefined;
  if (!video) return NextResponse.json({ error: "Vídeo não encontrado." }, { status: 404 });
  if (video.status !== "failed") return NextResponse.json({ error: "Só vídeos com falha podem ser processados de novo." }, { status: 409 });
  if (video.error && PERMANENT.has(video.error)) return NextResponse.json({ error: "Esse arquivo não pode ser aproveitado. Envie o vídeo outra vez." }, { status: 422 });

  const ref = parseOriginalPath(video.originalPath);
  if (!ref || ref.restaurantId !== restaurantId || ref.videoId !== videoId) return NextResponse.json({ error: "Registro do vídeo inconsistente." }, { status: 409 });

  const file = adminBucket().file(video.originalPath);
  const [exists] = await file.exists();
  if (!exists) return NextResponse.json({ error: "O arquivo original não está mais guardado. Envie o vídeo outra vez." }, { status: 410 });

  await videoRef.update({ status: "pending", error: FieldValue.delete(), errorDetail: FieldValue.delete(), attempts: 0, updatedAt: FieldValue.serverTimestamp() });
  // Cópia sobre si mesmo com metadado novo: o Storage cria outra geração e dispara o evento de novo.
  await file.copy(file, { metadata: { retryRequestedAt: new Date().toISOString(), retryRequestedBy: uid } });
  return NextResponse.json({ ok: true }, { status: 202 });
}
