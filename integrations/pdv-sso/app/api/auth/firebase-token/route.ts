import { NextRequest, NextResponse } from "next/server";
import { PDV_ORIGIN, SSO_COOKIE } from "@/lib/sso/config";
import { SsoError, assertCsrf, clearSessionCookies, errorBody, rateLimit } from "@/lib/sso/http";
import { exchangeCode, introspect } from "@/lib/sso/pdv-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ponte para o Firebase Client SDK do PDV. Recebe do navegador (mesma origem, CSRF) o código de uso único que o
 * servidor central emitiu, troca-o no servidor central com o segredo do cliente e devolve o custom token no corpo.
 * O código precisa ser da mesma conta da sessão que chegou no cookie. Nada vai para URL, log ou armazenamento.
 */
export async function POST(req: NextRequest) {
  const cookie = req.cookies.get(SSO_COOKIE)?.value;
  let res: NextResponse;
  try {
    rateLimit(req, "pdv-token", 60, 60_000);
    assertCsrf(req, [PDV_ORIGIN]);
    const body = await req.json().catch(() => null);
    if (typeof body?.code !== "string" || body.code.length > 1024) throw new SsoError("invalid_request", 400, "Pedido inválido.");
    const session = await introspect(cookie);
    if (!session) throw new SsoError("invalid_session", 401, "Sessão expirada ou encerrada.");
    if (!session.access.allowed) throw new SsoError("forbidden", 403, "Sua conta não tem acesso ao PDV.");
    const granted = await exchangeCode(body.code);
    if (granted.uid !== session.uid) throw new SsoError("session_mismatch", 401, "Sessão trocada durante o acesso. Entre de novo.");
    res = NextResponse.json({ token: granted.firebase_custom_token, uid: granted.uid, user: granted.user, restaurants: granted.restaurants });
  } catch (error) {
    const { status, body } = errorBody("pdv firebase-token", error);
    res = NextResponse.json(body, { status });
    // Sessão recusada: o cookie sai do navegador e os aplicativos percebem.
    if (status === 401 && cookie) clearSessionCookies(res);
  }
  res.headers.set("Cache-Control", "no-store");
  return res;
}
