"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Bike, ChefHat, CircleCheck, Clock3, Receipt, ShoppingBag, TrendingUp, UtensilsCrossed, Wallet } from "lucide-react";
import { getRestaurantId } from "@/lib/restaurant-db";
import { friendlyError } from "@/lib/async";
import { brl, elapsed, plural, stagger } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { changeOrderStatus, watchOrders } from "@/lib/orders/client";
import { CHANNEL_LABELS, CHANNEL_ORDER, isDeliveryChannel, isMarketplaceChannel, type OrderChannel } from "@/lib/orders/channels";
import { countsAsRevenue, growth, OPEN_STATUSES, summarize, type PanelOrder, type SalesSummary } from "@/lib/orders/metrics";
import { PAYMENT_METHOD_LABELS, STATUS_LABELS, type DeliveryOrderStatus } from "@/lib/delivery/types";
import { Badge, Button, ButtonLink, Card, CardHead, ConfirmDialog, EmptyState, Modal, PageHeader, Segmented, SelectField, Skeleton, type BadgeTone } from "@/components/ui";
import type { Notify } from "./types";

const DAY = 86_400_000;

/** Pedidos dos últimos `days` dias em tempo real. */
export function useOrders(days: number, enabled = true) {
  const [orders, setOrders] = useState<PanelOrder[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) return;
    const restaurantId = getRestaurantId();
    if (!restaurantId || restaurantId === "unassigned") return;
    const since = new Date(Date.now() - days * DAY).toISOString();
    return watchOrders(
      restaurantId,
      since,
      (items) => {
        setOrders(items);
        setError("");
      },
      (e) => setError(friendlyError(e, "Não foi possível carregar os pedidos.")),
    );
  }, [days, enabled]);
  return { orders, error };
}

/* ───────────────────────── Status ───────────────────────── */

const STATUS_TONE: Record<string, BadgeTone> = {
  pendente: "signal",
  confirmado: "outline",
  em_preparo: "outline",
  pronto: "success",
  saiu_para_entrega: "ink",
  entregue: "neutral",
  cancelado: "danger",
  recusado: "danger",
};
const statusLabel = (status: string) => (status === "pendente" ? "Recebido" : STATUS_LABELS[status as DeliveryOrderStatus] || status);

/** Próximo passo do fluxo, com o texto do botão. Mesa, balcão e retirada vão de "Pronto" direto para "Entregue". */
function nextStep(order: PanelOrder): { status: DeliveryOrderStatus; label: string } | null {
  switch (order.status) {
    case "pendente":
      return { status: "confirmado", label: "Aceitar" };
    case "confirmado":
      return { status: "em_preparo", label: "Iniciar preparo" };
    case "em_preparo":
      return { status: "pronto", label: "Marcar pronto" };
    case "pronto":
      return isDeliveryChannel(order.channel) ? { status: "saiu_para_entrega", label: "Saiu para entrega" } : { status: "entregue", label: order.channel === "mesa" ? "Servido" : "Entregue" };
    case "saiu_para_entrega":
      return { status: "entregue", label: "Entregue" };
    default:
      return null;
  }
}

/** Pedidos reais de marketplace mudam de status pela integração (PDV); os simulados da demonstração mudam aqui. */
const managedHere = (order: PanelOrder) => !isMarketplaceChannel(order.channel) || order.simulated;

function ChannelBadge({ order }: { order: PanelOrder }) {
  return <span className={`kd-channel kd-channel--${order.channel}`}>{CHANNEL_LABELS[order.channel]}</span>;
}

const who = (o: PanelOrder) => (o.channel === "mesa" && o.tableName ? o.tableName : o.customerName || "Cliente");
const itemsLine = (o: PanelOrder) => o.items.map((i) => `${i.quantity || 1}× ${i.name || "Item"}`).join(", ");
const orderTitle = (o: PanelOrder) => (o.orderNumber ? `#${o.orderNumber}` : `#${o.id.slice(-5).toUpperCase()}`);
const dateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/* ───────────────────────── Página Pedidos ───────────────────────── */

