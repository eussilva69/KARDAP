import { NextRequest, NextResponse } from "next/server";
import { appAccess, type AppName } from "@/lib/sso/access";
import { authenticateClient } from "@/lib/sso/oauth";
import { SsoError, errorBody, rateLimit, verifySession } from "@/lib/sso/server";

/**
 * POST /api/sso/introspect — chamado só pelo SERVIDOR do aplicativo, para validar a sessão central que chegou
 * no cookie (sem precisar de credencial do Firebase Admin no aplicativo).
 * Authorization: Basic base64(client_id:client_secret). Corpo: { session: "<valor do cookie kardap_sso_session>" }.
 * Resposta: { active: false } ou { active: true, uid, email, name, expiresAt, access: { allowed, restaurants } }.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let res: NextResponse;
  try {
    // Todas as verificações de um aplicativo saem dos mesmos servidores: o limite é por aplicativo, alto.
    const clientId = authenticateClient(req);
    rateLimit(req, "sso-introspect", 3000, 60_000, clientId);
    const body = await req.json().catch(() => null);
    const value = typeof body?.session === "string" && body.session.length < 4096 ? body.session : "";
    try {
      const session = await verifySession(value);
      const access = await appAccess(session.uid, clientId as AppName);
      res = NextResponse.json({
        active: true,
        uid: session.uid,
        email: session.email,
        name: session.name,
        expiresAt: session.expiresAt,
        access,
      });
    } catch (error) {
      if (!(error instanceof SsoError && error.status === 401)) throw error;
      res = NextResponse.json({ active: false });
    }
  } catch (error) {
    const { status, body } = errorBody("introspect", error);
    res = NextResponse.json(body, { status });
  }
  res.headers.set("Cache-Control", "no-store");
  return res;
}
