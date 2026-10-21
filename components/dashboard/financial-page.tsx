"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CircleDollarSign, Clock3, Landmark, WalletCards } from "lucide-react";
import { getFirebaseAuth } from "@/lib/auth";
import { getRestaurantId } from "@/lib/restaurant-db";
import { brl } from "@/lib/format";
import { Button, TextField } from "@/components/ui";
import type { FinancialTransaction, RestaurantBalance, WithdrawalRequest } from "@/lib/financial/types";
import type { Notify } from "./types";

type Data = { balance: RestaurantBalance; transactions: FinancialTransaction[]; withdrawals: WithdrawalRequest[] };
type TransactionStatus = "all" | "available" | "waiting" | "settlement";

const PAGE_SIZE = 10;
const money = (cents: number) => brl(cents);
const date = (value?: string) => value ? new Date(value).toLocaleDateString("pt-BR") : "—";

const transactionStatus = (transaction: FinancialTransaction) => {
  if (transaction.released_at) return { key: "available", label: "Disponível" } as const;
  if (transaction.settlement_status === "liquidado") return { key: "waiting", label: "Em carência" } as const;
  return { key: "settlement", label: "Aguardando liquidação" } as const;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("Entre novamente para acessar o financeiro.");
  const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}`, ...(init?.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error || "Não foi possível concluir a operação.");
  return data as T;
}

function FinancialSkeleton() {
  return <div className="kd-fin-page" aria-busy="true" aria-label="Carregando financeiro">
    <div className="kd-skel kd-fin-skeleton kd-fin-skeleton--title" />
    <div className="kd-fin-overview">
      <div className="kd-skel kd-fin-skeleton kd-fin-skeleton--hero" />
      <div className="kd-fin-metrics">{Array.from({ length: 4 }, (_, index) => <div className="kd-skel kd-fin-skeleton kd-fin-skeleton--metric" key={index} />)}</div>
    </div>
    <div className="kd-skel kd-fin-skeleton kd-fin-skeleton--panel" />
  </div>;
}

export function FinancialPage({ notify }: { notify: Notify }) {
  const [data, setData] = useState<Data | null>(null);
  const [pixKey, setPixKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<TransactionStatus>("all");
  const [page, setPage] = useState(1);
  const restaurantId = getRestaurantId();

  const load = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    try { setData(await request<Data>(`/api/financial/restaurant?restaurant_id=${encodeURIComponent(restaurantId)}`)); }
    catch (error) { notify(error instanceof Error ? error.message : "Não foi possível carregar o financeiro.", "error"); }
    finally { setLoading(false); }
  }, [restaurantId, notify]);

  useEffect(() => { load(); }, [load]);

  const withdraw = async () => {
    if (!restaurantId || !data?.balance.available_cents) return;
    if (!pixKey.trim()) return notify("Informe a chave Pix de destino.", "error");
    if (!confirm(`Solicitar saque integral de ${money(data.balance.available_cents)} para a chave Pix informada?`)) return;
    setSaving(true);
    try {
      await request("/api/financial/restaurant", { method: "POST", body: JSON.stringify({ restaurant_id: restaurantId, pix_key: pixKey }) });
      setPixKey("");
      notify("Solicitação enviada para aprovação.");
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível solicitar o saque.", "error");
    } finally { setSaving(false); }
  };

  const totalNet = useMemo(() => data?.transactions
    .filter((transaction) => transaction.payment_status === "aprovado")
    .reduce((sum, transaction) => sum + transaction.restaurant_net_cents, 0) ?? 0, [data]);

  const filteredTransactions = useMemo(() => data?.transactions.filter((transaction) => (
    status === "all" || transactionStatus(transaction).key === status
  )) ?? [], [data, status]);
  const pageCount = Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE));
  const visibleTransactions = filteredTransactions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const changeStatus = (nextStatus: TransactionStatus) => {
    setStatus(nextStatus);
    setPage(1);
  };

  if (loading) return <FinancialSkeleton />;
  if (!data) return null;

  const nextWithdrawal = data.withdrawals[0]?.next_withdrawal_allowed_at;
  const metrics = [
    ["Total líquido", totalNet],
    ["Em carência", data.balance.pending_cents],
    ["Reservado", data.balance.reserved_cents],
    ["Já recebido", data.balance.paid_out_cents],
  ] as const;
  const filters: Array<{ key: TransactionStatus; label: string }> = [
    { key: "all", label: "Todas" },
    { key: "available", label: "Disponíveis" },
    { key: "waiting", label: "Em carência" },
    { key: "settlement", label: "Em liquidação" },
  ];

  return <section className="kd-fin-page">
    <header className="kd-page-head">
      <div className="kd-page-head-text">
        <p className="kd-eyebrow">Financeiro</p>
        <h1>Saldo e repasses</h1>
        <p>Acompanhe o que já entrou, o que está em processamento e os valores disponíveis para saque.</p>
      </div>
    </header>

    <div className="kd-fin-overview">
      <section className="kd-fin-available" aria-labelledby="kd-fin-available-title">
        <div className="kd-fin-available__icon"><WalletCards size={22} aria-hidden /></div>
        <div>
          <p id="kd-fin-available-title">Disponível para saque</p>
          <strong>{money(data.balance.available_cents)}</strong>
          <span>Saldo liberado após liquidação e carência de 15 dias.</span>
        </div>
      </section>
      <dl className="kd-fin-metrics">
        {metrics.map(([label, amount]) => <div className="kd-fin-metric" key={label}>
          <dt>{label}</dt>
          <dd>{money(amount)}</dd>
        </div>)}
      </dl>
    </div>

    <section className="kd-fin-withdraw" aria-labelledby="kd-fin-withdraw-title">
      <div className="kd-fin-withdraw__copy">
        <div className="kd-fin-section-icon"><Landmark size={20} aria-hidden /></div>
        <div>
          <h2 id="kd-fin-withdraw-title">Solicitar saque</h2>
          <p>O saque é integral. Após a solicitação, o valor fica reservado até a análise do KARDAP.</p>
        </div>
      </div>
      <div className="kd-fin-withdraw__form">
        <TextField label="Chave Pix de destino" value={pixKey} onChange={(event) => setPixKey(event.target.value)} placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória" />
        <Button className="kd-fin-withdraw__button" icon={<CircleDollarSign size={17} />} onClick={withdraw} loading={saving} disabled={!data.balance.available_cents}>
          Solicitar {money(data.balance.available_cents)}
        </Button>
      </div>
      {nextWithdrawal && <p className="kd-fin-next"><Clock3 size={14} aria-hidden /> Próximo saque disponível em {date(nextWithdrawal)}</p>}
    </section>

    <section className="kd-fin-history" aria-labelledby="kd-fin-history-title">
      <div className="kd-fin-history__head">
        <div>
          <p className="kd-eyebrow">Histórico</p>
          <h2 id="kd-fin-history-title">Vendas online</h2>
          <p>{filteredTransactions.length} {filteredTransactions.length === 1 ? "lançamento encontrado" : "lançamentos encontrados"}</p>
        </div>
        <div className="kd-fin-filters" aria-label="Filtrar vendas por status">
          {filters.map((filter) => <button type="button" key={filter.key} aria-pressed={status === filter.key} onClick={() => changeStatus(filter.key)}>{filter.label}</button>)}
        </div>
      </div>

      {visibleTransactions.length ? <>
        <div className="kd-fin-table-wrap">
          <table className="kd-fin-table-view">
            <thead><tr><th>Pagamento</th><th>Liberação</th><th>Status</th><th>Líquido</th></tr></thead>
            <tbody>{visibleTransactions.map((transaction) => {
              const transactionState = transactionStatus(transaction);
              return <tr key={transaction.id}>
                <td>{date(transaction.confirmed_at)}</td>
                <td>{date(transaction.release_at)}</td>
                <td><span className={`kd-fin-status kd-fin-status--${transactionState.key}`}>{transactionState.label}</span></td>
                <td>{money(transaction.restaurant_net_cents)}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        <ul className="kd-fin-transaction-list">
          {visibleTransactions.map((transaction) => {
            const transactionState = transactionStatus(transaction);
            return <li key={transaction.id}>
              <div><span>Pagamento em {date(transaction.confirmed_at)}</span><strong>{money(transaction.restaurant_net_cents)}</strong></div>
              <div><span className={`kd-fin-status kd-fin-status--${transactionState.key}`}>{transactionState.label}</span><small>Liberação: {date(transaction.release_at)}</small></div>
            </li>;
          })}
        </ul>
      </> : <div className="kd-fin-empty-state"><CircleDollarSign size={24} aria-hidden /><strong>Nenhuma venda neste filtro</strong><p>Escolha outro status para consultar os lançamentos.</p></div>}

      {pageCount > 1 && <nav className="kd-fin-pagination" aria-label="Paginação das vendas">
        <Button aria-label="Página anterior" variant="secondary" size="sm" icon={<ArrowLeft size={15} />} disabled={page === 1} onClick={() => setPage((current) => current - 1)}>Anterior</Button>
        <span aria-live="polite">Página {page} de {pageCount}</span>
        <Button aria-label="Próxima página" variant="secondary" size="sm" iconEnd={<ArrowRight size={15} />} disabled={page === pageCount} onClick={() => setPage((current) => current + 1)}>Próxima</Button>
      </nav>}
    </section>
  </section>;
}
