"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, CardHead } from "@/components/ui";
import { getFirebaseAuth } from "@/lib/auth";
import { brl } from "@/lib/format";
import type { WithdrawalRequest } from "@/lib/financial/types";
import type { Notify } from "@/components/dashboard/types";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const user = getFirebaseAuth().currentUser;
  const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user?.getIdToken()}`, ...(init?.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error || "Erro ao processar saque.");
  return data as T;
}

export function FinancialWithdrawals({ notify }: { notify: Notify }) {
  const [items, setItems] = useState<WithdrawalRequest[]>([]);
  const load = useCallback(async () => { try { setItems((await api<{ withdrawals: WithdrawalRequest[] }>("/api/financial/withdrawals")).withdrawals); } catch (error) { notify(error instanceof Error ? error.message : "Erro ao carregar saques.", "error"); } }, [notify]);
  useEffect(() => { load(); }, [load]);
  const act = async (withdrawal_id: string, action: "approve" | "reject" | "pay") => {
    const reason = action === "reject" ? prompt("Motivo obrigatório da reprovação:") : undefined;
    if (action === "reject" && !reason?.trim()) return;
    const transfer_transaction_id = action === "pay" ? prompt("ID da transferência Mercado Pago: ") : undefined;
    if (action === "pay" && !transfer_transaction_id?.trim()) return;
    try { await api("/api/financial/withdrawals", { method: "POST", body: JSON.stringify({ withdrawal_id, action, reason, transfer_transaction_id }) }); notify("Saque atualizado."); load(); } catch (error) { notify(error instanceof Error ? error.message : "Erro ao atualizar saque.", "error"); }
  };
  return <Card><CardHead title="Solicitações de saque" /><div className="kd-table-scroll"><table className="kd-data-table"><thead><tr><th>Restaurante</th><th>Solicitado</th><th>Pix</th><th>Status</th><th>Data</th><th /></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><code>{item.restaurant_id}</code></td><td>{brl(item.amount_cents / 100)}</td><td>{item.pix_key_reference}</td><td>{item.status}</td><td>{new Date(item.requested_at).toLocaleDateString("pt-BR")}</td><td style={{ display: "flex", gap: 6 }}>{item.status === "pending_approval" && <><Button size="sm" onClick={() => act(item.id, "approve")}>Aprovar</Button><Button size="sm" variant="secondary" onClick={() => act(item.id, "reject")}>Reprovar</Button></>}{item.status === "approved" && <Button size="sm" onClick={() => act(item.id, "pay")}>Confirmar pagamento</Button>}</td></tr>)}{!items.length && <tr><td colSpan={6}>Nenhuma solicitação de saque.</td></tr>}</tbody></table></div></Card>;
}
