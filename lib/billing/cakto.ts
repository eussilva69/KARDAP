/**
 * Cliente Cakto — OAuth2 (client_credentials sem grant_type conforme docs),
 * requisições autenticadas, cache de token em memória, timeouts, retry básico.
 *
 * Nunca importe este módulo em código executado no navegador: ele lê
 * `CAKTO_CLIENT_ID` e `CAKTO_CLIENT_SECRET`, que são credenciais do servidor.
 */

const DEFAULT_BASE_URL = "https://api.cakto.com.br/public_api";
const DEFAULT_CHECKOUT_URL = "https://pay.cakto.com.br";
const TOKEN_EARLY_REFRESH_MS = 60_000; // renova 60s antes do expiry

type TokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
};

let cachedToken: { value: string; expiresAt: number } | null = null;
let inflight: Promise<string> | null = null;

export class CaktoError extends Error {
  status: number;
  payload: unknown;
  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "CaktoError";
    this.status = status;
    this.payload = payload;
  }
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new CaktoError(`Cakto não configurado: ${name} ausente.`, 500, null);
  return v;
}

export function caktoBaseUrl() {
  return process.env.CAKTO_API_BASE_URL || DEFAULT_BASE_URL;
}

export function caktoCheckoutBaseUrl() {
  return process.env.CAKTO_CHECKOUT_BASE_URL || DEFAULT_CHECKOUT_URL;
}

async function fetchToken(): Promise<string> {
  const clientId = env("CAKTO_CLIENT_ID");
  const clientSecret = env("CAKTO_CLIENT_SECRET");
  const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret });
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${caktoBaseUrl()}/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await response.text();
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* texto bruto */ }
    if (!response.ok) {
      // Log sem expor credenciais
      console.error("[cakto] token failed", { status: response.status });
      throw new CaktoError("Falha ao autenticar na Cakto", response.status, data);
    }
    const parsed = data as TokenResponse;
    if (!parsed?.access_token) throw new CaktoError("Token Cakto inválido", 502, data);
    const expiresAt = Date.now() + Math.max(60_000, (parsed.expires_in || 36_000) * 1000 - TOKEN_EARLY_REFRESH_MS);
    cachedToken = { value: parsed.access_token, expiresAt };
    return parsed.access_token;
  } finally {
    clearTimeout(t);
  }
}

export async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  if (inflight) return inflight;
  inflight = fetchToken().finally(() => { inflight = null; });
  return inflight;
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  timeoutMs?: number;
};

