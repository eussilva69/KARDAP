/**
 * SSO do ecossistema KARDAP — configuração compartilhada (sem segredos).
 * Usada no servidor (rotas /api/auth/* e /api/sso/*) e no navegador (destino de retorno, cookie de estado).
 * Contrato para os outros aplicativos: SSO_INTEGRATION.md. Detalhes internos: docs/SSO.md.
 */

/** Cookie da sessão central (HttpOnly): o Firebase Session Cookie, criado só pelo servidor do KARDAP. */
export const SSO_COOKIE = /^[A-Za-z0-9_-]{1,64}$/.test(process.env.SSO_COOKIE_NAME || "") ? process.env.SSO_COOKIE_NAME! : "kardap_sso_session";
/**
 * Cookie de estado (legível pelo JavaScript, sem nenhum segredo): muda a cada login e some no logout.
 * Os aplicativos observam esse valor para perceber, em abas já abertas, que a sessão acabou.
 */
export const SSO_STATE_COOKIE = "kardap_sso_state";
/** Token anti-CSRF (double submit): cookie legível + cabeçalho x-csrf-token na requisição. */
export const CSRF_COOKIE = "kardap_csrf";
export const CSRF_HEADER = "x-csrf-token";

/** Duração da sessão em segundos (SSO_SESSION_MAX_AGE; padrão 5 dias; o Firebase aceita de 5 minutos a 14 dias). */
export const SSO_MAX_AGE_SECONDS = Math.min(Math.max(Number(process.env.SSO_SESSION_MAX_AGE) || 432000, 300), 1209600);
/** O login precisa ter acontecido há no máximo 5 minutos para virar sessão. */
export const RECENT_SIGN_IN_SECONDS = 5 * 60;

/** Parâmetro do destino depois do login/logout. "redirect" continua aceito como sinônimo. */
export const RETURN_PARAM = "returnTo";
export const readReturnTo = (params: URLSearchParams) => params.get(RETURN_PARAM) ?? params.get("redirect");

/** O KARDAP responde em kardapp.online e www.kardapp.online; o PDV, em pdv.kardapp.online. */
const PRODUCTION_ORIGINS = ["https://kardapp.online", "https://www.kardapp.online", "https://pdv.kardapp.online"];

/** Endereços dos aplicativos (outros ambientes: NEXT_PUBLIC_KARDAP_ORIGIN e NEXT_PUBLIC_PDV_ORIGIN). */
export const KARDAP_ORIGIN = (process.env.NEXT_PUBLIC_KARDAP_ORIGIN || "https://kardapp.online").replace(/\/+$/, "");
export const PDV_ORIGIN = (process.env.NEXT_PUBLIC_PDV_ORIGIN || "https://pdv.kardapp.online").replace(/\/+$/, "");

/**
 * Aplicativos que podem pedir credencial do Firebase ao servidor central (código de uso único).
 * O segredo de cada um fica só nos servidores: SSO_CLIENT_SECRET_<ID> no KARDAP e SSO_CLIENT_SECRET no aplicativo.
 */
export const SSO_CLIENTS: Record<string, { origin: string; name: string }> = {
  pdv: { origin: PDV_ORIGIN, name: "PDV" },
};
export const clientForOrigin = (origin: string | null | undefined) =>
  Object.keys(SSO_CLIENTS).find((id) => SSO_CLIENTS[id].origin === origin) || null;

/**
 * Origens confiáveis (destino de retorno, Origin aceito nas rotas, CORS).
 * Produção: as três URLs oficiais. Outros ambientes: SSO_ALLOWED_ORIGINS (lista separada por vírgula;
 * repassada ao navegador pelo next.config.mjs).
 */
export function allowedOrigins(): string[] {
  const extra = `${process.env.SSO_ALLOWED_ORIGINS || ""},${process.env.NEXT_PUBLIC_SSO_ALLOWED_ORIGINS || ""}`
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter((s) => /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(s));
  return Array.from(new Set([...PRODUCTION_ORIGINS, ...extra]));
}

export const isAllowedOrigin = (origin: string | null | undefined) => Boolean(origin) && allowedOrigins().includes(String(origin));

/**
 * Destino de retorno depois do login/logout. Aceita só:
 * - caminho relativo deste site ("/dashboard"), nunca "//host" ou "/\host";
 * - URL absoluta cuja origem esteja na lista (ex.: https://pdv.kardapp.online/caixa), sem usuário/senha.
 * Qualquer outra coisa (outros sites, javascript:, data:…) vira null e o chamador usa o destino padrão.
 */
export function safeRedirect(value: string | null | undefined): string | null {
  if (!value || value.length > 2048) return null;
  const raw = value.trim();
  if (/^\/(?![/\\])/.test(raw) && !/[\u0000-\u001f]/.test(raw)) return raw;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (url.protocol !== "https:" && !(url.protocol === "http:" && allowedOrigins().includes(url.origin))) return null;
  return allowedOrigins().includes(url.origin) ? url.toString() : null;
}

/** Valor do cookie de estado no navegador ("" quando não há sessão compartilhada). */
export function readSsoState(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${SSO_STATE_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(SSO_STATE_COOKIE.length + 1)) : "";
}
