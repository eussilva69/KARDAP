import { NextRequest, NextResponse } from "next/server";
import { SSO_CLIENTS, SSO_COOKIE, clientForOrigin } from "@/lib/sso/config";
import { appAccess, type AppName } from "@/lib/sso/access";
import { CODE_TTL_SECONDS, issueCode } from "@/lib/sso/oauth";
import { SsoError, assertCsrf, clearSessionCookies, errorBody, rateLimit, verifySession, withCors } from "@/lib/sso/server";

/**
 * POST /api/sso/code — chamado pelo NAVEGADOR de um aplicativo do ecossistema (CORS com credenciais).
 * O aplicativo é identificado pela origem (não por um parâmetro): só a origem cadastrada em SSO_CLIENTS recebe
 * código para aquele aplicativo. Exige CSRF, sessão central válida e permissão. Resposta: { code, expires_in }.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(req: NextRequest) {
  return withCors(req, new NextResponse(null, { status: 204 }));
}

export async function POST(req: NextRequest) {
  const cookie = req.cookies.get(SSO_COOKIE)?.value;
  try {
    rateLimit(req, "sso-code", 120, 60_000);
    const clientId = clientForOrigin(req.headers.get("origin"));
    if (!clientId) throw new SsoError("bad_origin", 403, "Origem não autorizada.");
    assertCsrf(req, [SSO_CLIENTS[clientId].origin]);
    const session = await verifySession(cookie);
    const access = await appAccess(session.uid, clientId as AppName);
    if (!access.allowed) throw new SsoError("forbidden", 403, "Esta conta não tem acesso a este aplicativo.");
    return withCors(req, NextResponse.json({ code: issueCode(session, clientId), expires_in: CODE_TTL_SECONDS, client_id: clientId }));
  } catch (error) {
    const { status, body } = errorBody("code", error);
    const res = NextResponse.json(body, { status });
    if (status === 401 && cookie) clearSessionCookies(res);
    return withCors(req, res);
  }
}
