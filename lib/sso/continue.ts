/**
 * /login?returnTo=… com sessão central válida: o servidor devolve o destino antes de renderizar a página
 * (sem tela de login piscando). Somente servidor.
 */
import { cookies } from "next/headers";
import { SSO_COOKIE, safeRedirect } from "./config";
import { verifySession } from "./server";

type SearchParams = Record<string, string | string[] | undefined>;

export async function continueIfSignedIn(searchParams: SearchParams): Promise<string | null> {
  const pick = (v: string | string[] | undefined) => (typeof v === "string" ? v : null);
  const target = safeRedirect(pick(searchParams.returnTo) ?? pick(searchParams.redirect));
  if (!target) return null;
  const cookie = cookies().get(SSO_COOKIE)?.value;
  if (!cookie) return null;
  try {
    await verifySession(cookie);
    return target;
  } catch {
    // Sessão inválida ou servidor sem configuração: a tela de login cuida do resto.
    return null;
  }
}