type View = "abertos" | "concluidos" | "cancelados" | "todos";
const RANGES: { value: string; label: string; days: number }[] = [
  { value: "1", label: "Hoje", days: 1 },
  { value: "7", label: "Últimos 7 dias", days: 7 },
  { value: "30", label: "Últimos 30 dias", days: 30 },
];

export function OrdersPage({ notify, isDemo }: { notify: Notify; isDemo: boolean }) {
  const { orders, error } = useOrders(30);
  const now = useNow(30_000);
  const [view, setView] = useState<View>("abertos");
  const [channel, setChannel] = useState<"todos" | OrderChannel>("todos");
  const [range, setRange] = useState("7");
  const [selected, setSelected] = useState<PanelOrder | null>(null);
  const [busy, setBusy] = useState("");

  const days = RANGES.find((r) => r.value === range)?.days || 7;
  const startOfToday = useMemo(() => {
    const d = new Date(now - 3 * 3_600_000);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + 3 * 3_600_000;
  }, [now]);
  const from = days === 1 ? startOfToday : now - days * DAY;

  const all = orders || [];
  const byChannel = channel === "todos" ? all : all.filter((o) => o.channel === channel);
  const open = byChannel.filter((o) => OPEN_STATUSES.indexOf(o.status) >= 0);
  const inRange = byChannel.filter((o) => o.createdAtMs >= from);
  const done = inRange.filter((o) => o.status === "entregue");
  const canceled = inRange.filter((o) => o.status === "cancelado" || o.status === "recusado");
  const listed = view === "abertos" ? open : view === "concluidos" ? done : view === "cancelados" ? canceled : inRange;
  const channelsPresent = CHANNEL_ORDER.filter((c) => all.some((o) => o.channel === c));
  const live = selected ? all.find((o) => o.id === selected.id) || selected : null;

  const advance = async (order: PanelOrder, status: DeliveryOrderStatus) => {
    setBusy(order.id);
    try {
      await changeOrderStatus(getRestaurantId(), order.id, status);
      notify(`Pedido ${orderTitle(order)}: ${statusLabel(status).toLowerCase()}`);
    } catch (e) {
      notify(friendlyError(e, "Não foi possível alterar o status."), "error");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="kd-stack">
      <PageHeader
        title="Pedidos"
        description="Delivery próprio, mesas, balcão, retirada e marketplaces num lugar só, atualizado em tempo real."
        actions={isDemo ? <Badge tone="outline">Pedidos simulados</Badge> : undefined}
      />
      {error && <p className="kd-orders-error" role="alert">{error}</p>}
      <div className="kd-orders-filters">
        <Segmented
          label="Situação dos pedidos"
          value={view}
          onChange={setView}
          options={[
            { value: "abertos", label: "Em andamento", count: open.length },
            { value: "concluidos", label: "Concluídos", count: done.length },
            { value: "cancelados", label: "Cancelados", count: canceled.length },
            { value: "todos", label: "Todos", count: inRange.length },
          ]}
        />
        <div className="kd-orders-selects">
          <SelectField label="Canal" value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)}>
            <option value="todos">Todos os canais</option>
            {channelsPresent.map((c) => (
              <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>
            ))}
          </SelectField>
          {view !== "abertos" && (
            <SelectField label="Período" value={range} onChange={(e) => setRange(e.target.value)}>
              {RANGES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </SelectField>
          )}
        </div>
      </div>

      {!orders ? (
        <Card><Skeleton rows={4} label="Carregando pedidos" /></Card>
      ) : view === "abertos" ? (
        open.length ? (
          <div className="kd-board">
            {OPEN_STATUSES.map((status) => {
              const column = open.filter((o) => o.status === status).sort((a, b) => a.createdAtMs - b.createdAtMs);
              if (!column.length) return null;
              return (
                <section key={status} className="kd-board-col" aria-labelledby={`kd-col-${status}`}>
                  <h2 id={`kd-col-${status}`} className="kd-board-title">
                    {statusLabel(status)} <span className="kd-num">{column.length}</span>
                  </h2>
                  <ul className="kd-order-cards">
                    {column.map((o, i) => {
                      const step = nextStep(o);
                      return (
                        <li key={o.id} className={`kd-order-card is-${o.status}`} style={stagger(i)}>
                          <button type="button" className="kd-order-card-main" onClick={() => setSelected(o)} aria-label={`Ver detalhes do pedido ${orderTitle(o)}`}>
                            <span className="kd-order-card-top">
                              <b>{orderTitle(o)}</b>
                              <ChannelBadge order={o} />
                              <time dateTime={o.createdAt} className="kd-order-age">{elapsed(o.createdAt, now)}</time>
                            </span>
                            <span className="kd-order-who">{who(o)}</span>
                            <span className="kd-order-items">{itemsLine(o)}</span>
                            <span className="kd-order-total kd-num">{brl(o.totalCents)}</span>
                          </button>
                          {step && managedHere(o) && (
                            <Button size="sm" variant={o.status === "pendente" ? "primary" : "secondary"} loading={busy === o.id} onClick={() => advance(o, step.status)}>
                              {step.label}
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        ) : (
          <EmptyState title="Nenhum pedido em andamento" description="Pedidos novos do delivery, das mesas e do balcão aparecem aqui na hora, prontos para aceitar." />
        )
      ) : listed.length ? (
        <Card flush>
          <div className="kd-table-scroll">
            <table className="kd-data-table kd-orders-table">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Data</th>
                  <th>Canal</th>
                  <th>Cliente ou mesa</th>
                  <th>Situação</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {listed.map((o) => (
                  <tr key={o.id} onClick={() => setSelected(o)} className="is-clickable">
                    <td><button type="button" className="kd-link-button" onClick={() => setSelected(o)}>{orderTitle(o)}</button></td>
                    <td>{dateTime(o.createdAt)}</td>
                    <td><ChannelBadge order={o} /></td>
                    <td>{who(o)}</td>
                    <td><Badge tone={STATUS_TONE[o.status] || "neutral"}>{statusLabel(o.status)}</Badge></td>
                    <td style={{ textAlign: "right" }} className={`kd-num ${countsAsRevenue(o) ? "" : "is-void"}`}>{brl(o.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <EmptyState title="Nenhum pedido neste filtro" description="Mude o período ou o canal para ver outros pedidos." />
      )}

      {live && <OrderDetail order={live} busy={busy === live.id} onAdvance={advance} onClose={() => setSelected(null)} />}
    </div>
  );
}

function OrderDetail({ order, busy, onAdvance, onClose }: { order: PanelOrder; busy: boolean; onAdvance: (o: PanelOrder, s: DeliveryOrderStatus) => Promise<void>; onClose: () => void }) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const step = nextStep(order);
  const canCancel = OPEN_STATUSES.indexOf(order.status) >= 0 && managedHere(order);
  const addr = order.address;
  return (
    <>
      <Modal
        title={`Pedido ${orderTitle(order)}`}
        description={`${CHANNEL_LABELS[order.channel]} · ${dateTime(order.createdAt)}`}
        onClose={onClose}
        footer={
          <>
            {canCancel && (
              <Button variant="ghost" onClick={() => setConfirmCancel(true)} disabled={busy}>
                {order.status === "pendente" ? "Recusar" : "Cancelar pedido"}
              </Button>
            )}
            {step && managedHere(order) ? (
              <Button loading={busy} onClick={() => onAdvance(order, step.status)}>{step.label}</Button>
            ) : (
              <Button variant="secondary" onClick={onClose}>Fechar</Button>
            )}
          </>
        }
      >
        <div className="kd-order-detail">
          <p className="kd-order-detail-status">
            <Badge tone={STATUS_TONE[order.status] || "neutral"}>{statusLabel(order.status)}</Badge>
            {order.simulated && <Badge tone="outline">{isMarketplaceChannel(order.channel) ? `Simulado · sem conexão real com ${CHANNEL_LABELS[order.channel]}` : "Simulado"}</Badge>}
          </p>
          <dl className="kd-order-facts">
            <div><dt>{order.channel === "mesa" ? "Mesa" : "Cliente"}</dt><dd>{who(order)}</dd></div>
            {order.paymentMethod && <div><dt>Pagamento</dt><dd>{order.paymentMethod === "online" ? `Pago online (${CHANNEL_LABELS[order.channel]})` : PAYMENT_METHOD_LABELS[order.paymentMethod] || order.paymentMethod}{order.paymentStatus === "pago" ? " · pago" : ""}</dd></div>}
            {addr?.street && <div><dt>Entrega</dt><dd>{`${addr.street}, ${addr.number || "s/n"}${addr.complement ? ` (${addr.complement})` : ""} — ${addr.district || ""}${addr.city ? `, ${addr.city}` : ""}`}</dd></div>}
            {order.cancelReason && <div><dt>Motivo</dt><dd>{order.cancelReason}</dd></div>}
          </dl>
          <ul className="kd-order-lines">
            {order.items.map((item, i) => (
              <li key={i}>
                <span className="kd-num">{item.quantity || 1}×</span>
                <span>
                  {item.name}
                  {item.notes && <small>{item.notes}</small>}
                </span>
                <span className="kd-num">{brl(item.totalCents ?? (item.unitPriceCents || 0) * (item.quantity || 1))}</span>
              </li>
            ))}
          </ul>
          {order.notes && <p className="kd-order-note">Observação: {order.notes}</p>}
          <dl className="kd-order-sums">
            <div><dt>Subtotal</dt><dd className="kd-num">{brl(order.subtotalCents)}</dd></div>
            {order.discountCents > 0 && <div><dt>Desconto</dt><dd className="kd-num">−{brl(order.discountCents)}</dd></div>}
            {order.deliveryFeeCents > 0 && <div><dt>Taxa de entrega</dt><dd className="kd-num">{brl(order.deliveryFeeCents)}</dd></div>}
            <div className="is-total"><dt>Total</dt><dd className="kd-num">{brl(order.totalCents)}</dd></div>
          </dl>
          {order.statusHistory.length > 0 && (
            <ol className="kd-order-timeline" aria-label="Histórico do pedido">
              {order.statusHistory.map((h, i) => (
                <li key={i}>
                  <b>{statusLabel(h.status)}</b>
                  <time dateTime={h.at}>{new Date(h.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time>
                </li>
              ))}
            </ol>
          )}
        </div>
      </Modal>
      {confirmCancel && (
        <ConfirmDialog
          title={order.status === "pendente" ? "Recusar este pedido?" : "Cancelar este pedido?"}
          description="O pedido sai da fila e não conta no faturamento. Esta ação não pode ser desfeita."
          confirmLabel={order.status === "pendente" ? "Recusar pedido" : "Cancelar pedido"}
          onConfirm={async () => {
            await onAdvance(order, order.status === "pendente" ? "recusado" : "cancelado");
          }}
          onClose={() => setConfirmCancel(false)}
        />
      )}
    </>
  );
}

/* ───────────────────────── Indicadores ───────────────────────── */

function Delta({ value, suffix }: { value: number | null; suffix: string }) {
  if (value === null) return <span className="kd-delta is-flat">sem base para comparar</span>;
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`kd-delta ${up ? "is-up" : "is-down"}`}>
      <Icon size={13} aria-hidden /> {up ? "+" : "−"}{Math.abs(value).toLocaleString("pt-BR")}% {suffix}
    </span>
  );
}

function SalesTiles({ s }: { s: SalesSummary }) {
  const tiles: { label: string; value: string; icon: typeof Wallet; delta?: React.ReactNode }[] = [
    { label: "Faturamento hoje", value: brl(s.today.revenueCents), icon: Wallet, delta: <Delta value={growth(s.today.revenueCents, s.lastWeekSameTime.revenueCents)} suffix="vs. semana passada até esta hora" /> },
    { label: "Pedidos hoje", value: String(s.today.orders), icon: Receipt, delta: <Delta value={growth(s.today.orders, s.lastWeekSameTime.orders)} suffix="vs. semana passada até esta hora" /> },
    { label: "Ticket médio (30 dias)", value: brl(s.last30.ticketCents), icon: ShoppingBag, delta: <Delta value={growth(s.last7.ticketCents, s.prev7.ticketCents)} suffix="na semana" /> },
    { label: "Faturamento do mês", value: brl(s.month.revenueCents), icon: TrendingUp, delta: <Delta value={growth(s.last7.revenueCents, s.prev7.revenueCents)} suffix="últimos 7 dias vs. 7 anteriores" /> },
  ];
  return (
    <div className="kd-stats kd-sales-tiles">
      {tiles.map(({ label, value, icon: Icon, delta }, i) => (
        <div key={label} className="kd-stat k-enter" style={stagger(i)}>
          <span className="kd-stat-icon" aria-hidden><Icon size={20} strokeWidth={1.8} /></span>
          <div className="kd-stat-body">
            <span className="kd-stat-value">{value}</span>
            <span className="kd-stat-label">{label}</span>
            {delta}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Colunas de uma série só (sem legenda: o título diz o que é). Valor exato no foco/hover e na tabela. */
function ColumnChart({ points, format, label, highlight }: { points: { key: string; label: string; short: string; value: number }[]; format: (v: number) => string; label: string; highlight?: number }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const peak = points.reduce((best, p, i) => (p.value > points[best].value ? i : best), 0);
  const ticks = [max, max / 2, 0];
  return (
    <figure className="kd-chart" aria-label={label}>
      <div className="kd-chart-plot">
        <div className="kd-chart-grid" aria-hidden>
          {ticks.map((t, i) => (
            <span key={i}><em>{format(t)}</em></span>
          ))}
        </div>
        <ol className="kd-chart-cols" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>
          {points.map((p, i) => (
            <li
              key={p.key}
              tabIndex={0}
              aria-label={`${p.label}: ${format(p.value)}`}
              className={`${i === highlight ? "is-current" : ""} ${i === peak && p.value > 0 ? "is-peak" : ""}`}
              style={{ "--h": `${(p.value / max) * 100}%` } as React.CSSProperties}
            >
              <i />
              <span className="kd-chart-tip" role="presentation">
                <b>{format(p.value)}</b> · {p.label}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <div className="kd-chart-axis" aria-hidden style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>
        {points.map((p) => (
          <span key={p.key}>{p.short}</span>
        ))}
      </div>
    </figure>
  );
}

const dayLabel = (ms: number) => new Date(ms).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
// Rótulo a cada poucos dias, sem encostar no "Hoje" do fim do eixo.
const dayShort = (ms: number, i: number, total: number, every = 5) => (i === total - 1 ? "Hoje" : i % every === 0 && i < total - 2 ? new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }) : "");
const compactBrl = (cents: number) => (cents >= 100_000 ? `R$ ${(cents / 100_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : brl(cents).replace(/,\d\d$/, ""));

function OpenOrdersStrip({ s }: { s: SalesSummary }) {
  const steps: [string, string, typeof Clock3][] = [
    ["pendente", "Recebidos", Clock3],
    ["confirmado", "Aceitos", CircleCheck],
    ["em_preparo", "Em preparo", ChefHat],
    ["pronto", "Prontos", UtensilsCrossed],
    ["saiu_para_entrega", "Em entrega", Bike],
  ];
  return (
    <ul className="kd-open-strip" aria-label="Pedidos em andamento por etapa">
      {steps.map(([status, label, Icon]) => (
        <li key={status} className={s.openByStatus[status] ? "has-items" : ""}>
          <Icon size={16} aria-hidden />
          <b className="kd-num">{s.openByStatus[status] || 0}</b>
          <span>{label}</span>
        </li>
      ))}
    </ul>
  );
}

/** Bloco de vendas da visão geral. */
export function SalesOverview({ foods }: { foods: any[] }) {
  const { orders, error } = useOrders(35);
  const now = useNow(60_000);
  const costs = useMemo(() => Object.fromEntries(foods.filter((f) => typeof f.costCents === "number").map((f) => [f.id, f.costCents])), [foods]);
  const s = useMemo(() => (orders ? summarize(orders, now, costs) : null), [orders, now, costs]);
  if (error) return null;
  if (!s) return <Card><Skeleton rows={2} label="Carregando vendas" /></Card>;
  const last14 = s.daily.slice(-14);
  return (
    <section className="kd-stack kd-sales" aria-labelledby="kd-sales-title">
      <div className="kd-section-head">
        <h2 id="kd-sales-title" className="kd-h3">Vendas</h2>
      </div>
      <SalesTiles s={s} />
      <div className="kd-split">
        <Card aria-labelledby="kd-sales-14">
          <CardHead id="kd-sales-14" title="Faturamento dos últimos 14 dias" action={<Link href="/dashboard/relatorios" className="kd-link-sm">Relatórios</Link>} />
          <ColumnChart
            label="Faturamento por dia, últimos 14 dias"
            points={last14.map((d, i) => ({ key: String(d.dayStart), label: dayLabel(d.dayStart), short: dayShort(d.dayStart, i, last14.length, 3), value: d.revenueCents }))}
            format={compactBrl}
            highlight={last14.length - 1}
          />
        </Card>
        <Card aria-labelledby="kd-sales-open">
          <CardHead id="kd-sales-open" title={s.open ? `${plural(s.open, "pedido", "pedidos")} em andamento` : "Nenhum pedido em andamento"} />
          <OpenOrdersStrip s={s} />
          <p className="kd-muted kd-sales-foot">
            Nos últimos 30 dias: {plural(s.completed30, "pedido concluído", "pedidos concluídos")}, {plural(s.canceled30, "cancelado", "cancelados")} (fora do faturamento).
          </p>
        </Card>
      </div>
    </section>
  );
}

/** Relatório completo de vendas (página Relatórios). */
export function SalesReport({ foods }: { foods: any[] }) {
  const { orders, error } = useOrders(35);
  const now = useNow(60_000);
  const costs = useMemo(() => Object.fromEntries(foods.filter((f) => typeof f.costCents === "number").map((f) => [f.id, f.costCents])), [foods]);
  const s = useMemo(() => (orders ? summarize(orders, now, costs) : null), [orders, now, costs]);
  if (error) return <p className="kd-orders-error" role="alert">{error}</p>;
  if (!s) return <Card><Skeleton rows={4} label="Carregando vendas" /></Card>;
  if (!s.last30.orders) return <EmptyState compact title="Sem vendas nos últimos 30 dias" description="Os indicadores aparecem assim que os primeiros pedidos forem concluídos." />;
  const channelMax = Math.max(1, ...s.byChannel.map((c) => c.revenueCents));
  const openHours = s.hourly.filter((h) => h.hour >= 10);
  const peakHour = s.hourly.reduce((best, h) => (h.orders > best.orders ? h : best), s.hourly[0]);
  return (
    <section className="kd-stack kd-sales" aria-labelledby="kd-report-sales">
      <h2 id="kd-report-sales" className="kd-h3">Vendas</h2>
      <SalesTiles s={s} />
      <Card aria-labelledby="kd-rep-daily">
        <CardHead id="kd-rep-daily" title="Faturamento por dia" kicker={`Últimos 30 dias · ${brl(s.last30.revenueCents)} em ${plural(s.last30.orders, "pedido", "pedidos")}`} />
        <ColumnChart
          label="Faturamento por dia, últimos 30 dias"
          points={s.daily.map((d, i) => ({ key: String(d.dayStart), label: dayLabel(d.dayStart), short: dayShort(d.dayStart, i, s.daily.length), value: d.revenueCents }))}
          format={compactBrl}
          highlight={s.daily.length - 1}
        />
        <details className="kd-chart-table">
          <summary>Ver em tabela</summary>
          <div className="kd-table-scroll">
            <table className="kd-data-table">
              <thead><tr><th>Dia</th><th style={{ textAlign: "right" }}>Pedidos</th><th style={{ textAlign: "right" }}>Faturamento</th></tr></thead>
              <tbody>
                {s.daily.slice().reverse().map((d) => (
                  <tr key={d.dayStart}><td>{dayLabel(d.dayStart)}</td><td style={{ textAlign: "right" }} className="kd-num">{d.orders}</td><td style={{ textAlign: "right" }} className="kd-num">{brl(d.revenueCents)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Card>
      <div className="kd-split">
        <Card aria-labelledby="kd-rep-channel">
          <CardHead id="kd-rep-channel" title="Vendas por canal" kicker="Últimos 30 dias" />
          <ul className="kd-bars kd-bars--money">
            {s.byChannel.map((c, i) => (
              <li key={c.channel}>
                <span className="kd-bars-label">{CHANNEL_LABELS[c.channel]} <small>{plural(c.orders, "pedido", "pedidos")}</small></span>
                <span className="kd-bars-track" aria-hidden><i style={{ width: `${(c.revenueCents / channelMax) * 100}%`, ...stagger(i) }} /></span>
                <b className="kd-num">{compactBrl(c.revenueCents)}</b>
              </li>
            ))}
          </ul>
        </Card>
        <Card aria-labelledby="kd-rep-hours">
          <CardHead id="kd-rep-hours" title="Pedidos por horário" kicker={`Pico às ${peakHour.hour}h · últimos 30 dias`} />
          <ColumnChart
            label="Pedidos por hora do dia, últimos 30 dias"
            points={openHours.map((h) => ({ key: String(h.hour), label: `${h.hour}h às ${h.hour + 1}h`, short: h.hour % 3 === 0 ? `${h.hour}h` : "", value: h.orders }))}
            format={(v) => String(Math.round(v))}
          />
        </Card>
      </div>
      <div className="kd-split">
        <Card flush aria-labelledby="kd-rep-top">
          <div className="kd-card-pad"><CardHead id="kd-rep-top" title="Produtos mais vendidos" kicker="Últimos 30 dias · margem estimada pelo custo cadastrado" /></div>
          <div className="kd-table-scroll">
            <table className="kd-data-table">
              <thead><tr><th>Produto</th><th style={{ textAlign: "right" }}>Qtd.</th><th style={{ textAlign: "right" }}>Receita</th><th style={{ textAlign: "right" }}>Margem</th></tr></thead>
              <tbody>
                {s.topProducts.map((p) => (
                  <tr key={p.productId}>
                    <td>{p.name}</td>
                    <td style={{ textAlign: "right" }} className="kd-num">{p.quantity}</td>
                    <td style={{ textAlign: "right" }} className="kd-num">{brl(p.revenueCents)}</td>
                    <td style={{ textAlign: "right" }} className="kd-num">{p.costCents === null || !p.revenueCents ? "—" : `${Math.round(((p.revenueCents - p.costCents) / p.revenueCents) * 100)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card aria-labelledby="kd-rep-delivery">
          <CardHead id="kd-rep-delivery" title="Desempenho das entregas" kicker="Delivery próprio e marketplaces · 30 dias" />
          <dl className="kd-facts-grid">
            <div><dt>Pedidos com entrega</dt><dd className="kd-num">{s.delivery.orders}</dd></div>
            <div><dt>Tempo médio até a entrega</dt><dd className="kd-num">{s.delivery.avgMinutes === null ? "—" : `${s.delivery.avgMinutes} min`}</dd></div>
            <div><dt>Entregues em até 50 min</dt><dd className="kd-num">{s.delivery.onTimeShare === null ? "—" : `${s.delivery.onTimeShare}%`}</dd></div>
            <div><dt>Taxas de entrega cobradas</dt><dd className="kd-num">{brl(s.delivery.feeCents)}</dd></div>
          </dl>
        </Card>
      </div>
    </section>
  );
}
