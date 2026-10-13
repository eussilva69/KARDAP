import { NextRequest, NextResponse } from "next/server";
import { SSO_COOKIE } from "@/lib/sso/config";
import { assertCsrf, clearSessionCookies, errorBody, logSsoError, rateLimit, revokeSession, withCors } from "@/lib/sso/server";

/**
 * POST /api/auth/logout — encerra a sessão central (SSO_INTEGRATION.md).
 * Corpo opcional: { "scope": "current" | "all" }. "current" (padrão) encerra só esta sessão; "all" revoga as
 * sessões da conta em todos os aparelhos. Origin + CSRF obrigatórios. Sempre remove os cookies deste navegador.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(req: NextRequest) {
  return withCors(req, new NextResponse(null, { status: 204 }));
}

export async function POST(req: NextRequest) {
  try {
    rateLimit(req, "sso-end", 30, 60_000);
    assertCsrf(req);
  } catch (error) {
    const { status, body } = errorBody("logout", error);
    return withCors(req, NextResponse.json(body, { status }));
  }
  const body = await req.json().catch(() => null);
  const scope = body?.scope === "all" ? "all" : "current";
  let revoked = true;
  try {
    await revokeSession(req.cookies.get(SSO_COOKIE)?.value, scope === "all");
  } catch (error) {
    // Mesmo sem conseguir registrar a revogação, o cookie sai do navegador.
    logSsoError("logout", error);
    revoked = false;
  }
  const res = NextResponse.json({ ok: true, scope, revoked });
  clearSessionCookies(res);
  return withCors(req, res);
}
