import { NextRequest, NextResponse } from "next/server";
import { SSO_COOKIE } from "@/lib/sso/config";
import { appAccess } from "@/lib/sso/access";
import { SsoError, assertCsrf, clearSessionCookies, createSession, errorBody, rateLimit, revokeSession, setSessionCookies, verifySession, withCors } from "@/lib/sso/server";

/**
 * Sessão central do ecossistema KARDAP (SSO_INTEGRATION.md).
 * POST cria a sessão a partir do ID token de um login recente (Origin + CSRF obrigatórios)
 * GET  informa se a sessão é válida, com dados mínimos do usuário e os aplicativos liberados
 * Logout: POST /api/auth/logout.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (req: NextRequest, error: unknown) => {
  const { status, body } = errorBody("session", error);
  return withCors(req, NextResponse.json(body, { status }));
};

export function OPTIONS(req: NextRequest) {
  return withCors(req, new NextResponse(null, { status: 204 }));
}

export async function POST(req: NextRequest) {
  try {
    // Generoso de propósito: vários aparelhos de um restaurante (ou de uma operadora móvel) saem pelo mesmo IP,
    // e cada pedido já exige um ID token válido (a senha é conferida pelo Firebase Auth, com limites próprios).
    rateLimit(req, "sso-create", 60, 10 * 60_000);
    assertCsrf(req);
    const body = await req.json().catch(() => null);
    const idToken = typeof body?.idToken === "string" ? body.idToken : "";
    if (!idToken || idToken.length > 4096) throw new SsoError("invalid_token", 400, "Sessão inválida. Entre de novo.");
    const previous = req.cookies.get(SSO_COOKIE)?.value;
    const { cookie, uid } = await createSession(idToken);
    // Contra fixação de sessão: todo login gera um cookie novo e encerra o que este navegador tinha antes.
    if (previous && previous !== cookie) await revokeSession(previous).catch(() => undefined);
    const access = await appAccess(uid, "pdv").catch(() => ({ allowed: false }));
    const res = NextResponse.json({ authenticated: true, uid, apps: { pdv: access.allowed } }, { status: 201 });
    setSessionCookies(res, cookie, body?.remember !== false);
    return withCors(req, res);
  } catch (error) {
    return fail(req, error);
  }
}

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(SSO_COOKIE)?.value;
  try {
    rateLimit(req, "sso-read", 300, 60_000);
    const session = await verifySession(cookie);
    const access = await appAccess(session.uid, "pdv");
    return withCors(
      req,
      NextResponse.json({
        authenticated: true,
        uid: session.uid,
        email: session.email,
        name: session.name,
        expiresAt: session.expiresAt,
        apps: { pdv: access.allowed },
      }),
    );
  } catch (error) {
    if (error instanceof SsoError && error.status === 401) {
      const res = NextResponse.json({ authenticated: false }, { status: 401 });
      // Cookie expirado, revogado ou adulterado: sai do navegador para todos os aplicativos perceberem.
      if (cookie) clearSessionCookies(res);
      return withCors(req, res);
    }
    return fail(req, error);
  }
}
