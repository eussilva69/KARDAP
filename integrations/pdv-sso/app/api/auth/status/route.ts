import { NextRequest, NextResponse } from "next/server";
import { SSO_COOKIE } from "@/lib/sso/config";
import { SsoError, clearSessionCookies, errorBody, rateLimit } from "@/lib/sso/http";
import { introspect } from "@/lib/sso/pdv-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Conferência periódica do PDV aberto: a sessão central ainda vale e a conta ainda pode usar o PDV? */
export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(SSO_COOKIE)?.value;
  let res: NextResponse;
  try {
    rateLimit(req, "pdv-status", 240, 60_000);
    const session = await introspect(cookie);
    if (!session) throw new SsoError("invalid_session", 401, "Sessão expirada ou encerrada.");
    res = session.access.allowed
      ? NextResponse.json({ ok: true, uid: session.uid })
      : NextResponse.json({ error: "forbidden", message: "Sua conta não tem acesso ao PDV.", reason: session.access.blocked?.[0]?.reason || "permission" }, { status: 403 });
  } catch (error) {
    const { status, body } = errorBody("pdv status", error);
    res = NextResponse.json(body, { status });
    if (status === 401 && cookie) clearSessionCookies(res);
  }
  res.headers.set("Cache-Control", "no-store");
  return res;
}
