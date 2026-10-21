"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Clock, LoaderCircle, Plus, XCircle } from "lucide-react";
import { getFirebaseAuth } from "@/lib/auth";
import { brl } from "@/lib/format";
import type { Payout, RestaurantBalance } from "@/lib/financial/types";
import { Button, Card, CardHead, TextField, TextArea } from "@/components/ui";
import type { Notify } from "@/components/dashboard/types";

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

const centsToReal = (cents: number) => brl(cents / 100);

// ─── Badge de status ──────────────────────────────────────────────────────

const PAYOUT_STATUS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  pendente: { label: "Pendente", icon: <Clock size={14} />, color: "var(--k-warning-ink)" },
  em_processamento: { label: "Em processamento", icon: <LoaderCircle size={14} className="k-spin" />, color: "var(--k-ink)" },
  concluido: { label: "Concluído", icon: <CheckCircle2 size={14} />, color: "var(--k-success-ink)" },
  falhou: { label: "Falhou", icon: <AlertCircle size={14} />, color: "var(--k-danger-ink)" },
  cancelado: { label: "Cancelado", icon: <XCircle size={14} />, color: "var(--k-muted)" },
};

function PayoutStatusBadge({ status }: { status: string }) {
  const meta = PAYOUT_STATUS[status] || { label: status, icon: null, color: "var(--k-muted)" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: meta.color, fontWeight: 500 }}>
      {meta.icon}
      {meta.label}
    </span>
  );
}

// ─── Modal de confirmação ─────────────────────────────────────────────────

