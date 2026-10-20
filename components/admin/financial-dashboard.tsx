"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  BarChart3,
  Building2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Clock,
  Filter,
  LoaderCircle,
  RefreshCw,
  Settings,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { getFirebaseAuth } from "@/lib/auth";
import { brl } from "@/lib/format";
import type { FinancialSummary, RestaurantFinancialRow, FinancialTransaction, FinancialSettings } from "@/lib/financial/types";
import { Button, Card, CardHead, SelectField, TextField } from "@/components/ui";
import type { Notify } from "@/components/dashboard/types";
import { FinancialPayouts } from "./financial-payouts";
import { FinancialWithdrawals } from "./financial-withdrawals";

// ─── Helpers ──────────────────────────────────────────────────────────────

async function authHeader(): Promise<Record<string, string>> {
  const user = getFirebaseAuth().currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const headers = { ...(await authHeader()), "Content-Type": "application/json", ...(opts?.headers || {}) };
  const res = await fetch(path, { ...opts, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.message || "Erro desconhecido.");
  return data as T;
}

function centsToReal(cents: number): string {
  return brl(cents / 100);
}

// ─── Componentes auxiliares ───────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "brand";
}) {
  const toneClass: Record<string, string> = {
    neutral: "",
    success: "kd-fin-kpi--success",
    warning: "kd-fin-kpi--warning",
    danger: "kd-fin-kpi--danger",
    brand: "kd-fin-kpi--brand",
  };
  return (
    <div className={`kd-fin-kpi ${toneClass[tone] || ""}`}>
      <div className="kd-fin-kpi__icon">{icon}</div>
      <div className="kd-fin-kpi__body">
        <span className="kd-fin-kpi__label">{label}</span>
        <span className="kd-fin-kpi__value">{value}</span>
        {sub && <span className="kd-fin-kpi__sub">{sub}</span>}
      </div>
    </div>
  );
}

// ─── Filtros ──────────────────────────────────────────────────────────────

type FilterState = {
  period: "hoje" | "7d" | "30d" | "custom";
  from: string;
  to: string;
  restaurantId: string;
  status: string;
};

function periodDates(period: FilterState["period"]): { from: string; to: string } {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (period === "hoje") return { from: iso(now), to: iso(now) };
  if (period === "7d") {
    const from = new Date(now);
    from.setDate(from.getDate() - 7);
    return { from: iso(from), to: iso(now) };
  }
  if (period === "30d") {
    const from = new Date(now);
    from.setDate(from.getDate() - 30);
    return { from: iso(from), to: iso(now) };
  }
  return { from: "", to: "" };
}

// ─── Tabela de transações ─────────────────────────────────────────────────

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  aprovado: { label: "Aprovado", color: "#22c55e" },
  pendente: { label: "Pendente", color: "#f7ea48" },
  recusado: { label: "Recusado", color: "#ef4444" },
  cancelado: { label: "Cancelado", color: "#6b7280" },
  estornado: { label: "Estornado", color: "#f97316" },
  chargeback: { label: "Chargeback", color: "#dc2626" },
};

function StatusDot({ status }: { status: string }) {
  const meta = STATUS_LABEL[status] || { label: status, color: "#6b7280" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: meta.color, display: "inline-block" }} />
      {meta.label}
    </span>
  );
}

