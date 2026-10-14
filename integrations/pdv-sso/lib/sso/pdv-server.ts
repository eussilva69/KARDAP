/**
 * PDV — conversa com o servidor central de autenticação (kardapp.online). Somente servidor.
 * O PDV não precisa de credencial do Firebase Admin para o login: valida a sessão e obtém o custom token pelo
 * servidor central, autenticado com o segredo do cliente (SSO_CLIENT_ID + SSO_CLIENT_SECRET).
 */
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { KARDAP_ORIGIN, PDV_ORIGIN, RETURN_PARAM, SSO_COOKIE } from "./config";
import { SsoError } from "./http";

export type AppRestaurant = { id: string; name: string; role: string; planId?: string };
/** Restaurante em que a conta tem o papel certo, mas o plano não inclui o PDV ("plan") ou está vencido ("subscription"). */
export type BlockedRestaurant = AppRestaurant & { reason: "plan" | "subscription" };
export type CentralSession = {
  uid: string;
  email: string | null;
  name: string | null;
  expiresAt: number;
  access: { allowed: boolean; restaurants: AppRestaurant[]; blocked?: BlockedRestaurant[] };
};

const CLIENT_ID = process.env.SSO_CLIENT_ID || "pdv";
/** Endereço do servidor central para chamadas de servidor (padrão: o público). Permite rede interna. */
const CENTRAL_URL = (process.env.SSO_CENTRAL_URL || KARDAP_ORIGIN).replace(/\/+$/, "");

export async function central(path: string, body: unknown) {
  const secret = process.env.SSO_CLIENT_SECRET || "";
  if (secret.length < 32) throw new SsoError("sso_not_configured", 503, "SSO não configurado no PDV (SSO_CLIENT_SECRET).");
  const res = await fetch(`${CENTRAL_URL}${path}`, {
    method: "POST",
    headers: { authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${secret}`).toString("base64")}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

/**
 * Valida no servidor central a sessão que chegou no cookie. null = sessão ausente, vencida ou encerrada.
 * Sem cache aqui: uma sessão encerrada deixa de valer no PDV na hora (o servidor central cuida do desempenho).
 */
export async function introspect(session: string | undefined | null): Promise<CentralSession | null> {
  if (!session) return null;
  const { status, data } = await central("/api/sso/introspect", { session });
  if (status !== 200) throw new SsoError(data.error || "central_unavailable", 502, "Servidor de autenticação indisponível.");
  return data.active ? (data as CentralSession) : null;
}

/** Troca o código de uso único (vindo do navegador) por um Firebase Custom Token do mesmo uid. */
export async function exchangeCode(code: string) {
  const { status, data } = await central("/api/sso/token", { grant_type: "authorization_code", code });
  if (status !== 200) {
    throw new SsoError(data.error || "exchange_failed", status === 403 ? 403 : status >= 500 ? 502 : 400, data.message || "Não foi possível conectar.");
  }
  return data as { firebase_custom_token: string; uid: string; user: { uid: string; email: string | null; name: string | null }; restaurants: AppRestaurant[] };
}

/** Login central com retorno para este caminho do PDV. */
export function loginUrl(path = "/") {
  const url = new URL("/login", KARDAP_ORIGIN);
  url.searchParams.set(RETURN_PARAM, PDV_ORIGIN + (path.startsWith("/") && !path.startsWith("//") ? path : "/"));
  return url.toString();
}

/** Página de bloqueio: por plano (convite ao upgrade), por assinatura vencida ou por falta de permissão. */
export function blockedPath(session: CentralSession) {
  const reason = session.access.blocked?.[0]?.reason;
  return reason ? `/sem-permissao?motivo=${reason === "plan" ? "plano" : "assinatura"}` : "/sem-permissao";
}

/**
 * Para layouts e páginas protegidas (Server Components). Sessão ausente, vencida ou encerrada → login central.
 * Sem permissão → /sem-permissao. Servidor central fora do ar → página de erro (nunca um laço de redirecionamentos).
 */
export async function requirePdvSession(): Promise<CentralSession> {
  const path = (await headers()).get("x-pdv-path") || "/";
  const session = await introspect((await cookies()).get(SSO_COOKIE)?.value);
  if (!session) redirect(loginUrl(path));
  if (!session.access.allowed) redirect(blockedPath(session));
  return session;
}