function ConfirmPayoutModal({
  payout,
  onClose,
  onConfirm,
}: {
  payout: Payout;
  onClose: () => void;
  onConfirm: (data: { gateway_transfer_id?: string; receipt_reference?: string; notes?: string }) => Promise<void>;
}) {
  const [transferId, setTransferId] = useState("");
  const [receipt, setReceipt] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!transferId && !receipt) {
      setError("Informe o ID da transferência bancária ou anexe um comprovante.");
      return;
    }
    setSaving(true);
    try {
      await onConfirm({ gateway_transfer_id: transferId || undefined, receipt_reference: receipt || undefined, notes: notes || undefined });
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="kd-modal-overlay" onClick={onClose}>
      <div className="kd-modal kd-fin-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="kd-modal-title">Confirmar repasse</h2>
        <p style={{ color: "var(--k-muted)", marginBottom: 20 }}>
          Repasse de <strong>{centsToReal(payout.amount_cents)}</strong> para restaurante <code>{payout.restaurant_id}</code>.
          <br />
          <strong>O repasse não será marcado como concluído sem comprovação bancária.</strong>
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <TextField
            label="ID da transferência bancária (obrigatório se sem comprovante)"
            value={transferId}
            onChange={(e) => setTransferId(e.target.value)}
            placeholder="ex: E0000000020261019..."
          />
          <TextField
            label="Referência do comprovante"
            value={receipt}
            onChange={(e) => setReceipt(e.target.value)}
            placeholder="ex: número do protocolo ou URL"
          />
          <TextArea
            label="Observações (opcional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>

        {error && (
          <p className="kd-form-error" style={{ marginTop: 12 }}>
            <AlertCircle size={13} style={{ marginRight: 4, verticalAlign: "middle" }} />
            {error}
          </p>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} loading={saving}>Confirmar repasse</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal de novo repasse ────────────────────────────────────────────────

function NewPayoutModal({
  restaurantId,
  available,
  onClose,
  onCreated,
}: {
  restaurantId: string;
  available: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    const amountCents = Math.round(Number(amount.replace(",", ".")) * 100);
    if (!amountCents || amountCents <= 0) { setError("Informe um valor válido."); return; }
    if (amountCents > available) { setError(`Valor superior ao disponível (${centsToReal(available)}).`); return; }

    setSaving(true);
    try {
      await apiFetch("/api/financial/payouts", {
        method: "POST",
        body: JSON.stringify({ restaurant_id: restaurantId, amount_cents: amountCents, pix_key: pixKey || undefined, notes: notes || undefined }),
      });
      onCreated();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="kd-modal-overlay" onClick={onClose}>
      <div className="kd-modal kd-fin-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="kd-modal-title">Novo repasse</h2>
        <p style={{ color: "var(--k-muted)", marginBottom: 20 }}>
          Saldo disponível: <strong className="kd-fin-amt--net">{centsToReal(available)}</strong>
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <TextField
            label="Valor a repassar (R$)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="ex: 150,00"
          />
          <TextField
            label="Chave Pix (opcional)"
            value={pixKey}
            onChange={(e) => setPixKey(e.target.value)}
            placeholder="CPF, CNPJ, e-mail ou aleatória"
          />
          <TextArea
            label="Observações"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>

        {error && (
          <p className="kd-form-error" style={{ marginTop: 12 }}>
            <AlertCircle size={13} style={{ marginRight: 4, verticalAlign: "middle" }} />
            {error}
          </p>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} loading={saving}>Criar repasse</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────

export function FinancialPayouts({
  restaurantId,
  notify,
  showAll = false,
}: {
  restaurantId?: string;
  notify: Notify;
  showAll?: boolean;
}) {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [balance, setBalance] = useState<RestaurantBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmPayout, setConfirmPayout] = useState<Payout | null>(null);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (restaurantId) params.set("restaurant_id", restaurantId);
      params.set("limit", "100");

      const [{ payouts: p }, bal] = await Promise.all([
        apiFetch<{ payouts: Payout[] }>(`/api/financial/payouts?${params}`),
        restaurantId
          ? apiFetch<{ balance: RestaurantBalance }>(`/api/financial/balances?restaurant_id=${restaurantId}`)
          : Promise.resolve({ balance: null }),
      ]);
      setPayouts(p);
      setBalance(bal.balance);
    } catch (e: any) {
      notify(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, [restaurantId, notify]);

  useEffect(() => {
    load();
  }, [load]);

  const handleConfirm = async (data: { gateway_transfer_id?: string; receipt_reference?: string; notes?: string }) => {
    if (!confirmPayout) return;
    await apiFetch("/api/financial/payouts?action=confirm", {
      method: "POST",
      body: JSON.stringify({ payout_id: confirmPayout.id, ...data }),
    });
    notify("Repasse confirmado.");
    load();
  };

  const handleCancel = async (payoutId: string) => {
    if (!confirm("Confirmar cancelamento do repasse?")) return;
    try {
      await apiFetch("/api/financial/payouts?action=cancel", {
        method: "POST",
        body: JSON.stringify({ payout_id: payoutId, reason: "Cancelado pelo administrador." }),
      });
      notify("Repasse cancelado.");
      load();
    } catch (e: any) {
      notify(e.message, "error");
    }
  };

  return (
    <>
      {/* Saldo do restaurante */}
      {balance && (
        <div className="kd-fin__balance-grid" style={{ marginBottom: 20 }}>
          <div className="kd-fin-bal">
            <span className="kd-fin-bal__label">Pendente</span>
            <span className="kd-fin-bal__value" style={{ color: "var(--k-warning-ink)" }}>{centsToReal(balance.pending_cents)}</span>
          </div>
          <div className="kd-fin-bal">
            <span className="kd-fin-bal__label">Disponível</span>
            <span className="kd-fin-bal__value kd-fin-amt--net">{centsToReal(balance.available_cents)}</span>
          </div>
          <div className="kd-fin-bal">
            <span className="kd-fin-bal__label">Reservado</span>
            <span className="kd-fin-bal__value">{centsToReal(balance.reserved_cents)}</span>
          </div>
          <div className="kd-fin-bal">
            <span className="kd-fin-bal__label">Total repassado</span>
            <span className="kd-fin-bal__value">{centsToReal(balance.paid_out_cents)}</span>
          </div>
        </div>
      )}

      <Card>
        <CardHead
          title={showAll ? "Todos os repasses" : "Repasses"}
          action={
            restaurantId && balance && balance.available_cents > 0 ? (
              <Button size="sm" icon={<Plus size={14} />} onClick={() => setShowNew(true)}>
                Novo repasse
              </Button>
            ) : undefined
          }
        />

        {loading ? (
          <div className="kd-fin-loading" style={{ padding: 24 }}>
            <LoaderCircle className="k-spin" size={20} />
            <span>Carregando repasses…</span>
          </div>
        ) : payouts.length === 0 ? (
          <p style={{ padding: "16px 20px", color: "var(--k-muted)" }}>Nenhum repasse registrado.</p>
        ) : (
          <div className="kd-table-scroll">
            <table className="kd-data-table kd-fin-table">
              <thead>
                <tr>
                  <th>Data</th>
                  {showAll && <th>Restaurante</th>}
                  <th style={{ textAlign: "right" }}>Valor</th>
                  <th>Status</th>
                  <th>Chave Pix</th>
                  <th>Transferência</th>
                  <th>Criado por</th>
                  <th>Concluído em</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{new Date(p.created_at).toLocaleDateString("pt-BR")}</td>
                    {showAll && (
                      <td>
                        <code style={{ fontSize: 11 }}>{p.restaurant_id.slice(0, 12)}…</code>
                      </td>
                    )}
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{centsToReal(p.amount_cents)}</td>
                    <td><PayoutStatusBadge status={p.status} /></td>
                    <td style={{ fontSize: 12, color: "var(--k-muted)" }}>{p.pix_key_reference || "—"}</td>
                    <td style={{ fontSize: 12, color: "var(--k-muted)" }}>{p.gateway_transfer_id || "—"}</td>
                    <td style={{ fontSize: 12, color: "var(--k-muted)" }}>{p.created_by}</td>
                    <td style={{ fontSize: 12, color: "var(--k-muted)" }}>
                      {p.completed_at ? new Date(p.completed_at).toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td>
                      {(p.status === "pendente" || p.status === "em_processamento") && (
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            className="kd-btn kd-btn--primary kd-btn--sm"
                            onClick={() => setConfirmPayout(p)}
                            title="Confirmar repasse"
                          >
                            Confirmar
                          </button>
                          <button
                            className="kd-btn kd-btn--ghost kd-btn--sm is-destructive"
                            onClick={() => handleCancel(p.id)}
                            title="Cancelar repasse"
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {confirmPayout && (
        <ConfirmPayoutModal
          payout={confirmPayout}
          onClose={() => setConfirmPayout(null)}
          onConfirm={handleConfirm}
        />
      )}

      {showNew && balance && restaurantId && (
        <NewPayoutModal
          restaurantId={restaurantId}
          available={balance.available_cents}
          onClose={() => setShowNew(false)}
          onCreated={load}
        />
      )}
    </>
  );
}