function TransactionsTable({ transactions, loading }: { transactions: FinancialTransaction[]; loading: boolean }) {
  if (loading)
    return (
      <div className="kd-fin-loading">
        <LoaderCircle className="k-spin" size={20} />
        <span>Carregando transações…</span>
      </div>
    );

  if (!transactions.length) return <p className="kd-fin-empty">Nenhuma transação no período.</p>;

  return (
    <div className="kd-table-scroll">
      <table className="kd-data-table kd-fin-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Pedido</th>
            <th>Gateway</th>
            <th>Bruto</th>
            <th>Taxa Gateway</th>
            <th>Comissão KARDAP</th>
            <th>Líquido Rest.</th>
            <th>Status</th>
            <th>Liquidação</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr key={t.id}>
              <td style={{ whiteSpace: "nowrap" }}>{new Date(t.created_at).toLocaleDateString("pt-BR")}</td>
              <td>
                <code style={{ fontSize: 11 }}>{t.order_id.slice(0, 12)}…</code>
              </td>
              <td>{t.gateway}</td>
              <td style={{ textAlign: "right" }}>{centsToReal(t.gross_amount_cents)}</td>
              <td style={{ textAlign: "right", color: "#ef4444" }}>
                -{centsToReal(t.gateway_fee_cents)}
                {!t.gateway_fee_confirmed && <span title="Estimado" style={{ color: "#f97316", marginLeft: 3 }}>~</span>}
              </td>
              <td style={{ textAlign: "right", color: "#f7ea48" }}>-{centsToReal(t.kardap_fee_cents)}</td>
              <td style={{ textAlign: "right", color: "#22c55e", fontWeight: 600 }}>{centsToReal(t.restaurant_net_cents)}</td>
              <td>
                <StatusDot status={t.payment_status} />
              </td>
              <td>{t.settlement_status === "liquidado" ? "✓" : t.settlement_status === "aguardando" ? "Aguardando" : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Tabela por restaurante ───────────────────────────────────────────────

function RestaurantsTable({
  rows,
  loading,
  onSelect,
}: {
  rows: RestaurantFinancialRow[];
  loading: boolean;
  onSelect: (id: string) => void;
}) {
  if (loading)
    return (
      <div className="kd-fin-loading">
        <LoaderCircle className="k-spin" size={20} />
        <span>Carregando dados…</span>
      </div>
    );

  if (!rows.length) return <p className="kd-fin-empty">Nenhum restaurante com dados financeiros.</p>;

  return (
    <div className="kd-table-scroll">
      <table className="kd-data-table kd-fin-table">
        <thead>
          <tr>
            <th>Restaurante</th>
            <th style={{ textAlign: "right" }}>Vendas</th>
            <th style={{ textAlign: "right" }}>Bruto</th>
            <th style={{ textAlign: "right" }}>Taxa Gateway</th>
            <th style={{ textAlign: "right" }}>Comissão KARDAP</th>
            <th style={{ textAlign: "right" }}>Líquido</th>
            <th style={{ textAlign: "right" }}>Repassado</th>
            <th style={{ textAlign: "right" }}>Pendente</th>
            <th style={{ textAlign: "right" }}>Disponível</th>
            <th>Último repasse</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.restaurant_id}>
              <td>
                <div style={{ fontWeight: 600 }}>{r.restaurant_name}</div>
                <div style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace" }}>{r.restaurant_id}</div>
              </td>
              <td style={{ textAlign: "right" }}>{r.approved_count}</td>
              <td style={{ textAlign: "right" }}>{centsToReal(r.gross_cents)}</td>
              <td style={{ textAlign: "right", color: "#ef4444" }}>-{centsToReal(r.gateway_fee_cents)}</td>
              <td style={{ textAlign: "right", color: "#f7ea48" }}>-{centsToReal(r.kardap_fee_cents)}</td>
              <td style={{ textAlign: "right", fontWeight: 600 }}>{centsToReal(r.restaurant_net_cents)}</td>
              <td style={{ textAlign: "right", color: "#22c55e" }}>{centsToReal(r.paid_out_cents)}</td>
              <td style={{ textAlign: "right", color: "#f97316" }}>{centsToReal(r.pending_cents)}</td>
              <td style={{ textAlign: "right", fontWeight: 600, color: "#22c55e" }}>{centsToReal(r.available_cents)}</td>
              <td style={{ fontSize: 12, color: "#6b7280" }}>
                {r.last_payout_at ? new Date(r.last_payout_at).toLocaleDateString("pt-BR") : "—"}
              </td>
              <td>
                <button
                  onClick={() => onSelect(r.restaurant_id)}
                  className="kd-btn kd-btn--ghost kd-btn--sm"
                  title="Ver extrato"
                >
                  <ChevronRight size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Configurações financeiras ────────────────────────────────────────────

function FinancialSettingsPanel({ notify }: { notify: Notify }) {
  const [settings, setSettings] = useState<FinancialSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gw, setGw] = useState("");
  const [kd, setKd] = useState("");

  useEffect(() => {
    apiFetch<{ settings: FinancialSettings }>("/api/financial/settings")
      .then(({ settings }) => {
        setSettings(settings);
        setGw(String(settings.default_gateway_fee_percent));
        setKd(String(settings.default_kardap_fee_percent));
      })
      .catch((e) => notify(e.message, "error"))
      .finally(() => setLoading(false));
  }, [notify]);

  const save = async () => {
    setSaving(true);
    try {
      const { settings: next } = await apiFetch<{ settings: FinancialSettings }>("/api/financial/settings", {
        method: "PATCH",
        body: JSON.stringify({
          default_gateway_fee_percent: Number(gw),
          default_kardap_fee_percent: Number(kd),
        }),
      });
      setSettings(next);
      notify("Configurações salvas.");
    } catch (e: any) {
      notify(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="kd-fin-loading"><LoaderCircle className="k-spin" size={18} /></div>;

  return (
    <Card>
      <CardHead title="Configurações financeiras" />
      <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <TextField
            label="Taxa do gateway (%)"
            value={gw}
            onChange={(e) => setGw(e.target.value)}
            type="number"
            min="0"
            max="50"
            step="0.01"
          />
          <TextField
            label="Comissão KARDAP (%)"
            value={kd}
            onChange={(e) => setKd(e.target.value)}
            type="number"
            min="0"
            max="50"
            step="0.01"
          />
        </div>
        {settings && (
          <div className="kd-fin-example">
            <strong>Exemplo com R$ 100,00:</strong>
            <ul>
              <li>Gateway ({gw}%): <span style={{ color: "#ef4444" }}>-R$ {((100 * Number(gw)) / 100).toFixed(2)}</span></li>
              <li>Após gateway: R$ {(100 - (100 * Number(gw)) / 100).toFixed(2)}</li>
              <li>KARDAP ({kd}%): <span style={{ color: "#f7ea48" }}>-R$ {(((100 - (100 * Number(gw)) / 100) * Number(kd)) / 100).toFixed(2)}</span></li>
              <li>Restaurante: <span style={{ color: "#22c55e", fontWeight: 600 }}>R$ {(100 - (100 * Number(gw)) / 100 - ((100 - (100 * Number(gw)) / 100) * Number(kd)) / 100).toFixed(2)}</span></li>
            </ul>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button onClick={save} loading={saving}>Salvar configurações</Button>
        </div>
      </div>
    </Card>
  );
}

// ─── Dashboard principal ──────────────────────────────────────────────────

type Tab = "visao_geral" | "restaurantes" | "transacoes" | "repasses" | "configuracoes";

export function FinancialDashboard({ notify }: { notify: Notify }) {
  const [tab, setTab] = useState<Tab>("visao_geral");
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [rows, setRows] = useState<RestaurantFinancialRow[]>([]);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingTx, setLoadingTx] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] = useState<string | null>(null);

  const [filters, setFilters] = useState<FilterState>({
    period: "30d",
    from: "",
    to: "",
    restaurantId: "",
    status: "",
  });

  const loadSummary = useCallback(async () => {
    setLoadingSummary(true);
    try {
      const dates = filters.period !== "custom" ? periodDates(filters.period) : { from: filters.from, to: filters.to };
      const params = new URLSearchParams();
      if (dates.from) params.set("from", dates.from + "T00:00:00.000Z");
      if (dates.to) params.set("to", dates.to + "T23:59:59.999Z");
      if (filters.restaurantId) params.set("restaurant_id", filters.restaurantId);

      const data = await apiFetch<{ summary: FinancialSummary; rows: RestaurantFinancialRow[] }>(
        `/api/financial/summary?${params}`,
      );
      setSummary(data.summary);
      setRows(data.rows);
    } catch (e: any) {
      notify(e.message, "error");
    } finally {
      setLoadingSummary(false);
    }
  }, [filters, notify]);

  const loadTransactions = useCallback(async () => {
    setLoadingTx(true);
    try {
      const dates = filters.period !== "custom" ? periodDates(filters.period) : { from: filters.from, to: filters.to };
      const params = new URLSearchParams();
      if (dates.from) params.set("from", dates.from + "T00:00:00.000Z");
      if (dates.to) params.set("to", dates.to + "T23:59:59.999Z");
      if (filters.restaurantId || selectedRestaurant) params.set("restaurant_id", filters.restaurantId || selectedRestaurant!);
      if (filters.status) params.set("status", filters.status);

      const data = await apiFetch<{ transactions: FinancialTransaction[] }>(`/api/financial/transactions?${params}`);
      setTransactions(data.transactions);
    } catch (e: any) {
      notify(e.message, "error");
    } finally {
      setLoadingTx(false);
    }
  }, [filters, selectedRestaurant, notify]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (tab === "transacoes") loadTransactions();
  }, [tab, loadTransactions]);

  const TABS: { id: Tab; label: string }[] = [
    { id: "visao_geral", label: "Visão Geral" },
    { id: "restaurantes", label: "Por Restaurante" },
    { id: "transacoes", label: "Transações" },
    { id: "repasses", label: "Repasses" },
    { id: "configuracoes", label: "Configurações" },
  ];

  return (
    <div className="kd-fin">
      {/* Header */}
      <div className="kd-fin__header">
        <div>
          <h1 className="kd-fin__title">
            <CircleDollarSign size={22} />
            Financeiro
          </h1>
          <p className="kd-fin__subtitle">Faturamento, comissões e repasses em tempo real</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={loadSummary} loading={loadingSummary}>
            Atualizar
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="kd-fin__filters">
        <div className="kd-fin__filter-group">
          {(["hoje", "7d", "30d", "custom"] as const).map((p) => (
            <button
              key={p}
              className={`kd-fin__period-btn ${filters.period === p ? "kd-fin__period-btn--active" : ""}`}
              onClick={() => setFilters((f) => ({ ...f, period: p }))}
            >
              {p === "hoje" ? "Hoje" : p === "7d" ? "7 dias" : p === "30d" ? "30 dias" : "Personalizado"}
            </button>
          ))}
        </div>
        {filters.period === "custom" && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <TextField
              label=""
              type="date"
              value={filters.from}
              onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
            />
            <span style={{ color: "#6b7280" }}>até</span>
            <TextField
              label=""
              type="date"
              value={filters.to}
              onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
            />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="kd-fin__tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`kd-fin__tab ${tab === t.id ? "kd-fin__tab--active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {tab === "visao_geral" && (
        <div className="kd-fin__section">
          {loadingSummary ? (
            <div className="kd-fin-loading">
              <LoaderCircle className="k-spin" size={24} />
              <span>Carregando dados financeiros…</span>
            </div>
          ) : summary ? (
            <>
              <div className="kd-fin__kpi-grid">
                <KpiCard
                  label="Faturamento Bruto"
                  value={centsToReal(summary.gross_revenue_cents)}
                  sub={`${summary.transaction_count} transações`}
                  icon={<TrendingUp size={20} />}
                  tone="neutral"
                />
                <KpiCard
                  label="Pagamentos Aprovados"
                  value={centsToReal(summary.approved_payments_cents)}
                  icon={<CircleDollarSign size={20} />}
                  tone="success"
                />
                <KpiCard
                  label="Taxas do Gateway"
                  value={centsToReal(summary.gateway_fees_cents)}
                  icon={<ArrowUpRight size={20} />}
                  tone="danger"
                />
                <KpiCard
                  label="Receita KARDAP"
                  value={centsToReal(summary.kardap_revenue_cents)}
                  icon={<Wallet size={20} />}
                  tone="brand"
                />
                <KpiCard
                  label="Pertence aos Restaurantes"
                  value={centsToReal(summary.restaurant_total_cents)}
                  icon={<Building2 size={20} />}
                  tone="neutral"
                />
                <KpiCard
                  label="Disponível para Repasse"
                  value={centsToReal(summary.available_for_payout_cents)}
                  icon={<ArrowDownToLine size={20} />}
                  tone="success"
                />
                <KpiCard
                  label="Repasses Pendentes"
                  value={centsToReal(summary.pending_payout_cents)}
                  icon={<Clock size={20} />}
                  tone="warning"
                />
                <KpiCard
                  label="Total Repassado"
                  value={centsToReal(summary.completed_payouts_cents)}
                  icon={<BarChart3 size={20} />}
                  tone="success"
                />
                <KpiCard
                  label="Estornos / Chargebacks"
                  value={centsToReal(summary.chargebacks_cents)}
                  icon={<X size={20} />}
                  tone="danger"
                />
              </div>

              {/* Resumo distribuição */}
              {summary.approved_payments_cents > 0 && (
                <Card style={{ marginTop: 24 }}>
                  <CardHead title="Distribuição do faturamento aprovado" />
                  <div style={{ padding: "16px 20px" }}>
                    <div className="kd-fin__distribution">
                      <div
                        className="kd-fin__dist-bar kd-fin__dist-bar--gateway"
                        style={{ width: `${(summary.gateway_fees_cents / summary.approved_payments_cents) * 100}%` }}
                        title={`Gateway: ${centsToReal(summary.gateway_fees_cents)}`}
                      />
                      <div
                        className="kd-fin__dist-bar kd-fin__dist-bar--kardap"
                        style={{ width: `${(summary.kardap_revenue_cents / summary.approved_payments_cents) * 100}%` }}
                        title={`KARDAP: ${centsToReal(summary.kardap_revenue_cents)}`}
                      />
                      <div
                        className="kd-fin__dist-bar kd-fin__dist-bar--restaurant"
                        style={{ width: `${(summary.restaurant_total_cents / summary.approved_payments_cents) * 100}%` }}
                        title={`Restaurantes: ${centsToReal(summary.restaurant_total_cents)}`}
                      />
                    </div>
                    <div className="kd-fin__dist-legend">
                      <span><span className="kd-fin__dist-dot kd-fin__dist-dot--gateway" />Gateway ({((summary.gateway_fees_cents / summary.approved_payments_cents) * 100).toFixed(1)}%)</span>
                      <span><span className="kd-fin__dist-dot kd-fin__dist-dot--kardap" />KARDAP ({((summary.kardap_revenue_cents / summary.approved_payments_cents) * 100).toFixed(1)}%)</span>
                      <span><span className="kd-fin__dist-dot kd-fin__dist-dot--restaurant" />Restaurantes ({((summary.restaurant_total_cents / summary.approved_payments_cents) * 100).toFixed(1)}%)</span>
                    </div>
                  </div>
                </Card>
              )}
            </>
          ) : null}
        </div>
      )}

      {tab === "restaurantes" && (
        <div className="kd-fin__section">
          {selectedRestaurant ? (
            <>
              <button
                className="kd-btn kd-btn--ghost kd-btn--sm"
                onClick={() => setSelectedRestaurant(null)}
                style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}
              >
                ← Voltar para todos
              </button>
              <div style={{ marginBottom: 24 }}>
                <h2 style={{ fontWeight: 700, marginBottom: 4 }}>
                  {rows.find((r) => r.restaurant_id === selectedRestaurant)?.restaurant_name || selectedRestaurant}
                </h2>
                <TransactionsTable
                  transactions={transactions.filter((t) => t.restaurant_id === selectedRestaurant)}
                  loading={loadingTx}
                />
              </div>
              <FinancialPayouts restaurantId={selectedRestaurant} notify={notify} />
            </>
          ) : (
            <RestaurantsTable
              rows={rows}
              loading={loadingSummary}
              onSelect={(id) => {
                setSelectedRestaurant(id);
                setFilters((f) => ({ ...f, restaurantId: id }));
                loadTransactions();
              }}
            />
          )}
        </div>
      )}

      {tab === "transacoes" && (
        <div className="kd-fin__section">
          <div style={{ marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <SelectField
              label="Status"
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            >
              <option value="">Todos</option>
              <option value="aprovado">Aprovado</option>
              <option value="pendente">Pendente</option>
              <option value="recusado">Recusado</option>
              <option value="cancelado">Cancelado</option>
              <option value="estornado">Estornado</option>
            </SelectField>
            <Button variant="secondary" size="sm" icon={<Filter size={14} />} onClick={loadTransactions}>
              Filtrar
            </Button>
          </div>
          <TransactionsTable transactions={transactions} loading={loadingTx} />
        </div>
      )}

      {tab === "repasses" && (
        <div className="kd-fin__section">
          <FinancialWithdrawals notify={notify} />
          <FinancialPayouts restaurantId={filters.restaurantId || undefined} notify={notify} showAll />
        </div>
      )}

      {tab === "configuracoes" && (
        <div className="kd-fin__section">
          <FinancialSettingsPanel notify={notify} />
        </div>
      )}
    </div>
  );
}
