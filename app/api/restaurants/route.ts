import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

const slugify = (value: string) => value
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

export async function POST(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    // Identidade anônima (curtidas no cardápio público) não cria restaurante.
    if (decoded.firebase?.sign_in_provider === "anonymous") return NextResponse.json({ error: "Entre com uma conta para criar o restaurante" }, { status: 403 });
    const payload = await request.json();
    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    if (name.length < 2 || name.length > 100) {
      return NextResponse.json({ error: "Nome do restaurante inválido" }, { status: 400 });
    }
    const db = adminDb();
    // Idempotente: uma conta tem um único restaurante. Reenviar a mesma requisição (duplo clique, nova tentativa
    // depois de uma resposta perdida) ou um pedido repetido não cria um segundo — e ninguém reabre o teste grátis
    // criando outro estabelecimento na mesma conta.
    const owned = await db.collection("restaurantes").where("ownerId", "==", decoded.uid).limit(1).get();
    if (!owned.empty) return NextResponse.json({ restaurantId: owned.docs[0].id }, { status: 200 });
    const restaurant = db.collection("restaurantes").doc();
    const now = FieldValue.serverTimestamp();
    await db.runTransaction(async (tx) => {
      tx.set(restaurant, { name, slug: `${slugify(name)}-${restaurant.id.slice(0, 6)}`, ownerId: decoded.uid, status: "active", createdAt: now, updatedAt: now });
      tx.set(restaurant.collection("membros").doc(decoded.uid), { uid: decoded.uid, role: "owner", permissions: ["*"], active: true, createdAt: now });
      tx.set(db.collection("usuarios").doc(decoded.uid), { email: decoded.email ?? null, displayName: decoded.name ?? null, restaurantIds: [restaurant.id], updatedAt: now });
    });
    return NextResponse.json({ restaurantId: restaurant.id }, { status: 201 });
  } catch (error) {
    console.error("restaurant provisioning failed", error);
    return NextResponse.json({ error: "Não foi possível criar o restaurante" }, { status: 500 });
  }
}
