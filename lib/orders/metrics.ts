/**
 * Indicadores de vendas calculados a partir dos pedidos (restaurantes/{id}/pedidos). Módulo puro: os números do
 * painel saem dos registros, nunca de valores fixos. Pedidos cancelados, recusados e rascunhos não entram na receita.
 */
import { CHANNEL_ORDER, orderChannel, isDeliveryChannel, type OrderChannel } from "./channels";

export type OrderItem = { productId?: string; name?: string; quantity?: number; unitPriceCents?: number; totalCents?: number; costCents?: number; notes?: string };

export type PanelOrder = {
  id: string;
  orderNumber: number | null;
  status: string;
  channel: OrderChannel;
  createdAt: string;
  createdAtMs: number;
  items: OrderItem[];
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;
  paymentMethod: string;
  paymentStatus: string;
  customerName: string;
  customerPhone: string;
  tableName: string;
  address: { street?: string; number?: string; complement?: string; district?: string; city?: string; reference?: string } | null;
  statusHistory: { status: string; at: string }[];
  notes: string;
  cancelReason: string;
  simulated: boolean;
  provider: string;
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Converte o documento do Firestore no formato usado pelo painel (tolerante a pedidos do PDV com campos a menos). */
export function toPanelOrder(id: string, data: Record<string, any>): PanelOrder {
  const items: OrderItem[] = Array.isArray(data.items) ? data.items : [];
  const subtotal = num(data.subtotalCents) || items.reduce((s, i) => s + (num(i.totalCents) || num(i.unitPriceCents) * (num(i.quantity) || 1)), 0);
  const createdAt = str(data.createdAt) || str(data.confirmedAt) || str(data.updatedAt);
  return {
    id,
    orderNumber: typeof data.orderNumber === "number" ? data.orderNumber : null,
    status: str(data.status) || "pendente",
    channel: orderChannel(data.origin),
    createdAt,
    createdAtMs: Date.parse(createdAt) || 0,
    items,
    subtotalCents: subtotal,
    deliveryFeeCents: num(data.deliveryFeeCents),
    discountCents: num(data.discountCents),
    totalCents: num(data.totalCents) || subtotal + num(data.deliveryFeeCents) - num(data.discountCents),
    paymentMethod: str(data.paymentMethod),
    paymentStatus: str(data.paymentStatus),
    customerName: str(data.customer?.name),
    customerPhone: str(data.customer?.phone),
    tableName: str(data.tableName),
    address: data.address && typeof data.address === "object" ? data.address : null,
    statusHistory: Array.isArray(data.statusHistory) ? data.statusHistory : [],
    notes: str(data.notes),
    cancelReason: str(data.cancelReason),
    simulated: data.simulated === true || data.origin?.simulated === true,
    provider: str(data.origin?.provider),
  };
}

export const NOT_REVENUE = ["cancelado", "recusado", "rascunho"];
export const OPEN_STATUSES = ["pendente", "confirmado", "em_preparo", "pronto", "saiu_para_entrega"];
export const countsAsRevenue = (o: Pick<PanelOrder, "status">) => NOT_REVENUE.indexOf(o.status) < 0;

const DAY = 86_400_000;
/** São Paulo: UTC−3 o ano todo (sem horário de verão desde 2019). */
const SP_OFFSET = -3 * 3_600_000;
const spDayStart = (ms: number) => {
  const d = new Date(ms + SP_OFFSET);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - SP_OFFSET;
};
const spHour = (ms: number) => new Date(ms + SP_OFFSET).getUTCHours();
const spMonthStart = (ms: number) => {
  const d = new Date(ms + SP_OFFSET);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - SP_OFFSET;
};

export type Period = { revenueCents: number; orders: number; ticketCents: number };
const period = (list: PanelOrder[]): Period => {
  const valid = list.filter(countsAsRevenue);
  const revenueCents = valid.reduce((s, o) => s + o.totalCents, 0);
  return { revenueCents, orders: valid.length, ticketCents: valid.length ? Math.round(revenueCents / valid.length) : 0 };
};

/** Variação percentual (null quando não há base de comparação). */
export const growth = (current: number, previous: number) => (previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : null);

export type SalesSummary = {
  today: Period;
  /** Mesmo dia da semana anterior, até a mesma hora (restaurantes têm movimento semanal). */
  lastWeekSameTime: Period;
  month: Period;
  last7: Period;
  prev7: Period;
  last30: Period;
  open: number;
  openByStatus: Record<string, number>;
  completed30: number;
  canceled30: number;
  daily: { dayStart: number; revenueCents: number; orders: number }[];
  hourly: { hour: number; orders: number }[];
  byChannel: { channel: OrderChannel; orders: number; revenueCents: number }[];
  topProducts: { productId: string; name: string; quantity: number; revenueCents: number; costCents: number | null }[];
  delivery: { orders: number; avgMinutes: number | null; onTimeShare: number | null; feeCents: number };
};

/**
 * `costs`: custo unitário por produto (campo costCents do produto), para a margem estimada quando o item do pedido
 * não traz o custo. Sem custo conhecido, a margem do produto fica em branco (não inventa número).
 */
export function summarize(orders: PanelOrder[], now: number, costs: Record<string, number> = {}): SalesSummary {
  const today0 = spDayStart(now);
  const inRange = (from: number, to: number) => orders.filter((o) => o.createdAtMs >= from && o.createdAtMs < to);
  const last30From = today0 - 29 * DAY;
  const last30 = inRange(last30From, now + 1);

  const openByStatus: Record<string, number> = {};
  orders.filter((o) => OPEN_STATUSES.indexOf(o.status) >= 0).forEach((o) => (openByStatus[o.status] = (openByStatus[o.status] || 0) + 1));

  const daily = Array.from({ length: 30 }, (_, i) => {
    const dayStart = last30From + i * DAY;
    const p = period(inRange(dayStart, dayStart + DAY));
    return { dayStart, revenueCents: p.revenueCents, orders: p.orders };
  });

  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0 }));
  last30.filter(countsAsRevenue).forEach((o) => hourly[spHour(o.createdAtMs)].orders++);

  const channelMap = new Map<OrderChannel, { orders: number; revenueCents: number }>();
  last30.filter(countsAsRevenue).forEach((o) => {
    const c = channelMap.get(o.channel) || { orders: 0, revenueCents: 0 };
    c.orders++;
    c.revenueCents += o.totalCents;
    channelMap.set(o.channel, c);
  });
  const byChannel = CHANNEL_ORDER.filter((c) => channelMap.has(c))
    .map((channel) => ({ channel, ...channelMap.get(channel)! }))
    .sort((a, b) => b.revenueCents - a.revenueCents);

  const products = new Map<string, { productId: string; name: string; quantity: number; revenueCents: number; costCents: number | null }>();
  last30.filter(countsAsRevenue).forEach((o) =>
    o.items.forEach((item) => {
      const key = item.productId || item.name || "?";
      const qty = num(item.quantity) || 1;
      const p = products.get(key) || { productId: key, name: item.name || key, quantity: 0, revenueCents: 0, costCents: 0 };
      p.quantity += qty;
      p.revenueCents += num(item.totalCents) || num(item.unitPriceCents) * qty;
      const unitCost = typeof item.costCents === "number" ? item.costCents / qty : costs[key];
      p.costCents = p.costCents === null || typeof unitCost !== "number" ? null : p.costCents + Math.round(unitCost * qty);
      products.set(key, p);
    }),
  );
  const topProducts = Array.from(products.values())
    .sort((a, b) => b.revenueCents - a.revenueCents)
    .slice(0, 8);

  // Entregas concluídas: tempo do pedido até "Entregue".
  const delivered = last30.filter((o) => isDeliveryChannel(o.channel) && o.status === "entregue");
  const minutes = delivered
    .map((o) => {
      const end = o.statusHistory.find((h) => h.status === "entregue");
      return end ? (Date.parse(end.at) - o.createdAtMs) / 60_000 : NaN;
    })
    .filter((m) => Number.isFinite(m) && m > 0);
  const deliveryOrders = last30.filter((o) => isDeliveryChannel(o.channel) && countsAsRevenue(o));

  return {
    today: period(inRange(today0, now + 1)),
    lastWeekSameTime: period(inRange(today0 - 7 * DAY, now - 7 * DAY + 1)),
    month: period(inRange(spMonthStart(now), now + 1)),
    last7: period(inRange(today0 - 6 * DAY, now + 1)),
    prev7: period(inRange(today0 - 13 * DAY, today0 - 6 * DAY)),
    last30: period(last30),
    open: Object.values(openByStatus).reduce((s, n) => s + n, 0),
    openByStatus,
    completed30: last30.filter((o) => o.status === "entregue").length,
    canceled30: last30.filter((o) => o.status === "cancelado" || o.status === "recusado").length,
    daily,
    hourly,
    byChannel,
    topProducts,
    delivery: {
      orders: deliveryOrders.length,
      avgMinutes: minutes.length ? Math.round(minutes.reduce((s, m) => s + m, 0) / minutes.length) : null,
      onTimeShare: minutes.length ? Math.round((minutes.filter((m) => m <= 50).length / minutes.length) * 100) : null,
      feeCents: deliveryOrders.reduce((s, o) => s + o.deliveryFeeCents, 0),
    },
  };
}