export async function caktoRequest<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = opts.method || "GET";
  const url = new URL(`${caktoBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }

  const run = async (attempt: number): Promise<T> => {
    const token = await getAccessToken();
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), opts.timeoutMs || 20_000);
    try {
      const response = await fetch(url.toString(), {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
        cache: "no-store",
      });
      const text = await response.text();
      let data: unknown = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }

      // 401: token expirado — invalida cache e tenta uma vez
      if (response.status === 401 && attempt === 0) {
        cachedToken = null;
        return run(1);
      }
      // 429 + 5xx: back-off único
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        return run(attempt + 1);
      }
      if (!response.ok) {
        console.error("[cakto] request failed", { method, path, status: response.status });
        throw new CaktoError(`Cakto ${method} ${path} ${response.status}`, response.status, data);
      }
      return data as T;
    } finally {
      clearTimeout(t);
    }
  };

  return run(0);
}

/** Monta a URL do checkout hospedado da Cakto para uma oferta. */
export function buildHostedCheckoutUrl(offerId: string, params: Record<string, string | undefined> = {}): string {
  const url = new URL(`${caktoCheckoutBaseUrl()}/${encodeURIComponent(offerId)}`);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }
  return url.toString();
}

/* --------- Validação de assinatura de webhook (HMAC-SHA256) --------- */

import { createHmac, timingSafeEqual } from "node:crypto";

export type WebhookVerificationResult =
  | { ok: true; event: string; data: unknown; raw: string }
  | { ok: false; reason: string };

/**
 * Valida o webhook conforme docs:
 * - Header `X-Cakto-Signature` no formato `v1=<hex hmac-sha256>`
 * - Header `X-Cakto-Timestamp` em segundos UNIX
 * - Assinatura calculada sobre `{timestamp}.{raw body}` usando o segredo configurado
 * - Tolerância padrão de 5 minutos
 *
 * Em último caso, se o header estiver ausente, cai para o `secret` no corpo
 * (menos seguro, descrito como alternativa pela docs).
 */
export function verifyCaktoWebhook(opts: {
  rawBody: string;
  signatureHeader: string | null;
  timestampHeader: string | null;
  toleranceSeconds?: number;
}): WebhookVerificationResult {
  const secret = process.env.CAKTO_WEBHOOK_SECRET;
  if (!secret) return { ok: false, reason: "webhook_secret_missing" };

  // Caminho preferido: header de assinatura
  if (opts.signatureHeader && opts.timestampHeader) {
    const ts = Number(opts.timestampHeader);
    if (!Number.isFinite(ts)) return { ok: false, reason: "invalid_timestamp" };
    const tolerance = opts.toleranceSeconds ?? 300;
    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - ts) > tolerance) return { ok: false, reason: "stale_timestamp" };

    const expected = createHmac("sha256", secret)
      .update(`${opts.timestampHeader}.${opts.rawBody}`)
      .digest("hex");
    const provided = opts.signatureHeader.startsWith("v1=") ? opts.signatureHeader.slice(3) : opts.signatureHeader;
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(provided, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "signature_mismatch" };
  } else {
    // Fallback: validar `secret` no corpo
    try {
      const parsed = JSON.parse(opts.rawBody) as { secret?: string };
      if (!parsed?.secret || parsed.secret !== secret) return { ok: false, reason: "body_secret_mismatch" };
    } catch {
      return { ok: false, reason: "unparseable_body" };
    }
  }

  try {
    const payload = JSON.parse(opts.rawBody) as { event?: string; data?: unknown };
    if (!payload?.event) return { ok: false, reason: "missing_event" };
    return { ok: true, event: payload.event, data: payload.data, raw: opts.rawBody };
  } catch {
    return { ok: false, reason: "unparseable_body" };
  }
}

/* --------- Tipagens úteis dos recursos Cakto --------- */

export type CaktoSubscriptionStatus =
  | "active" | "inactive" | "canceled" | "expired" | "paused" | "late" | "trial";

export type CaktoSubscription = {
  id: string;
  status?: CaktoSubscriptionStatus;
  current_period?: number;
  recurrence_period?: number;
  quantity_recurrences?: number;
  trial_days?: number;
  max_retries?: number;
  amount: string;
  retry_interval?: number;
  paid_payments_quantity?: number;
  retention?: string;
  parent_order: string;
  paymentMethod: string;
  customer: string;
  product: string;
  offer: string;
  orders: string[];
  next_payment_date?: string | null;
  createdAt: string;
  updatedAt: string;
  canceledAt?: string | null;
};

/** POST /subscriptions/{id}/cancel/ */
export async function caktoCancelSubscription(subscriptionId: string) {
  return caktoRequest<{ detail: string; status?: CaktoSubscriptionStatus | null }>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel/`,
    { method: "POST" },
  );
}

/** GET /subscriptions/{id}/ */
export async function caktoGetSubscription(subscriptionId: string) {
  return caktoRequest<CaktoSubscription>(`/subscriptions/${encodeURIComponent(subscriptionId)}/`);
}

/** POST /subscriptions/{id}/change-payment-method/ */
export async function caktoChangePaymentMethod(subscriptionId: string, paymentMethod: string) {
  return caktoRequest<{ detail: string }>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}/change-payment-method/`,
    { method: "POST", body: { payment_method: paymentMethod } },
  );
}
