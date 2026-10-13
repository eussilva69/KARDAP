import { NextResponse, type NextRequest } from "next/server";
import { KARDAP_ORIGIN, PDV_ORIGIN, RETURN_PARAM, SSO_COOKIE } from "@/lib/sso/config";

/**
 * PDV — primeira barreira (Edge). Sem o cookie da sessão compartilhada, nem renderiza: vai para o login
 * central com o endereço de volta. A validação de verdade (assinatura, expiração, revogação, permissão)
 * acontece no servidor central, consultado pelo layout (app/(pdv)/layout.tsx) e pelas rotas /api/auth/*.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (!req.cookies.get(SSO_COOKIE)?.value) {
    const login = new URL("/login", KARDAP_ORIGIN);
    login.searchParams.set(RETURN_PARAM, PDV_ORIGIN + pathname + search);
    return NextResponse.redirect(login);
  }
  // Caminho pedido, para o layout montar o retorno se a sessão for recusada (sempre sobrescrito aqui).
  const headers = new Headers(req.headers);
  headers.set("x-pdv-path", pathname + search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!api/|_next/|sem-permissao|favicon.ico|.*\\..*).*)"],
};
