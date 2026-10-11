"use client";

import { Check, Minus } from "lucide-react";
import { PLAN_COMPARISON, PLANS } from "@/lib/cakto/plans";
import type { BillingCycle, PlanId } from "@/lib/cakto/types";
import { Badge, Segmented } from "@/components/ui/primitives";

export const PLAN_ORDER: PlanId[] = ["essencial", "pro"];

/** Diferenças que mais pesam na escolha, mostradas dentro de cada cartão. */
const HIGHLIGHTS: Record<PlanId, string[]> = {
  essencial: ["Cardápio com fotos e vídeos curtos", "QR Code por mesa e chamar garçom", "Até 30 mesas"],
  pro: ["Tudo do Essencial", "Mesas ilimitadas", "Pedir a conta pelo cardápio", "Relatórios de chamados"],
};

export function CycleToggle({ cycle, onChange }: { cycle: BillingCycle; onChange: (cycle: BillingCycle) => void }) {
  return (
    <Segmented
      label="Ciclo de cobrança"
      value={cycle}
      onChange={onChange}
      options={[
        { value: "monthly", label: "Mensal" },
        { value: "annual", label: "Anual · 20% menos" },
      ]}
    />
  );
}

/**
 * Cartão de plano. Ordem de importância: nome e preço, depois o que diferencia o plano,
 * por último a ação. Quando o cartão é o plano atual, o selo substitui a ação.
 */
export function PlanCard({
  planId,
  cycle,
  current = false,
  action,
  index = 0,
}: {
  planId: PlanId;
  cycle: BillingCycle;
  current?: boolean;
  action?: React.ReactNode;
  index?: number;
}) {
  const plan = PLANS[planId];
  const price = cycle === "annual" ? plan.prices.annual : plan.prices.monthly;
  return (
    <article className={`kd-plan k-enter ${current ? "is-current" : ""}`} style={{ "--k-i": index } as React.CSSProperties} aria-label={`Plano ${plan.name}`}>
      <header className="kd-plan-head">
        <h3 className="kd-plan-name">{plan.name}</h3>
        {current && <Badge tone="ink">Seu plano</Badge>}
      </header>
      <p className="kd-plan-tagline">{plan.tagline}</p>
      <p className="kd-plan-price kd-num">
        <b>{price.display}</b>
        <span>{cycle === "annual" ? "por ano" : "por mês"}</span>
      </p>
      <p className="kd-plan-note">
        {cycle === "annual" ? `Equivale a ${plan.prices.annual.equivalentMonthlyDisplay} por mês, cobrado uma vez por ano.` : "Cobrança automática todo mês."}
      </p>
      <ul className="kd-plan-features">
        {HIGHLIGHTS[planId].map((item) => (
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

/** Tabela comparativa: cada linha é um recurso, cada coluna um plano. */
export function PlanComparison({ caption = "Comparativo dos planos" }: { caption?: string }) {
  return (
    <div className="kd-table-scroll">
      <table className="kd-compare">
        <caption className="kd-sr">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Recurso</th>
            {PLAN_ORDER.map((id) => (
              <th key={id} scope="col">
                {PLANS[id].name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PLAN_COMPARISON.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td>
                <Cell value={row.essencial} />
              </td>
              <td>
                <Cell value={row.pro} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
