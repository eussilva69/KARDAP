/**
 * SSO — utilitários HTTP de servidor que não dependem do Firebase Admin SDK: erros, cookies, CSRF, limite de
 * tentativas, CORS e registro de erros. Usado pelo KARDAP e copiado sem alteração para os outros aplicativos.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { CSRF_COOKIE, CSRF_HEADER, SSO_COOKIE, SSO_MAX_AGE_SECONDS, SSO_STATE_COOKIE, isAllowedOrigin } from "./config";

export class SsoError extends Error {
  status: number;
  code: string;
  constructor(code: string, status: number, message?: string) {
    super(message || code);
    this.code = code;
    this.status = status;
  }
}

/** Registro de erro sem dados sensíveis: só o código e a primeira linha da mensagem (nunca tokens ou cookies). */
export function logSsoError(scope: string, error: unknown) {
  const e = error as { code?: unknown; message?: unknown };
  const code = typeof e?.code === "string" ? e.code : "";
  const message = typeof e?.message === "string" ? e.message.split("\n")[0].replace(/[A-Za-z0-9_-]{40,}/g, "[…]").slice(0, 200) : "";
  console.error(`[sso] ${scope}: ${code || "erro"}${message ? ` — ${message}` : ""}`);
}

/** Domínio do cookie: .kardapp.online em produção (vale para os subdomínios). Outros ambientes: SSO_COOKIE_DOMAIN. */
export function cookieDomain(): string | undefined {
  const configured = process.env.SSO_COOKIE_DOMAIN?.trim();
  if (configured) return configured;
  return process.env.NODE_ENV === "production" ? ".kardapp.online" : undefined;
}

/** Secure sempre em produção. Só testes locais em http podem desligar (SSO_INSECURE_COOKIES=1 fora de produção). */
export const cookieSecure = () => !(process.env.NODE_ENV !== "production" && process.env.SSO_INSECURE_COOKIES === "1");

const baseCookie = () => ({ domain: cookieDomain(), path: "/", secure: cookieSecure(), sameSite: "lax" as const });

/**
 * Grava a sessão. `persistent: false` ("Manter conectado" desmarcado) cria cookies de navegação, apagados quando o
 * navegador fecha; a sessão em si continua limitada pela validade do Firebase Session Cookie.
 * O cookie de estado é um valor aleatório sem relação com a sessão: só sinaliza "há sessão" e muda a cada login.
 */
export function setSessionCookies(res: NextResponse, cookie: string, persistent = true) {
  const maxAge = persistent ? SSO_MAX_AGE_SECONDS : undefined;
  res.cookies.set({ ...baseCookie(), name: SSO_COOKIE, value: cookie, httpOnly: true, maxAge });
  res.cookies.set({ ...baseCookie(), name: SSO_STATE_COOKIE, value: randomBytes(12).toString("base64url"), httpOnly: false, maxAge });
}

/** Remove os cookies da sessão com o mesmo Domain e Path com que foram criados. */
export function clearSessionCookies(res: NextResponse) {
  res.cookies.set({ ...baseCookie(), name: SSO_COOKIE, value: "", httpOnly: true, maxAge: 0 });
  res.cookies.set({ ...baseCookie(), name: SSO_STATE_COOKIE, value: "", httpOnly: false, maxAge: 0 });
}

// ───────────────────────── CSRF ─────────────────────────

/** Gera o token anti-CSRF (cookie legível pelos subdomínios; o JavaScript o reenvia no cabeçalho). */
export function issueCsrf(res: NextResponse, current?: string) {
  const token = current && /^[A-Za-z0-9_-]{32,}$/.test(current) ? current : randomBytes(24).toString("base64url");
  res.cookies.set({ ...baseCookie(), name: CSRF_COOKIE, value: token, httpOnly: false, maxAge: 12 * 60 * 60 });
  return token;
}

export const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Proteção em duas camadas para pedidos que mudam estado:
 * 1. Origin presente e na lista (bloqueia formulários e scripts de outros sites); `only` restringe a origens
 *    específicas (ex.: a rota do token do PDV só aceita o próprio PDV);
 * 2. double submit: cabeçalho x-csrf-token igual ao cookie kardap_csrf (que outro site não consegue ler).
 */
export function assertCsrf(req: NextRequest, only?: string[]) {
  const origin = req.headers.get("origin");
  if (!isAllowedOrigin(origin) || (only && !only.includes(String(origin)))) {
    throw new SsoError("bad_origin", 403, "Origem não autorizada.");
  }
  const cookie = req.cookies.get(CSRF_COOKIE)?.value || "";
  const header = req.headers.get(CSRF_HEADER) || "";
  if (!cookie || !safeEqual(cookie, header)) {
    throw new SsoError("bad_csrf", 403, "Token de segurança inválido. Recarregue a página.");
  }
}

// ───────────────────────── Limite de tentativas ─────────────────────────

const hits = new Map<string, { count: number; reset: number }>();

/** IP informado pela plataforma (Vercel: req.ip / x-real-ip, que o cliente não forja); por último, x-forwarded-for. */
export function clientIp(req: NextRequest) {
  const platformIp = (req as NextRequest & { ip?: string }).ip;
  return platformIp || req.headers.get("x-real-ip") || (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
}

/**
 * Limite simples por chave (IP por padrão) e por instância do servidor (complementa os limites do Firebase Auth).
 * Em produção com várias instâncias, cada uma conta separadamente.
 */
export function rateLimit(req: NextRequest, bucket: string, max: number, windowMs: number, key = clientIp(req)) {
  const id = `${bucket}:${key}`;
  const now = Date.now();
  const entry = hits.get(id);
  if (!entry || entry.reset < now) {
    hits.set(id, { count: 1, reset: now + windowMs });
    if (hits.size > 5000) hits.forEach((v, k) => v.reset < now && hits.delete(k));
    return;
  }
  entry.count++;
  if (entry.count > max) throw new SsoError("rate_limited", 429, "Muitas tentativas. Aguarde alguns minutos.");
}

// ───────────────────────── Respostas ─────────────────────────

/** CORS só para as origens da lista (os aplicativos consultam e encerram a sessão no domínio principal). */
export function withCors(req: NextRequest, res: NextResponse) {
  const origin = req.headers.get("origin");
  res.headers.set("Cache-Control", "no-store");
  res.headers.append("Vary", "Origin");
  if (origin && isAllowedOrigin(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Access-Control-Allow-Credentials", "true");
    res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", `content-type, ${CSRF_HEADER}`);
    res.headers.set("Access-Control-Max-Age", "600");
  }
  return res;
}

/** Resposta de erro padrão: { error, message } com o status do SsoError; erros inesperados viram 500 genérico. */
export function errorBody(scope: string, error: unknown) {
  if (!(error instanceof SsoError)) logSsoError(scope, error);
  const e = error instanceof SsoError ? error : new SsoError("server_error", 500, "Não foi possível concluir agora. Tente de novo.");
  return { status: e.status, body: { error: e.code, message: e.message } };
}
