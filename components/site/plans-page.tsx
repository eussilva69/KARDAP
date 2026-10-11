"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { BillingCycle } from "@/lib/cakto/types";
import { TRIAL_DAYS } from "@/lib/cakto/access";
import { PLANS } from "@/lib/cakto/plans";
import { CycleToggle, PLAN_ORDER, PlanCard, PlanComparison } from "@/components/plans/plan-cards";
import { SiteFooter, SiteHeader } from "./site-chrome";

/** Perguntas respondidas com o que já está nos Termos de Uso e no fluxo de assinatura. */
const FAQ = [
  {
    q: "Como funciona o teste grátis?",
    a: `Ao criar a conta, o restaurante usa tudo do plano Pro por ${TRIAL_DAYS} dias, sem cartão de crédito. Depois você escolhe o plano no painel, em Assinatura.`,
  },
  {
    q: "Tem fidelidade?",
    a: "Não. Você cancela pelo painel quando quiser e continua com acesso até o fim do período já pago, sem multa.",
  },
  {
    q: "Quais formas de pagamento?",
    a: "Cartão de crédito, Pix Automático ou Pix a cada cobrança. Os pagamentos são processados pela Cakto; o Kardap não guarda dados do cartão.",
  },
  {
    q: "Posso trocar de plano depois?",
    a: "Sim. Em Assinatura, no painel, você contrata o outro plano a qualquer momento.",
  },
];

export default function PlansPage({ session }: { session: boolean }) {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const cta = session ? (
    <Link href="/dashboard/assinatura" className="kd-btn kd-btn--primary kd-btn--lg">
      <span>Ver minha assinatura</span>
      <ArrowRight size={18} aria-hidden />
    </Link>
  ) : (
    <Link href="/criar-conta" className="kd-btn kd-btn--primary kd-btn--lg">
      <span>Começar {TRIAL_DAYS} dias grátis</span>
      <ArrowRight size={18} aria-hidden />
    </Link>
  );

  return (
    <div className="kd-site">
      <SiteHeader session={session} />
      <main className="kd-site-main">
        <section className="kd-plans-hero" aria-labelledby="planos-title">
          <p className="kd-overline">Planos</p>
          <h1 id="planos-title" className="kd-display">
            Um plano para o tamanho do seu salão
          </h1>
          <p className="kd-lead">
            Os dois planos têm cardápio com fotos e vídeos, QR Code por mesa e chamados de garçom em tempo real. O teste de {TRIAL_DAYS} dias
            inclui tudo do Pro.
          </p>
          <div className="kd-plans-hero-actions">
            {cta}
            {!session && <p className="kd-muted">Sem cartão de crédito. Sem fidelidade.</p>}
          </div>
        </section>

        <section className="kd-plans-section" aria-labelledby="planos-precos">
          <div className="kd-section-head">
            <h2 id="planos-precos" className="kd-h2">
              Preços
            </h2>
            <CycleToggle cycle={cycle} onChange={setCycle} />
          </div>
          <div className="kd-plans">
            {PLAN_ORDER.map((id, i) => (
              <PlanCard
                key={id}
                planId={id}
                cycle={cycle}
                index={i}
                action={
                  <Link
                    href={session ? "/dashboard/assinatura" : "/criar-conta"}
                    className={`kd-btn kd-btn--block ${id === "pro" ? "kd-btn--primary" : "kd-btn--secondary"}`}
                  >
                    {session ? `Assinar o ${PLANS[id].name}` : `Começar com ${TRIAL_DAYS} dias grátis`}
                  </Link>
                }
              />
            ))}
          </div>
          {!session && (
            <p className="kd-plans-note">
              O teste libera tudo do Pro por {TRIAL_DAYS} dias. No fim, você escolhe o plano no painel; nada é cobrado antes disso.
            </p>
          )}
        </section>

        <section className="kd-plans-section" aria-labelledby="planos-comparativo">
          <h2 id="planos-comparativo" className="kd-h2">
            O que cada plano inclui
          </h2>
          <div className="kd-card kd-card--flush">
            <PlanComparison />
          </div>
        </section>

        <section className="kd-plans-section" aria-labelledby="planos-duvidas">
          <h2 id="planos-duvidas" className="kd-h2">
            Dúvidas frequentes
          </h2>
          <div className="kd-faq">
            {FAQ.map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

      </main>
      <SiteFooter cta={!session} />
    </div>
  );
}
