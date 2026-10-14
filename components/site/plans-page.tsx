"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PLAN_CATALOG, PLAN_ORDER, TRIAL_DAYS, planRank, type Entitlements, type PlanId } from "@/lib/billing/plans";
import { PlanCard, PlanComparison } from "@/components/plans/plan-cards";
import { EnterpriseContact, MY_PLAN_PATH } from "@/components/billing/widgets";
import { PLANS_FAQ } from "@/lib/plans-faq";
import { SiteFooter, SiteHeader } from "./site-chrome";

/** Plano atual de quem está logado (para "Plano atual", "Fazer upgrade" e "Alterar plano"). Sem login: null. */
function useCurrentPlan(session: boolean) {
  const [current, setCurrent] = useState<Entitlements | null>(null);
  useEffect(() => {
    if (!session) return;
    let alive = true;
    (async () => {
      try {
        const restaurantId = localStorage.getItem("kardap-restaurant-id");
        if (!restaurantId || restaurantId === "unassigned") return;
        const { getFirebaseAuth } = await import("@/lib/auth");
        const auth = getFirebaseAuth();
        await auth.authStateReady();
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const res = await fetch(`/api/billing/entitlements?restaurantId=${encodeURIComponent(restaurantId)}`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok && alive) setCurrent((await res.json()).entitlements);
      } catch {
        // Sem a informação, os botões ficam no modo genérico (levam a Meu Plano).
      }
    })();
    return () => {
      alive = false;
    };
  }, [session]);
  return current;
}

export default function PlansPage({ session }: { session: boolean }) {
  const [enterprise, setEnterprise] = useState(false);
  const current = useCurrentPlan(session);
  const paying = Boolean(current && current.valid && !current.implicitTrial && current.status !== "trialing");

  const action = (id: PlanId) => {
    const plan = PLAN_CATALOG[id];
    if (plan.salesOnly && !(paying && current?.planId === id)) {
      return (
        <button type="button" className="kd-btn kd-btn--block kd-btn--secondary" onClick={() => setEnterprise(true)}>
          <span>Falar com vendas</span>
        </button>
      );
    }
    if (!session) {
      return (
        <Link href={`/criar-conta?plano=${id}`} className={`kd-btn kd-btn--block ${plan.popular ? "kd-btn--primary" : "kd-btn--secondary"}`}>
          <span>Assinar</span>
        </Link>
      );
    }
    if (paying && current?.planId === id) {
      return (
        <span className="kd-btn kd-btn--block kd-btn--secondary is-static" aria-disabled="true">
          <span>Plano atual</span>
        </span>
      );
    }
    const label = !paying || !current ? "Assinar" : planRank(id) > planRank(current.planId) ? "Fazer upgrade" : "Alterar plano";
    return (
      <Link href={`${MY_PLAN_PATH}#planos`} className={`kd-btn kd-btn--block ${plan.popular || label === "Fazer upgrade" ? "kd-btn--primary" : "kd-btn--secondary"}`}>
        <span>{label}</span>
      </Link>
    );
  };

  return (
    <div className="kd-site kd-pricing">
      <SiteHeader session={session} />
      <main className="kd-site-main">
        <section className="kd-plans-hero" aria-labelledby="planos-title">
          <p className="kd-overline">Planos KARDAP</p>
          <h1 id="planos-title" className="kd-display">
            Do cardápio em vídeo à operação completa
          </h1>
          <p className="kd-lead">
            Comece com o cardápio digital estilo Reels e cresça para o PDV com pedidos, caixa, estoque, entregas e relatórios. Pedidos de iFood e outros
            marketplaces nunca contam no limite.
          </p>
          <div className="kd-plans-hero-actions">
            {session ? (
              <Link href={MY_PLAN_PATH} className="kd-btn kd-btn--primary kd-btn--lg">
                <span>Ver meu plano</span>
                <ArrowRight size={18} aria-hidden />
              </Link>
            ) : (
              <Link href="/criar-conta" className="kd-btn kd-btn--primary kd-btn--lg">
                <span>Começar {TRIAL_DAYS} dias grátis</span>
                <ArrowRight size={18} aria-hidden />
              </Link>
            )}
            {!session && <p className="kd-muted">Sem cartão de crédito. Sem fidelidade.</p>}
          </div>
        </section>

        <section className="kd-plans-section" aria-labelledby="planos-precos">
          <h2 id="planos-precos" className="kd-h2">
            Preços
          </h2>
          <div className="kd-plans kd-plans--4">
            {PLAN_ORDER.map((id, i) => (
              <PlanCard key={id} planId={id} index={i} current={paying && current?.planId === id} action={action(id)} />
            ))}
          </div>
          <p className="kd-plans-note">
            Valores mensais. Pedidos próprios são os criados no KARDAP (PDV, mesa, delivery, retirada e equipe); cada pedido confirmado conta uma vez. A
            franquia renova no dia 1º de cada mês.{!session && ` Toda conta nova começa com ${TRIAL_DAYS} dias grátis do Pro.`}
          </p>
        </section>

        <section className="kd-plans-section" aria-labelledby="planos-comparativo">
          <h2 id="planos-comparativo" className="kd-h2">
            O que cada plano inclui
          </h2>
          <div className="kd-card kd-card--flush">
            <PlanComparison current={paying ? current?.planId : null} />
          </div>
        </section>

        <section className="kd-plans-section" aria-labelledby="planos-duvidas">
          <h2 id="planos-duvidas" className="kd-h2">
            Dúvidas frequentes
          </h2>
          <div className="kd-faq">
            {PLANS_FAQ.map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter cta={!session} />
      {enterprise && <EnterpriseContact onClose={() => setEnterprise(false)} />}
    </div>
  );
}
