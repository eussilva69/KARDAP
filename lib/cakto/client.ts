import crypto from "node:crypto";
import { CAKTO_CONFIG, isCaktoConfigured } from "./config";
import {
  CaktoOAuthTokenResponse,
  CaktoSubscriptionApiResponse,
} from "./types";

/**
 * Cache em memória do token de acesso OAuth2 da Cakto.
 * Evita solicitar tokens repetidamente e estourar os limites de requisição (rate limits).
 */
let cachedToken: {
  accessToken: string;
  expiresAt: number;
} | null = null;

let tokenPromise: Promise<string> | null = null;

/**
 * Obtém ou reutiliza um token de acesso OAuth2 válido da Cakto.
 */
export async function getCaktoAccessToken(): Promise<string> {
  if (!isCaktoConfigured()) {
    throw new Error(
      "Credenciais da Cakto não configuradas. Defina CAKTO_CLIENT_ID e CAKTO_CLIENT_SECRET nas variáveis de ambiente.",
    );
  }

  const now = Date.now();
  // Se temos um token no cache que ainda é válido por mais de 5 minutos, use-o
  if (cachedToken && cachedToken.expiresAt - now > 5 * 60 * 1000) {
    return cachedToken.accessToken;
  }

  // Previne múltiplas requisições simultâneas de token (single flight)
  if (tokenPromise) {
    return tokenPromise;
  }

  tokenPromise = (async () => {
    try {
      const url = `${CAKTO_CONFIG.baseUrl}/public_api/token/`;
      const body = new URLSearchParams({
        client_id: CAKTO_CONFIG.clientId,
        client_secret: CAKTO_CONFIG.clientSecret,
      });

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Cakto Auth] Falha ao obter access token:", response.status, errorText);
        throw new Error(`Falha na autenticação Cakto (status ${response.status})`);
      }

      const data = (await response.json()) as CaktoOAuthTokenResponse;
      const expiresInMs = (data.expires_in || 36000) * 1000;

      cachedToken = {
        accessToken: data.access_token,
        expiresAt: Date.now() + expiresInMs,
      };

      return data.access_token;
    } finally {
      tokenPromise = null;
    }
  })();

  return tokenPromise;
}

/**
 * Executa uma requisição autenticada à API Cakto com timeout e tratamento de erros.
 */
export async function caktoRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  retries = 2,
): Promise<T> {
  const token = await getCaktoAccessToken();
  const url = endpoint.startsWith("http") ? endpoint : `${CAKTO_CONFIG.baseUrl}${endpoint}`;

  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && options.body && typeof options.body === "string") {
    headers.set("Content-Type", "application/json");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CAKTO_CONFIG.requestTimeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Se receber 401 Unauthorized, pode ser que o token expirou remotamente: limpa o cache e tenta 1 vez
    if (response.status === 401 && retries > 0) {
      cachedToken = null;
      return caktoRequest<T>(endpoint, options, retries - 1);
    }

    // Se receber 429 Too Many Requests ou 5xx temporário, aplica backoff suave
    if ((response.status === 429 || response.status >= 500) && retries > 0) {
      await new Promise((res) => setTimeout(res, 1200));
      return caktoRequest<T>(endpoint, options, retries - 1);
    }

    if (!response.ok) {
      const errorBody = await response.text();
      let parsedError = errorBody;
      try {
        const json = JSON.parse(errorBody);
        parsedError = json.detail || json.message || json.error || errorBody;
      } catch {}

      console.error(`[Cakto API Error] ${options.method || "GET"} ${endpoint}:`, response.status, parsedError);
      throw new Error(`Erro na API Cakto (${response.status}): ${parsedError}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return (await response.json()) as T;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error("Tempo limite excedido ao comunicar com a API Cakto.");
    }
    throw err;
  }
}

/**
 * Consulta os detalhes completos de uma assinatura na Cakto.
 */
export async function getCaktoSubscription(
  subscriptionId: string,
): Promise<CaktoSubscriptionApiResponse> {
  return caktoRequest<CaktoSubscriptionApiResponse>(
    `/public_api/subscriptions/${encodeURIComponent(subscriptionId)}/`,
  );
}

/**
 * Cancela uma assinatura na Cakto imediatamente, interrompendo cobranças futuras.
 */
export async function cancelCaktoSubscription(
  subscriptionId: string,
): Promise<{ detail: string; status?: string }> {
  return caktoRequest<{ detail: string; status?: string }>(
    `/public_api/subscriptions/${encodeURIComponent(subscriptionId)}/cancel/`,
    {
      method: "POST",
    },
  );
}

/**
 * Altera o método de pagamento de uma assinatura na Cakto.
 */
export async function changeCaktoPaymentMethod(
  subscriptionId: string,
  paymentMethod: "credit_card" | "pix" | "pix_auto",
): Promise<CaktoSubscriptionApiResponse> {
  return caktoRequest<CaktoSubscriptionApiResponse>(
    `/public_api/subscriptions/${encodeURIComponent(subscriptionId)}/change-payment-method/`,
    {
      method: "POST",
      body: JSON.stringify({ payment_method: paymentMethod }),
    },
  );
}

/**
 * Consulta os ciclos de cobrança de uma assinatura na Cakto.
 */
export async function listCaktoBillingCycles(subscriptionId: string): Promise<any> {
  return caktoRequest(
    `/public_api/subscriptions/${encodeURIComponent(subscriptionId)}/billing-cycles/`,
  );
}

/**
 * Valida a autenticidade e integridade criptográfica de um webhook da Cakto via HMAC-SHA256.
 *
 * Conforme documentação oficial:
 * digest = HMAC-SHA256(secret, `${timestamp}.${rawBody}`)
 * Compara v1=${digest} com o header X-Cakto-Signature usando timingSafeEqual.
 */
export function verifyCaktoWebhookSignature(params: {
  rawBody: Buffer | string;
  timestamp: string | null;
  signature: string | null;
  bodySecret?: string | null;
  secret: string;
}): boolean {
  const { rawBody, timestamp, signature, bodySecret, secret } = params;
  if (!secret) return false;

  const rawBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, "utf-8");

  // 1. Validação prioritária por assinatura criptográfica no cabeçalho
  if (timestamp && signature) {
    const timestampSec = Number(timestamp);
    if (!Number.isFinite(timestampSec)) return false;

    // Tolerância de 5 minutos (300s) contra ataques de repetição
    const nowSec = Date.now() / 1000;
    if (Math.abs(nowSec - timestampSec) > 300) {
      console.warn("[Cakto Webhook] Rejeitado: timestamp fora da janela de tolerância de 5 minutos.");
      return false;
    }

    const expectedHash = crypto
      .createHmac("sha256", secret)
      .update(`${timestamp}.`)
      .update(rawBuffer)
      .digest("hex");

    const expectedSignature = `v1=${expectedHash}`;

    try {
      const a = Buffer.from(signature, "utf-8");
      const b = Buffer.from(expectedSignature, "utf-8");
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        return true;
      }
    } catch {
      return false;
    }
  }

  // 2. Validação alternativa pelo campo `secret` no corpo (se timestamp/signature não enviados)
  if (bodySecret) {
    try {
      const a = Buffer.from(bodySecret, "utf-8");
      const b = Buffer.from(secret, "utf-8");
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        return true;
      }
    } catch {
      return false;
    }
  }

  return false;
}
