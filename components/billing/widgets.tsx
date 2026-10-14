"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Check, Lock, MonitorSmartphone, Sparkles } from "lucide-react";
import { PDV_ORIGIN } from "@/lib/sso/config";
import { friendlyError } from "@/lib/async";
import { plural } from "@/lib/format";
import { toDate, type Entitlements, type FeatureKey } from "@/lib/billing/plans";
import { Button, ButtonLink, Callout, Modal, TextArea, TextField } from "@/components/ui";
import { apiError, billingFetch } from "./api";
import type { PlanUsage } from "./hooks";

export const MY_PLAN_PATH = "/dashboard/plano";
const longDate = (value: unknown) => toDate(value)?.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) || "";

/** Barra de uso com rótulo e números. `limit` null = ilimitado (sem barra). */
export function UsageProgress({ label, used, limit, unit = "", level }: { label: string; used: number; limit: number | null; unit?: string; level?: string }) {
  const percent = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const tone = level === "full" || level === "unavailable" ? "is-full" : level === "warn90" ? "is-warn90" : level === "warn70" ? "is-warn70" : "";
  return (
    <div className={`kd-usage-bar ${tone}`}>
      <div className="kd-usage-bar-head">
        <span>{label}</span>
        <b className="kd-num">{limit === null ? `${used}${unit} · ilimitado` : `${used} / ${limit}${unit}`}</b>
      </div>
      {limit !== null && limit > 0 && (
        <div className="kd-usage-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(used, limit)} aria-valuetext={`${used} de ${limit}`}>
          <span style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  );
}

/** Pedidos próprios do mês e mesas, com a data de renovação da franquia (diferente da data de cobrança). */
export function PlanUsageCard({ entitlements, usage, tablesUsed, compact = false }: { entitlements: Entitlements; usage: PlanUsage; tablesUsed: number; compact?: boolean }) {
  const ordersLimit = entitlements.limits.maxNativeOrdersPerMonth;
  const tablesLimit = entitlements.limits.maxTables;
  return (
    <div className={`kd-plan-usage ${compact ? "is-compact" : ""}`}>
      {ordersLimit === 0 ? (
        <div className="kd-usage-bar is-muted">
          <div className="kd-usage-bar-head">
            <span>Pedidos próprios</span>
            <b>Disponível a partir do Pro</b>
          </div>
        </div>
      ) : (
        <div>
          <UsageProgress label="Pedidos próprios neste mês" used={usage.used} limit={ordersLimit} level={usage.level} />
          <p className="kd-usage-foot">
            {ordersLimit === null ? "Sem limite mensal." : `${plural(usage.remaining ?? 0, "pedido restante", "pedidos restantes")}.`} Pedidos de iFood, 99Food e outros marketplaces não contam.
          </p>
        </div>
      )}
      <div>
        <UsageProgress label="Mesas utilizadas" used={tablesUsed} limit={tablesLimit} />
        <p className="kd-usage-foot">{tablesLimit === null ? "Mesas e QR Codes ilimitados." : `Mesas utilizadas: ${tablesUsed} de ${tablesLimit}.`}</p>
      </div>
      {!compact && (
        <p className="kd-usage-renew">
          Renovação da franquia: <b>{longDate(usage.periodEnd)}</b>
        </p>
      )}
    </div>
  );
}

/** Avisos de consumo aos 70%, 90% e 100%. Nunca sugere que a operação parou: só os pedidos próprios novos. */
export function PlanLimitWarning({ usage, limit }: { usage: PlanUsage; limit: number | null }) {
  if (usage.loading || limit === null || limit === 0) return null;
  if (usage.level === "full") {
    return (
      <Callout
        tone="danger"
        role="alert"
        icon={<AlertCircle size={18} aria-hidden />}
        title={`Você utilizou ${usage.used} de ${limit} pedidos neste mês.`}
        action={
          <span className="kd-row">
            <ButtonLink href={`${MY_PLAN_PATH}#planos`} size="sm">
              Fazer upgrade
            </ButtonLink>
            <ButtonLink href="/planos" size="sm" variant="secondary">
              Ver planos
            </ButtonLink>
          </span>
        }
      >
        Seu limite de pedidos próprios foi atingido. Faça upgrade para continuar recebendo novos pedidos diretamente pelo KARDAP. O PDV, o caixa, os
        relatórios, o estoque e os pedidos de iFood e 99Food continuam funcionando normalmente.
      </Callout>
    );
  }
  if (usage.level === "warn90" || usage.level === "warn70") {
    const pct = usage.level === "warn90" ? 90 : 70;
    return (
      <Callout
        tone={usage.level === "warn90" ? "warn" : "info"}
        title={`${pct}% dos pedidos próprios do mês já foram usados`}
        action={
          <ButtonLink href={`${MY_PLAN_PATH}#planos`} size="sm" variant="secondary">
            Ver planos
          </ButtonLink>
        }
      >
        {usage.used} de {limit} pedidos ({plural(usage.remaining ?? 0, "pedido restante", "pedidos restantes")} até {longDate(usage.periodEnd)}).
      </Callout>
    );
  }
  return null;
}

/** Recurso de um plano maior: convida a conhecer os planos ou fazer upgrade. */
export function UpgradeModal({ title, description, onClose, reason = "plan" }: { title: string; description: string; onClose: () => void; reason?: "plan" | "subscription" }) {
  return (
    <Modal
      title={reason === "subscription" ? "Regularize sua assinatura" : title}
      description={reason === "subscription" ? "Este recurso faz parte do seu plano, mas a assinatura não está ativa." : undefined}
      size="sm"
      onClose={onClose}
      footer={
        reason === "subscription" ? (
          <ButtonLink href={MY_PLAN_PATH} iconEnd={<ArrowRight size={16} aria-hidden />}>
            Ir para Meu Plano
          </ButtonLink>
        ) : (
          <>
            <ButtonLink href="/planos" variant="secondary">
              Conhecer planos
            </ButtonLink>
            <ButtonLink href={`${MY_PLAN_PATH}#planos`} icon={<Sparkles size={16} aria-hidden />}>
              Fazer upgrade
            </ButtonLink>
          </>
        )
      }
    >
      <div className="kd-upgrade">
        <span className="kd-upgrade-icon" aria-hidden>
          <MonitorSmartphone size={26} />
        </span>
        <p>{reason === "subscription" ? "Regularize o pagamento em Meu Plano para voltar a usar. Seus dados continuam guardados." : description}</p>
      </div>
    </Modal>
  );
}

/**
 * Botão "Acessar PDV". Com o PDV no plano, vai para pdv.kardapp.online (o login é o mesmo: sessão compartilhada).
 * Sem o PDV no plano (Start), mostra o cadeado e o convite para o upgrade. O PDV confere tudo de novo no servidor.
 */
export function PDVAccessButton({ entitlements, className = "", size = "md" }: { entitlements: Entitlements; className?: string; size?: "sm" | "md" }) {
  const [open, setOpen] = useState(false);
  const allowed = entitlements.features.pdvAccess;
  const reason = entitlements.contracted.features.pdvAccess && !entitlements.valid ? "subscription" : "plan";
  if (allowed) {
    return (
      <a className={`kd-btn kd-btn--signal ${size === "sm" ? "kd-btn--sm" : ""} kd-pdv-btn ${className}`} href={`${PDV_ORIGIN}/`}>
        <MonitorSmartphone size={size === "sm" ? 15 : 17} aria-hidden />
        <span>Acessar PDV</span>
      </a>
    );
  }
  return (
    <>
      <button type="button" className={`kd-btn kd-btn--secondary ${size === "sm" ? "kd-btn--sm" : ""} kd-pdv-btn is-locked ${className}`} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Lock size={size === "sm" ? 14 : 16} aria-hidden />
        <span>Acessar PDV</span>
        <span className="kd-pdv-tag">Pro</span>
      </button>
      {open && (
        <UpgradeModal
          reason={reason}
          title="Desbloqueie o PDV do KARDAP"
          description="Gerencie pedidos, caixa, estoque, mesas, entregas e relatórios em um único sistema. Disponível a partir do plano Pro."
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** Mostra o conteúdo só quando o plano libera o recurso; senão, o convite (ou o que vier em `fallback`). */
export function FeatureGate({ entitlements, feature, children, fallback, title }: { entitlements: Entitlements; feature: FeatureKey; children: React.ReactNode; fallback?: React.ReactNode; title: string }) {
  if (entitlements.features[feature]) return <>{children}</>;
  if (fallback !== undefined) return <>{fallback}</>;
  const subscription = entitlements.contracted.features[feature] && !entitlements.valid;
  return (
    <Callout
      tone="info"
      icon={<Lock size={18} aria-hidden />}
      title={subscription ? `${title}: regularize a assinatura para voltar a usar` : `${title} não faz parte do seu plano`}
      action={
        <ButtonLink href={`${MY_PLAN_PATH}#planos`} size="sm" variant="secondary">
          {subscription ? "Ir para Meu Plano" : "Ver planos"}
        </ButtonLink>
      }
    >
      {subscription ? "Seus dados continuam guardados." : "Faça upgrade para liberar este recurso."}
    </Callout>
  );
}

/** Pedido de proposta do Enterprise. Não cria assinatura: o time comercial responde e a ativação é manual. */
export function EnterpriseContact({ onClose, restaurantId, email: initialEmail = "" }: { onClose: () => void; restaurantId?: string; email?: string }) {
  const [form, setForm] = useState({ name: "", email: initialEmail, company: "", phone: "", units: "", monthlyOrders: "", message: "", website: "" });
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/enterprise/contato", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, restaurantId }) });
      if (!res.ok) throw await apiError(res, "Não foi possível enviar agora. Tente de novo.");
      setState("sent");
    } catch (err) {
      setState("idle");
      setError(friendlyError(err, "Não foi possível enviar agora. Tente de novo."));
    }
  };
  return (
    <Modal
      title="Falar com vendas: KARDAP Enterprise"
      description="Conte sobre a sua operação. O nosso time comercial responde com uma proposta."
      onClose={onClose}
      busy={state === "sending"}
      footer={
        state === "sent" ? (
          <Button onClick={onClose}>Fechar</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={state === "sending"}>
              Cancelar
            </Button>
            <Button type="submit" form="kd-enterprise-form" loading={state === "sending"}>
              {state === "sending" ? "Enviando…" : "Solicitar proposta"}
            </Button>
          </>
        )
      }
    >
      {state === "sent" ? (
        <div className="kd-upgrade" role="status">
          <span className="kd-upgrade-icon is-success" aria-hidden>
            <Check size={26} />
          </span>
          <p>Recebemos o seu pedido. O time comercial entra em contato pelo e-mail informado.</p>
        </div>
      ) : (
        <form id="kd-enterprise-form" className="kd-form-grid" onSubmit={send}>
          <TextField label="Seu nome" value={form.name} onChange={set("name")} required maxLength={120} autoComplete="name" />
          <TextField label="E-mail" type="email" value={form.email} onChange={set("email")} required maxLength={160} autoComplete="email" />
          <TextField label="Empresa ou rede" value={form.company} onChange={set("company")} required maxLength={160} autoComplete="organization" />
          <TextField label="Telefone" optional value={form.phone} onChange={set("phone")} maxLength={40} autoComplete="tel" inputMode="tel" />
          <TextField label="Número de unidades" optional value={form.units} onChange={set("units")} maxLength={40} inputMode="numeric" />
          <TextField label="Pedidos próprios por mês (aprox.)" optional value={form.monthlyOrders} onChange={set("monthlyOrders")} maxLength={40} inputMode="numeric" />
          <TextArea label="O que a sua operação precisa?" optional value={form.message} onChange={set("message")} maxLength={2000} rows={4} />
          <input className="kd-hp" tabIndex={-1} autoComplete="off" aria-hidden value={form.website} onChange={set("website")} name="website" />
          {error && (
            <p className="kd-form-error" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </Modal>
  );
}

export { billingFetch, apiError };
export function PlansLink({ children = "Ver planos" }: { children?: React.ReactNode }) {
  return <Link href={`${MY_PLAN_PATH}#planos`}>{children}</Link>;
}
