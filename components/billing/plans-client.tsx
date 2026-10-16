"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getFirebaseAuth } from "@/lib/auth";
import { isFirebaseConfigured } from "@/lib/firebase";

type PublicPlan = {
  id: string;
  name: string;
  tagline: string;
  features: string[];
  recommended: boolean;
  trialDays: number;
  offers: { period: "monthly" | "yearly"; priceCents: number; currency: string; billingLabel: string }[];
};

function trialLabel(days: number) {
  if (days > 0 && days % 30 === 0) return days === 30 ? "1 mês" : `${days / 30} meses`;
  return days === 1 ? "1 dia" : `${days} dias`;
}

function brl(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export default function PlansClient() {
  const [plans, setPlans] = useState<PublicPlan[] | null>(null);
  const [period, setPeriod] = useState<"monthly" | "yearly">("monthly");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    fetch("/api/billing/plans").then((r) => r.json()).then((data) => setPlans(data.plans)).catch(() => setError("Falha ao carregar planos."));
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const auth = getFirebaseAuth();
    const unsub = auth.onAuthStateChanged((u) => setAuthed(Boolean(u)));
    return unsub;
  }, []);

  async function startCheckout(planId: string) {
    setError(null);
    if (!authed) {
      setError("Faça login antes de contratar.");
      return;
    }
    setLoading(planId);
    try {
      const token = await getFirebaseAuth().currentUser?.getIdToken();
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ planId, period }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Falha ao iniciar checkout");
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao iniciar checkout");
      setLoading(null);
    }
  }

  const toggle = useMemo(() => (
    <div className="inline-flex rounded-full border border-[#1a2234] bg-[#0d1424] p-1 text-xs">
      <button type="button" onClick={() => setPeriod("monthly")} className={`px-4 py-2 rounded-full ${period === "monthly" ? "bg-[#f0c35a] text-[#0b1020]" : "text-[#f4ead3]/70"}`}>Mensal</button>
      <button type="button" onClick={() => setPeriod("yearly")} className={`px-4 py-2 rounded-full ${period === "yearly" ? "bg-[#f0c35a] text-[#0b1020]" : "text-[#f4ead3]/70"}`}>Anual</button>
    </div>
  ), [period]);

  return (
    <main className="min-h-screen bg-[#0b1020] text-[#f4ead3] px-6 py-12">
      <div className="mx-auto max-w-6xl">
        <nav className="mb-10 flex items-center justify-between text-sm">
          <Link href="/" className="opacity-70 hover:opacity-100">← Kardap</Link>
          <Link href="/assinatura" className="opacity-70 hover:opacity-100">Minha assinatura</Link>
        </nav>
        <header className="mb-10 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Escolha o plano Kardap</h1>
          <p className="mt-2 opacity-70">Todos os planos começam com teste grátis. Cobranças recorrentes seguras via Cakto. Cancele quando quiser.</p>
          <div className="mt-6">{toggle}</div>
        </header>

        {error && <p className="mb-6 rounded border border-red-700 bg-red-900/20 p-3 text-sm text-red-200">{error}</p>}

        {!plans ? (
          <p className="opacity-70">Carregando planos…</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-3">
            {plans.map((plan) => {
              const offer = plan.offers.find((o) => o.period === period);
              return (
                <article key={plan.id} className={`rounded-2xl border p-6 ${plan.recommended ? "border-[#f0c35a] bg-[#0f1830]" : "border-[#1a2234] bg-[#0d1424]"}`}>
                  {plan.recommended && <span className="mb-3 inline-block rounded-full bg-[#f0c35a] px-3 py-1 text-xs font-semibold text-[#0b1020]">Recomendado</span>}
                  <h2 className="text-xl font-semibold">{plan.name}</h2>
                  {plan.trialDays > 0 && (
                    <p className="mt-2 inline-block rounded-full border border-[#f0c35a]/60 px-3 py-1 text-xs font-semibold text-[#f0c35a]">
                      {trialLabel(plan.trialDays)} grátis
                    </p>
                  )}
                  <p className="mt-1 text-sm opacity-70">{plan.tagline}</p>
                  <p className="mt-6">
                    {offer ? (
                      <>
                        <span className="text-3xl font-semibold">{brl(offer.priceCents)}</span>
                        <span className="ml-2 text-sm opacity-70">{offer.billingLabel}</span>
                        {plan.trialDays > 0 && <span className="mt-1 block text-xs opacity-70">após {trialLabel(plan.trialDays)} de teste grátis</span>}
                      </>
                    ) : (
                      <span className="text-sm opacity-70">Periodicidade indisponível</span>
                    )}
                  </p>
                  <ul className="mt-6 space-y-2 text-sm">
                    {plan.features.map((f) => <li key={f} className="opacity-80">• {f}</li>)}
                  </ul>
                  <button
                    type="button"
                    disabled={!offer || loading === plan.id}
                    onClick={() => startCheckout(plan.id)}
                    className="mt-6 w-full rounded-lg bg-[#f0c35a] px-4 py-3 text-sm font-semibold text-[#0b1020] disabled:opacity-40"
                  >
                    {loading === plan.id ? "Redirecionando…" : plan.trialDays > 0 ? "Começar teste grátis" : "Assinar"}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
