/**
 * PDV — funções de navegador do SSO: token anti-CSRF, código de uso único, ida ao login central e logout global.
 */
import { signOut, type Auth } from "firebase/auth";
import { CSRF_COOKIE, CSRF_HEADER, KARDAP_ORIGIN, PDV_ORIGIN, RETURN_PARAM } from "./config";

function readCookie(name: string) {
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

/** Token anti-CSRF (cookie kardap_csrf do domínio .kardap.online, o mesmo nos aplicativos). */
export async function csrfToken() {
  const current = readCookie(CSRF_COOKIE);
  if (current) return current;
  await fetch("/api/auth/csrf", { credentials: "same-origin", cache: "no-store" });
  return readCookie(CSRF_COOKIE);
}

/** Pedido ao servidor central (CORS com credenciais: o cookie da sessão vai junto). */
async function central(path: string, body?: unknown) {
  const res = await fetch(`${KARDAP_ORIGIN}${path}`, {
    method: "POST",
    mode: "cors",
    credentials: "include",
    cache: "no-store",
    headers: { "content-type": "application/json", [CSRF_HEADER]: await csrfToken() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

/** Código de uso único (60 s) para o servidor do PDV trocar por um custom token. Vem no corpo, nunca em URL. */
export async function requestCode(): Promise<{ status: number; code?: string; error?: string }> {
  const { status, data } = await central("/api/sso/code");
  return { status, code: typeof data.code === "string" ? data.code : undefined, error: data.error };
}

/** Login central (kardap.online) com retorno para a página atual do PDV. */
export function goToLogin(path = window.location.pathname + window.location.search) {
  const url = new URL("/login", KARDAP_ORIGIN);
  url.searchParams.set(RETURN_PARAM, PDV_ORIGIN + (path.startsWith("/") && !path.startsWith("//") ? path : "/"));
  window.location.replace(url.toString());
}

/**
 * Logout global:
 * 1. POST /api/auth/logout no servidor central: encerra a sessão e apaga os cookies de .kardap.online na hora;
 *    as abas abertas do KARDAP e do PDV percebem pelo cookie de estado;
 * 2. sai do Firebase nesta aba;
 * 3. passa pela página /logout do KARDAP, que encerra também o login do Firebase guardado em kardap.online
 *    e termina no login central, com volta ao PDV.
 * `everywhere`: encerra as sessões da conta em todos os aparelhos. Se o passo 1 falhar, a página /logout o refaz.
 */
export async function pdvLogout(auth: Auth, everywhere = false) {
  await central("/api/auth/logout", { scope: everywhere ? "all" : "current" }).catch(() => undefined);
  await signOut(auth).catch(() => undefined);
  const login = new URL("/login", KARDAP_ORIGIN);
  login.searchParams.set(RETURN_PARAM, PDV_ORIGIN + "/");
  const url = new URL("/logout", KARDAP_ORIGIN);
  url.searchParams.set(RETURN_PARAM, login.toString());
  if (everywhere) url.searchParams.set("all", "1");
  window.location.replace(url.toString());
}
