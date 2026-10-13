import { NextRequest, NextResponse } from "next/server";
import { authenticateClient, redeemCode } from "@/lib/sso/oauth";
import { SsoError, errorBody, rateLimit } from "@/lib/sso/server";

/**
 * POST /api/sso/token — chamado só pelo SERVIDOR do aplicativo (sem CORS: navegadores não leem a resposta).
 * Authorization: Basic base64(client_id:client_secret). Corpo: { grant_type: "authorization_code", code }.
 * Resposta: { token_type: "firebase_custom_token", firebase_custom_token, expires_in, uid, user, restaurants }.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (res: NextResponse) => {
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Pragma", "no-cache");
  return res;
};

export async function POST(req: NextRequest) {
  try {
    // Falhas de autenticação já contam por IP; aqui o limite é por aplicativo (todos os pedidos vêm dos seus servidores).
    const clientId = authenticateClient(req);
    rateLimit(req, "sso-token", 1200, 60_000, clientId);
    const body = await req.json().catch(() => null);
    if (body?.grant_type !== "authorization_code" || typeof body?.code !== "string") {
      throw new SsoError("invalid_request", 400, "Pedido inválido.");
    }
    const r = await redeemCode(body.code, clientId);
    return noStore(
      NextResponse.json({
        token_type: "firebase_custom_token",
        firebase_custom_token: r.token,
        expires_in: 3600,
        uid: r.uid,
        user: { uid: r.uid, email: r.email, name: r.name },
        restaurants: r.restaurants,
      }),
    );
  } catch (error) {
    const { status, body } = errorBody("token", error);
    return noStore(NextResponse.json(body, { status }));
  }
}
