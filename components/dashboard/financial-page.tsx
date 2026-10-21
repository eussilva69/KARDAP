"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleDollarSign, Clock3, LoaderCircle } from "lucide-react";
import { getFirebaseAuth } from "@/lib/auth";
import { getRestaurantId } from "@/lib/restaurant-db";
import { brl } from "@/lib/format";
import { Button, Card, CardHead, TextField } from "@/components/ui";
import type { FinancialTransaction, RestaurantBalance, WithdrawalRequest } from "@/lib/financial/types";
import type { Notify } from "./types";

type Data = { balance: RestaurantBalance; transactions: FinancialTransaction[]; withdrawals: WithdrawalRequest[] };
// brl() já recebe centavos (lib/format.ts): dividir aqui de novo mostrava valores 100 vezes menores.
const money = (cents: number) => brl(cents);

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("Entre novamente para acessar o financeiro.");
  const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}`, ...(init?.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error || "Não foi possível concluir a operação.");
  return data as T;
}

export function FinancialPage({ notify }: { notify: Notify }) {
  const [data, setData] = useState<Data | null>(null);
  const [pixKey, setPixKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
      setPixKey(""); notify("Solicitação enviada para aprovação."); await load();
    } catch (error) { notify(error instanceof Error ? error.message : "Não foi possível solicitar o saque.", "error"); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="kd-fin-loading"><LoaderCircle className="k-spin" size={20} /> Carregando financeiro…</div>;
  if (!data) return null;
  const next = data.withdrawals[0]?.next_withdrawal_allowed_at;
  return <section>
    <header className="kd-page-head"><div><p className="kd-eyebrow">Financeiro</p><h1>Saldo e repasses</h1><p>Valores de vendas online são liberados individualmente após 15 dias e liquidação pelo Mercado Pago.</p></div></header>
    <div className="kd-fin__balance-grid">
      {[['Total líquido', data.transactions.filter((t) => t.payment_status === 'aprovado').reduce((sum, t) => sum + t.restaurant_net_cents, 0)], ['Em carência', data.balance.pending_cents], ['Disponível para saque', data.balance.available_cents], ['Reservado', data.balance.reserved_cents], ['Já recebido', data.balance.paid_out_cents]].map(([label, amount]) => <Card key={String(label)}><span className="kd-fin-bal__label">{label}</span><strong className="kd-fin-bal__value">{money(Number(amount))}</strong></Card>)}
    </div>
    <Card><CardHead title="Solicitar saque" /><p>O saque é sempre integral. O valor disponível será reservado até a análise do KARDAP.</p><TextField label="Chave Pix de destino" value={pixKey} onChange={(event) => setPixKey(event.target.value)} placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória" /><div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}><Button icon={<CircleDollarSign size={16} />} onClick={withdraw} loading={saving} disabled={!data.balance.available_cents}>Solicitar {money(data.balance.available_cents)}</Button>{next && <small><Clock3 size={13} /> Próximo saque disponível em {new Date(next).toLocaleDateString('pt-BR')}</small>}</div></Card>
    <Card><CardHead title="Vendas online" /><div className="kd-table-scroll"><table className="kd-data-table"><thead><tr><th>Pagamento</th><th>Liberação</th><th>Status</th><th style={{ textAlign: 'right' }}>Líquido</th></tr></thead><tbody>{data.transactions.map((transaction) => <tr key={transaction.id}><td>{transaction.confirmed_at ? new Date(transaction.confirmed_at).toLocaleDateString('pt-BR') : '—'}</td><td>{transaction.release_at ? new Date(transaction.release_at).toLocaleDateString('pt-BR') : '—'}</td><td>{transaction.released_at ? 'Disponível' : transaction.settlement_status === 'liquidado' ? 'Em carência' : 'Aguardando liquidação'}</td><td style={{ textAlign: 'right' }}>{money(transaction.restaurant_net_cents)}</td></tr>)}{!data.transactions.length && <tr><td colSpan={4}>Nenhuma venda online registrada.</td></tr>}</tbody></table></div></Card>
  </section>;
}
