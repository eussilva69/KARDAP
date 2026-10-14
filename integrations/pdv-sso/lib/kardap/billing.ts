/**
 * PDV — planos e pedidos pelo servidor central (kardapp.online). Somente servidor (Route Handlers, Server Actions).
 * O plano, a franquia de pedidos próprios e a origem dos pedidos são decididos lá, com o segredo do cliente:
 * o PDV nunca grava contador nem origem por conta própria. Detalhes: docs/PLANOS.md no KARDAP.
 */
import { cookies } from "next/headers";
import { SSO_COOKIE } from "../sso/config";
import { SsoError } from "../sso/http";
import { central } from "../sso/pdv-server";

export type NativeOrderSource = "kardap_pdv" | "kardap_table" | "kardap_delivery" | "kardap_pickup" | "kardap_staff";
export type MarketplaceSource = "ifood" | "99food" | "external_marketplace";

export type Usage = { periodId: string; used: number; limit: number | null; remaining: number | null; level: string };
export type ConfirmResult = { orderId: string; duplicate: boolean; usage: Usage };
export type QuotaExceeded = { error: "quota_exceeded"; message: string; used: number; limit: number };

async function session() {
  const value = (await cookies()).get(SSO_COOKIE)?.value;
  if (!value) throw new SsoError("invalid_session", 401, "Sessão expirada. Entre de novo.");
  return value;
}

function failure(status: number, data: { error?: string; message?: string }) {
  return new SsoError(data.error || "billing_error", status, data.message || "Não foi possível concluir agora. Tente de novo.");
}

/**
 * Direitos do estabelecimento para esta pessoa: plano, situação, limites, recursos (caixa, estoque, financeiro…),
 * uso do mês e o que o papel permite. Use para montar menus e telas; as operações são conferidas de novo no servidor.
 */
export async function getEntitlements(restaurantId: string) {
  const { status, data } = await central("/api/billing/entitlements", { restaurantId, session: await session() });
  if (status !== 200) throw failure(status, data);
  return data as {
    entitlements: { planId: string; planName: string; status: string; valid: boolean; limits: { maxTables: number | null; maxNativeOrdersPerMonth: number | null }; features: Record<string, boolean> };
    usage: { periodId: string; nativeOrdersUsed: number; nativeOrdersLimit: number | null; remaining: number | null; level: string; blocked: boolean; periodEnd: string };
    member: { isOwner: boolean; role: string | null; permissions: string[] } | null;
    pdv: { allowed: boolean; reason: string };
  };
}

/**
 * Confirma um pedido PRÓPRIO (consome 1 da franquia do mês). Chame na confirmação, nunca no rascunho.
 * `orderId`: o id do rascunho no PDV; reenviar o mesmo pedido não consome de novo.
 * Franquia esgotada: devolve { error: "quota_exceeded", used, limit, message } (o restante do PDV continua).
 */
export async function confirmOrder(input: { restaurantId: string; source: NativeOrderSource; orderId: string; order?: Record<string, unknown> }): Promise<ConfirmResult | QuotaExceeded> {
  const { status, data } = await central("/api/pedidos/confirmar", { ...input, session: await session() });
  if (status === 200 || status === 201) return data as ConfirmResult;
  if (status === 402 && data.error === "quota_exceeded") return data as QuotaExceeded;
  throw failure(status, data);
}

/**
 * Pedido recebido do iFood, 99Food ou outro marketplace (ex.: no webhook da integração). Nunca consome a franquia
 * e nunca é bloqueado por ela. Reenvios e atualizações do mesmo pedido caem no mesmo documento.
 */
export async function recordMarketplaceOrder(input: { restaurantId: string; provider: MarketplaceSource; externalOrderId: string; order?: Record<string, unknown>; providerName?: string }) {
  const { status, data } = await central("/api/pedidos/externos", input);
  if (status !== 200 && status !== 201) throw failure(status, data);
  return data as { orderId: string; created: boolean };
}
