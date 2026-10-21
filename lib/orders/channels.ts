/**
 * Canal de venda de um pedido, derivado de `origin` (gravado só pelo servidor; ver lib/billing/plans.ts). Módulo puro.
 * Pedidos de marketplace usam origin.source "ifood" | "99food" | "external_marketplace" (com origin.provider = nome).
 */

export type OrderChannel = "delivery" | "retirada" | "mesa" | "balcao" | "ifood" | "99food" | "keeta" | "marketplace";

export const CHANNEL_LABELS: Record<OrderChannel, string> = {
  delivery: "Delivery próprio",
  retirada: "Retirada",
  mesa: "Mesa",
  balcao: "Balcão",
  ifood: "iFood",
  "99food": "99Food",
  keeta: "Keeta",
  marketplace: "Marketplace",
};

export const CHANNEL_ORDER: OrderChannel[] = ["delivery", "mesa", "balcao", "retirada", "ifood", "99food", "keeta", "marketplace"];

export function orderChannel(origin: unknown): OrderChannel {
  const o = (origin && typeof origin === "object" ? origin : {}) as { source?: unknown; provider?: unknown };
  switch (o.source) {
    case "kardap_delivery":
      return "delivery";
    case "kardap_pickup":
      return "retirada";
    case "kardap_table":
      return "mesa";
    case "kardap_pdv":
    case "kardap_staff":
      return "balcao";
    case "ifood":
      return "ifood";
    case "99food":
      return "99food";
    case "external_marketplace":
      return String(o.provider || "").toLowerCase() === "keeta" ? "keeta" : "marketplace";
    default:
      return "balcao";
  }
}

export const isMarketplaceChannel = (channel: OrderChannel) => channel === "ifood" || channel === "99food" || channel === "keeta" || channel === "marketplace";

/** Canais com entrega no endereço do cliente (passam por "Saiu para entrega"). */
export const isDeliveryChannel = (channel: OrderChannel) => channel === "delivery" || isMarketplaceChannel(channel);
