"use client";

import { Check, Minus } from "lucide-react";
import { PLAN_CATALOG, PLAN_COMPARISON, PLAN_ORDER, shortPlanName, type PlanId } from "@/lib/billing/plans";
import { brl } from "@/lib/format";
import { Badge, type BadgeTone } from "@/components/ui/primitives";

export { PLAN_ORDER };

/**
 * Cartão de plano. Ordem de importância: nome e preço, depois o que diferencia o plano, por último a ação.
 * O Business recebe o selo "Mais popular"; o plano atual, o selo "Seu plano".
 */
export function PlanCard({
  planId,
  current = false,
  action,
  index = 0,
  note,
}: {
  planId: PlanId;
  current?: boolean;
  action?: React.ReactNode;
  index?: number;
  note?: React.ReactNode;
}) {
  const plan = PLAN_CATALOG[planId];
  return (
    <article
      className={`kd-plan k-enter ${current ? "is-current" : ""} ${plan.popular ? "is-popular" : ""}`}
      style={{ "--k-i": index } as React.CSSProperties}
      aria-label={`Plano ${plan.name}${plan.popular ? ", mais popular" : ""}`}
    >
      {plan.popular && <span className="kd-plan-ribbon">Mais popular</span>}
      <header className="kd-plan-head">
        <h3 className="kd-plan-name">
          <span className="kd-plan-brand">KARDAP</span> {shortPlanName(planId)}
        </h3>
        {current && <Badge tone="ink">Seu plano</Badge>}
      </header>
      <p className="kd-plan-tagline">{plan.tagline}</p>
      <p className="kd-plan-price kd-num">
        {plan.priceInCents === null ? (
          <b className="kd-plan-price-text">Sob consulta</b>
        ) : (
          <>
            <b>{brl(plan.priceInCents)}</b>
            <span>/mês</span>
          </>
        )}
      </p>
      <p className="kd-plan-note">{note ?? (plan.salesOnly ? "Proposta conforme o tamanho da operação." : "Cobrança mensal automática. Sem fidelidade.")}</p>
      <ul className="kd-plan-features">
        {plan.highlights.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {action && <div className="kd-plan-action">{action}</div>}
    </article>
  );
}

function Cell({ value }: { value: string | boolean }) {
  if (value === true)
    return (
      <span className="kd-compare-yes">
        <Check size={16} strokeWidth={2.6} aria-hidden />
        <span className="kd-sr">Incluído</span>
      </span>
    );
  if (value === false)
    return (
      <span className="kd-compare-no">
        <Minus size={16} aria-hidden />
        <span className="kd-sr">Não incluído</span>
      </span>
    );
  return <span className="kd-compare-text">{value}</span>;
}

/** Tabela comparativa: cada linha é um recurso ou limite, cada coluna um plano. */
export function PlanComparison({ caption = "Comparativo dos planos", current }: { caption?: string; current?: PlanId | null }) {
  return (
    <div className="kd-table-scroll">
      <table className="kd-compare kd-compare--4">
        <caption className="kd-sr">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Recurso</th>
            {PLAN_ORDER.map((id) => (
              <th key={id} scope="col" className={id === current ? "is-current" : PLAN_CATALOG[id].popular ? "is-popular" : undefined}>
                {shortPlanName(id)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PLAN_COMPARISON.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              {PLAN_ORDER.map((id) => (
                <td key={id}>
                  <Cell value={row.values[id]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const STATUS_BADGE: Record<string, { label: string; tone: BadgeTone }> = {
  trialing: { label: "Teste grátis", tone: "signal" },
  active: { label: "Ativa", tone: "success" },
  past_due: { label: "Pagamento pendente", tone: "danger" },
  canceled: { label: "Cancelada", tone: "outline" },
  expired: { label: "Expirada", tone: "outline" },
  suspended: { label: "Suspensa", tone: "danger" },
};

/** Selo do plano atual com a situação ("KARDAP Pro · Ativa"). */
export function CurrentPlanBadge({ planId, status, valid }: { planId: PlanId; status: string; valid: boolean }) {
  const meta = !valid && status === "trialing" ? { label: "Teste encerrado", tone: "outline" as BadgeTone } : STATUS_BADGE[status] || STATUS_BADGE.expired;
  return (
    <span className="kd-current-plan">
      <Badge tone="ink">{shortPlanName(planId)}</Badge>
      <Badge tone={meta.tone}>{meta.label}</Badge>
    </span>
  );
}

/** Situação da assinatura em linguagem do dono do restaurante. */
export function SubscriptionStatus({ status, valid }: { status: string; valid: boolean }) {
  const meta = !valid && status === "trialing" ? { label: "Teste encerrado", tone: "outline" as BadgeTone } : STATUS_BADGE[status] || STATUS_BADGE.expired;
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}
