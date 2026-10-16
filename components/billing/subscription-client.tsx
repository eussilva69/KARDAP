"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getFirebaseAuth } from "@/lib/auth";
import { isFirebaseConfigured } from "@/lib/firebase";

type Subscription = {
  planId: string;
  period: "monthly" | "yearly";
  status: string;
  caktoSubscriptionId?: string | null;
  amount?: string | number | null;
  startedAt?: string | null;
  currentPeriodEnd?: string | null;
  nextPaymentDate?: string | null;
  canceledAt?: string | null;
};

type Payment = {
  orderId: string;
  status: string;
  amount?: string | number | null;
  method?: string | null;
  createdAt: string;
  event: string;
};

type ApiResponse = {
  subscription: Subscription | null;
  plan: { id: string; name: string; tagline: string; features: string[] } | null;
  payments: Payment[];
  hasPaidAccess: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Aguardando pagamento",
  active: "Ativa",
  trial: "Em teste",
  past_due: "Pagamento pendente",
  paused: "Pausada",
  canceled: "Cancelada",
  expired: "Expirada",
  inactive: "Inativa",
};

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("pt-BR"); } catch { return "—"; }
}

export default function SubscriptionClient() {
  const [state, setState] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelDialog, setCancelDialog] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setError("Firebase não configurado neste ambiente.");
      setLoading(false);
      return;
    }
    const unsub = getFirebaseAuth().onAuthStateChanged(async (user) => {
      if (!user) {
        setError("Faça login para ver sua assinatura.");
        setLoading(false);
        return;
      }
      await load();
    });
    return unsub;
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const token = await getFirebaseAuth().currentUser?.getIdToken();
      if (!token) throw new Error("Sessão expirada.");
      const response = await fetch("/api/billing/subscription", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Falha ao carregar");
      setState(data as ApiResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar");
    } finally {
      setLoading(false);
    }
  }

  async function cancelSubscription() {
    setWorking(true);
    setError(null);
    try {
      const token = await getFirebaseAuth().currentUser?.getIdToken();
      const response = await fetch("/api/billing/subscription/cancel", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Falha ao cancelar");
      setCancelDialog(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao cancelar");
    } finally {
      setWorking(false);
    }
  }

  const sub = state?.subscription;
  const plan = state?.plan;

  return (
    <main className="min-h-screen bg-[#0b1020] text-[#f4ead3] px-6 py-12">
      <div className="mx-auto max-w-4xl">
        <nav className="mb-10 flex items-center justify-between text-sm">
          <Link href="/" className="opacity-70 hover:opacity-100">← Kardap</Link>
          <Link href="/planos" className="opacity-70 hover:opacity-100">Ver planos</Link>
        </nav>
        <h1 className="text-3xl font-semibold tracking-tight">Minha assinatura</h1>

        {loading && <p className="mt-8 opacity-70">Carregando…</p>}

        {error && !loading && (
          <p className="mt-8 rounded border border-red-700 bg-red-900/20 p-3 text-sm text-red-200">{error}</p>
        )}

        {!loading && state && !sub && (
          <div className="mt-10 rounded-2xl border border-[#1a2234] bg-[#0d1424] p-8 text-center">
            <p className="opacity-80">Você ainda não tem uma assinatura.</p>
            <Link href="/planos" className="mt-6 inline-block rounded-lg bg-[#f0c35a] px-5 py-3 text-sm font-semibold text-[#0b1020]">Conhecer planos</Link>
          </div>
        )}

        {!loading && sub && plan && (
          <div className="mt-8 grid gap-6">
            <section className="rounded-2xl border border-[#1a2234] bg-[#0d1424] p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wider opacity-60">Plano atual</p>
                  <h2 className="mt-1 text-2xl font-semibold">{plan.name}</h2>
                  <p className="mt-1 text-sm opacity-70">{plan.tagline}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${sub.status === "active" || sub.status === "trial" ? "bg-emerald-900/40 text-emerald-200" : sub.status === "past_due" ? "bg-amber-900/40 text-amber-200" : "bg-neutral-800 text-neutral-200"}`}>
                  {STATUS_LABEL[sub.status] || sub.status}
                </span>
              </div>
              <dl className="mt-6 grid gap-4 sm:grid-cols-2 text-sm">
                <div><dt className="opacity-60">Periodicidade</dt><dd className="mt-1">{sub.period === "yearly" ? "Anual" : "Mensal"}</dd></div>
                <div><dt className="opacity-60">Valor</dt><dd className="mt-1">{sub.amount ? `R$ ${sub.amount}` : "—"}</dd></div>
                <div><dt className="opacity-60">Início</dt><dd className="mt-1">{formatDate(sub.startedAt)}</dd></div>
                <div><dt className="opacity-60">Próxima cobrança</dt><dd className="mt-1">{formatDate(sub.nextPaymentDate)}</dd></div>
                <div><dt className="opacity-60">Fim do período pago</dt><dd className="mt-1">{formatDate(sub.currentPeriodEnd)}</dd></div>
                <div><dt className="opacity-60">Cancelada em</dt><dd className="mt-1">{formatDate(sub.canceledAt)}</dd></div>
              </dl>
              <div className="mt-6 flex flex-wrap gap-3">
                {(sub.status === "active" || sub.status === "trial" || sub.status === "past_due") && (
                  <button type="button" onClick={() => setCancelDialog(true)} className="rounded-lg border border-red-700 px-4 py-2 text-sm text-red-200 hover:bg-red-900/20">Cancelar assinatura</button>
                )}
                {(sub.status === "canceled" || sub.status === "expired" || sub.status === "inactive") && (
                  <Link href="/planos" className="rounded-lg bg-[#f0c35a] px-4 py-2 text-sm font-semibold text-[#0b1020]">Contratar novamente</Link>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-[#1a2234] bg-[#0d1424] p-6">
              <h3 className="text-lg font-semibold">Histórico de pagamentos</h3>
              {state.payments.length === 0 ? (
                <p className="mt-3 text-sm opacity-70">Ainda não há pagamentos registrados.</p>
              ) : (
                <table className="mt-4 w-full text-sm">
                  <thead className="text-left opacity-60">
                    <tr><th className="py-2">Data</th><th>Evento</th><th>Status</th><th className="text-right">Valor</th></tr>
                  </thead>
                  <tbody>
                    {state.payments.map((p) => (
                      <tr key={p.orderId} className="border-t border-[#1a2234]">
                        <td className="py-2">{formatDate(p.createdAt)}</td>
                        <td>{p.event}</td>
                        <td>{p.status}</td>
                        <td className="text-right">{p.amount ? `R$ ${p.amount}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        )}
      </div>

      {cancelDialog && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#0d1424] p-6 border border-[#1a2234]">
            <h3 className="text-lg font-semibold">Cancelar assinatura?</h3>
            <p className="mt-2 text-sm opacity-80">
              O acesso premium continua disponível até o fim do período já pago. Após isso, as funcionalidades pagas serão limitadas.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setCancelDialog(false)} className="rounded-lg border border-[#1a2234] px-4 py-2 text-sm">Voltar</button>
              <button type="button" disabled={working} onClick={cancelSubscription} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {working ? "Cancelando…" : "Confirmar cancelamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
