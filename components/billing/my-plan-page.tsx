"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, CalendarClock, CalendarDays, Check, CreditCard, Minus, QrCode, RotateCw, ShieldCheck, Smartphone } from "lucide-react";
import { friendlyError } from "@/lib/async";
import { getRestaurantId } from "@/lib/restaurant-db";
import { brl, plural } from "@/lib/format";
import { PLAN_CATALOG, PLAN_ORDER, TRIAL_DAYS, planRank, shortPlanName, toDate, type FeatureKey, type PlanId } from "@/lib/billing/plans";
import type { PaymentRecord, RestaurantSubscription } from "@/lib/cakto/types";
import { CurrentPlanBadge, PlanCard, PlanComparison } from "@/components/plans/plan-cards";
import { Badge, Button, Callout, Card, CardHead, ConfirmDialog, EmptyState, Modal, PageHeader, RadioCard, Skeleton, type BadgeTone } from "@/components/ui";
import type { AccountInfo, Notify } from "@/components/dashboard/types";
import { apiError, billingFetch, usePlanEntitlements, usePlanUsage } from "./hooks";
import { EnterpriseContact, PDVAccessButton, PlanLimitWarning, PlanUsageCard } from "./widgets";

const PAYMENT_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  paid: { label: "Aprovado", tone: "success" },
  waiting_payment: { label: "Aguardando", tone: "signal" },
  refused: { label: "Recusado", tone: "danger" },
  refunded: { label: "Estornado", tone: "outline" },
  canceled: { label: "Cancelado", tone: "outline" },
};

/** Recursos mostrados em "O que está incluído", na ordem em que importam para o restaurante. */
const FEATURE_LABELS: [FeatureKey, string][] = [
  ["videoMenu", "Cardápio digital em vídeo estilo Reels"],
  ["customBranding", "Cores e logotipo"],
  ["billRequest", "Pedir a conta pelo cardápio"],
  ["pdvAccess", "PDV completo"],
  ["orderManagement", "Pedidos e comandas"],
  ["cashRegister", "Controle de caixa"],
  ["inventory", "Controle de estoque"],
  ["financialManagement", "Gestão financeira"],
  ["deliveryManagement", "Entregas e entregadores"],
  ["reports", "Relatórios"],
  ["promotions", "Promoções e campanhas"],
  ["marketplaceIntegrations", "Integrações com marketplaces"],
  ["multiUnit", "Múltiplas unidades"],
  ["prioritySupport", "Suporte prioritário"],
];

const longDate = (value: unknown) => toDate(value)?.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) || "";
const shortDate = (value: unknown) => toDate(value)?.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) || "–";
const DAY = 24 * 60 * 60 * 1000;

type Method = "credit_card" | "pix_auto" | "pix";

/** Página Meu Plano: plano, situação, cobrança, franquia do mês, mesas, recursos, troca de plano e histórico. */
export function MyPlanPage({ notify, account, tablesUsed }: { notify: Notify; account: AccountInfo; tablesUsed: number }) {
  const restaurantId = getRestaurantId();
  const entitlements = usePlanEntitlements(account);
  const usage = usePlanUsage(restaurantId, entitlements);
  const stored = account.subscription as RestaurantSubscription | null;

  const [remote, setRemote] = useState<RestaurantSubscription | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[] | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);
  const [downgrade, setDowngrade] = useState<PlanId | null>(null);
  const [enterprise, setEnterprise] = useState(false);
  const [manage, setManage] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [method, setMethod] = useState<Method>("credit_card");
  const [updatingPayment, setUpdatingPayment] = useState(false);

  const loadHistory = useCallback(async () => {
    setHistoryError("");
    setPayments(null);
    try {
      const res = await billingFetch(`/api/cakto/subscription?restaurantId=${encodeURIComponent(restaurantId)}`);
      if (!res.ok) throw await apiError(res, "Não foi possível carregar o histórico de cobranças.");
      const data = await res.json();
      setRemote(data.subscription || null);
      setPayments(data.payments || []);
    } catch (err) {
      setPayments([]);
      setHistoryError(friendlyError(err, "Não foi possível carregar o histórico de cobranças. Tente de novo em instantes."));
    }
  }, [restaurantId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Link direto para a lista de planos (#planos), vindo do botão "Fazer upgrade" de outras telas.
  useEffect(() => {
    if (window.location.hash === "#planos") requestAnimationFrame(() => document.getElementById("planos")?.scrollIntoView({ block: "start" }));
  }, []);

  const sub = remote || stored;
  const paying = Boolean(stored?.planId) && !entitlements.implicitTrial && entitlements.status !== "trialing" && entitlements.valid;
  const canceling = entitlements.status === "canceled" || entitlements.cancelAtPeriodEnd;
  const scheduled = entitlements.scheduledChange;
  const scheduledOpen = Boolean(scheduled && (!scheduled.effectiveAt || Date.parse(scheduled.effectiveAt) - Date.now() <= DAY || !entitlements.valid));

  const checkout = async (planId: PlanId) => {
    setLoadingPlan(planId);
    try {
      const res = await billingFetch("/api/cakto/checkout", { method: "POST", body: JSON.stringify({ planId, restaurantId }) });
      if (!res.ok) throw await apiError(res, "Não foi possível abrir o pagamento agora.");
      const data = await res.json();
      if (!data.checkoutUrl) throw new Error("Não foi possível abrir o pagamento agora.");
      notify("Abrindo o pagamento seguro da Cakto…");
      window.location.href = data.checkoutUrl;
    } catch (err) {
      notify(friendlyError(err, "Não foi possível abrir o pagamento. Tente de novo em instantes."), "error");
      setLoadingPlan(null);
    }
  };

  const scheduleDowngrade = async () => {
    if (!downgrade) return false;
    try {
      const res = await billingFetch("/api/billing/change-plan", { method: "POST", body: JSON.stringify({ restaurantId, planId: downgrade }) });
      if (!res.ok) throw await apiError(res, "Não foi possível agendar a mudança agora.");
      const data = await res.json();
      notify(`Mudança para o ${shortPlanName(downgrade)} agendada${data.scheduled?.effectiveAt ? ` para ${shortDate(data.scheduled.effectiveAt)}` : ""}.`);
      return true;
    } catch (err) {
      notify(friendlyError(err, "Não foi possível agendar a mudança. Tente de novo."), "error");
      return false;
    }
  };

  const cancel = async () => {
    try {
      const res = await billingFetch("/api/cakto/subscription", { method: "POST", body: JSON.stringify({ action: "cancel", restaurantId }) });
      if (!res.ok) throw await apiError(res, "Não foi possível cancelar a assinatura agora.");
      notify("Assinatura cancelada. Não haverá novas cobranças.");
      setManage(false);
      loadHistory();
      return true;
    } catch (err) {
      notify(friendlyError(err, "Não foi possível cancelar a assinatura. Tente de novo."), "error");
      return false;
    }
  };

  const changePayment = async () => {
    setUpdatingPayment(true);
    try {
      const res = await billingFetch("/api/cakto/subscription", { method: "POST", body: JSON.stringify({ action: "change_payment_method", restaurantId, paymentMethod: method }) });
      if (!res.ok) throw await apiError(res, "Não foi possível alterar a forma de pagamento.");
      notify("Forma de pagamento atualizada");
      setManage(false);
      loadHistory();
    } catch (err) {
      notify(friendlyError(err, "Não foi possível alterar a forma de pagamento. Tente de novo."), "error");
    } finally {
      setUpdatingPayment(false);
    }
  };

  /** Ação de cada cartão de plano, conforme o plano atual. */
  const actionFor = (id: PlanId) => {
    const plan = PLAN_CATALOG[id];
    const busy = loadingPlan === id;
    const disabled = Boolean(loadingPlan && loadingPlan !== id);
    if (plan.salesOnly) {
      return paying && entitlements.planId === id ? null : (
        <Button block variant="secondary" onClick={() => setEnterprise(true)}>
          Falar com vendas
        </Button>
      );
    }
    if (paying && entitlements.planId === id && !(canceling && scheduledOpen)) {
      return (
        <Button block variant="secondary" disabled>
          Plano atual
        </Button>
      );
    }
    if (scheduled?.planId === id) {
      return (
        <Button block loading={busy} disabled={disabled || !scheduledOpen} onClick={() => checkout(id)}>
          {scheduledOpen ? `Assinar o ${shortPlanName(id)}` : `Disponível a partir de ${shortDate(scheduled.effectiveAt)}`}
        </Button>
      );
    }
    if (paying && planRank(id) > planRank(entitlements.planId)) {
      return (
        <Button block loading={busy} disabled={disabled} onClick={() => checkout(id)} iconEnd={<ArrowRight size={16} aria-hidden />}>
          {busy ? "Abrindo pagamento…" : "Fazer upgrade"}
        </Button>
      );
    }
    if (paying && planRank(id) < planRank(entitlements.planId)) {
      return (
        <Button block variant="secondary" disabled={disabled || canceling} onClick={() => setDowngrade(id)}>
          Alterar plano
        </Button>
      );
    }
    return (
      <Button block variant={plan.popular ? "primary" : "secondary"} loading={busy} disabled={disabled} onClick={() => checkout(id)} iconEnd={<ArrowRight size={16} aria-hidden />}>
        {busy ? "Abrindo pagamento…" : "Assinar"}
      </Button>
    );
  };

  const statusLine = (() => {
    if (entitlements.status === "trialing") {
      const days = entitlements.trialEndsAt ? Math.max(0, Math.ceil((Date.parse(entitlements.trialEndsAt) - Date.now()) / DAY)) : null;
      return entitlements.valid
        ? `Teste grátis do ${shortPlanName(entitlements.planId)} até ${longDate(entitlements.trialEndsAt)}${days !== null ? ` (${days === 0 ? "termina hoje" : `faltam ${plural(days, "dia", "dias")}`})` : ""}.`
        : `O teste de ${TRIAL_DAYS} dias terminou em ${longDate(entitlements.trialEndsAt)}. Escolha um plano para continuar.`;
    }
    if (entitlements.reason === "suspended") return "Estabelecimento suspenso pela administração do KARDAP. Fale com o suporte.";
    if (entitlements.status === "past_due") return entitlements.valid ? `A última cobrança não foi aprovada. Regularize até ${longDate(entitlements.accessUntil)} para não perder recursos.` : "O pagamento está pendente e a carência terminou. Regularize para voltar a usar os recursos do plano.";
    if (canceling) return entitlements.valid ? `Sem novas cobranças. O plano vale até ${longDate(entitlements.accessUntil)}.` : "A assinatura terminou. Escolha um plano para voltar a usar os recursos.";
    if (!entitlements.valid) return "A assinatura não está ativa. Escolha um plano para continuar.";
    return "Assinatura em dia.";
  })();

  const methodLabel = sub
    ? sub.paymentMethodName || (sub.cardLastDigits ? `Cartão final ${sub.cardLastDigits}${sub.cardBrand ? ` (${sub.cardBrand})` : ""}` : sub.paymentMethod === "pix_auto" ? "Pix Automático" : sub.paymentMethod === "pix" ? "Pix" : "Não informada")
    : "";

  return (
    <div className="kd-stack">
      <PageHeader title="Meu plano" description="Seu plano, o consumo do mês, a próxima cobrança e o histórico de pagamentos. Os pagamentos são processados pela Cakto." actions={<PDVAccessButton entitlements={entitlements} />} />

      <Card className="kd-plan-now k-enter" aria-labelledby="kd-plan-now-title">
        <div className="kd-plan-now-head">
          <div>
            <CurrentPlanBadge planId={entitlements.planId} status={entitlements.status} valid={entitlements.valid} />
            <h2 className="kd-h2" id="kd-plan-now-title">
              {entitlements.planName}
              {entitlements.legacy && stored?.planId === "essencial" ? " (antigo Essencial)" : ""}
            </h2>
            <p className="kd-lead">{statusLine}</p>
          </div>
          {entitlements.priceInCents !== null && !entitlements.implicitTrial && entitlements.status !== "trialing" ? (
            <p className="kd-plan-now-price kd-num">
              <b>{brl(entitlements.priceInCents)}</b>
              <span>{stored?.cycle === "annual" ? "por ano" : "por mês"}</span>
            </p>
          ) : null}
        </div>
        <div className="kd-plan-now-facts">
          <div>
            <span>
              <CalendarDays size={15} aria-hidden /> {canceling ? "Acesso até" : entitlements.status === "trialing" ? "Fim do teste" : "Próxima cobrança"}
            </span>
            <b>{longDate(canceling ? entitlements.accessUntil : entitlements.status === "trialing" ? entitlements.trialEndsAt : entitlements.nextPaymentDate) || "Sem data prevista"}</b>
          </div>
          <div>
            <span>
              <CalendarClock size={15} aria-hidden /> Renovação da franquia
            </span>
            <b>{longDate(usage.periodEnd)}</b>
          </div>
          {paying && (
            <div>
              <span>
                <CreditCard size={15} aria-hidden /> Forma de pagamento
              </span>
              <b>{methodLabel}</b>
            </div>
          )}
          <div className="kd-plan-now-actions">
            {paying && planRank(entitlements.planId) < planRank("business") && (
              <Button size="sm" onClick={() => document.getElementById("planos")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                Fazer upgrade
              </Button>
            )}
            {paying && (
              <Button size="sm" variant="secondary" onClick={() => setManage(true)}>
                Gerenciar assinatura
              </Button>
            )}
          </div>
        </div>
        {scheduled && (
          <Callout tone="info" title={`Mudança para o ${shortPlanName(scheduled.planId)} agendada`}>
            {scheduled.effectiveAt ? `O plano atual vale até ${longDate(scheduled.effectiveAt)}. ` : ""}
            {scheduledOpen ? `Assine o ${shortPlanName(scheduled.planId)} abaixo para continuar sem interrupção.` : `O pagamento do ${shortPlanName(scheduled.planId)} fica disponível a partir de 1 dia antes dessa data.`} Nenhum dado é apagado: mesas, produtos, pedidos e relatórios continuam.
          </Callout>
        )}
      </Card>

      <PlanLimitWarning usage={usage} limit={entitlements.limits.maxNativeOrdersPerMonth} />

      <div className="kd-split">
        <Card aria-labelledby="kd-usage-title">
          <CardHead id="kd-usage-title" kicker="Consumo" title="Este mês" />
          {usage.loading ? <Skeleton rows={2} height={48} label="Carregando consumo" /> : <PlanUsageCard entitlements={entitlements} usage={usage} tablesUsed={tablesUsed} />}
        </Card>
        <Card aria-labelledby="kd-features-title">
          <CardHead id="kd-features-title" kicker="Recursos" title="O que está incluído" />
          <ul className="kd-feature-list">
            {FEATURE_LABELS.map(([key, label]) => {
              const on = entitlements.features[key];
              return (
                <li key={key} className={on ? "is-on" : ""}>
                  {on ? <Check size={15} strokeWidth={2.6} aria-hidden /> : <Minus size={15} aria-hidden />}
                  <span>{label}</span>
                  <span className="kd-sr">{on ? " (incluído)" : " (não incluído)"}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <section className="kd-stack-sm" aria-labelledby="planos" id="planos-secao">
        <div className="kd-section-head">
          <div>
            <h2 className="kd-h2" id="planos">
              {paying ? "Trocar de plano" : "Escolha seu plano"}
            </h2>
            <p className="kd-muted">Upgrade vale na hora e mantém o consumo do mês. Mudança para um plano menor vale no fim do período pago, sem apagar dados.</p>
          </div>
        </div>
        <div className="kd-plans kd-plans--4">
          {PLAN_ORDER.map((id, i) => (
            <PlanCard key={id} planId={id} index={i} current={paying && entitlements.planId === id} action={actionFor(id)} />
          ))}
        </div>
        <details className="kd-disclosure">
          <summary>Comparar todos os recursos</summary>
          <div className="kd-card kd-card--flush">
            <PlanComparison current={paying ? entitlements.planId : null} />
          </div>
        </details>
      </section>

      <Card flush aria-labelledby="kd-history-title">
        <CardHead id="kd-history-title" kicker="Cobranças" title="Histórico de pagamentos" />
        {payments === null ? (
          <div className="kd-pad">
            <Skeleton rows={2} height={44} label="Carregando histórico" />
          </div>
        ) : historyError ? (
          <div className="kd-pad">
            <Callout
              tone="warn"
              title="Histórico indisponível no momento"
              action={
                <Button size="sm" variant="secondary" icon={<RotateCw size={14} />} onClick={loadHistory}>
                  Tentar de novo
                </Button>
              }
            >
              {historyError}
            </Callout>
          </div>
        ) : payments.length > 0 ? (
          <div className="kd-table-scroll">
            <table className="kd-data-table">
              <thead>
                <tr>
                  <th scope="col">Data</th>
                  <th scope="col">Valor</th>
                  <th scope="col">Situação</th>
                  <th scope="col">Forma</th>
                  <th scope="col">Identificador</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => {
                  const paymentStatus = PAYMENT_STATUS[p.status] || { label: p.status, tone: "outline" as BadgeTone };
                  return (
                    <tr key={p.id}>
                      <td data-label="Data">{shortDate(p.paidAt || p.createdAt)}</td>
                      <td data-label="Valor" className="kd-num">
                        <b>{p.amountFormatted}</b>
                      </td>
                      <td data-label="Situação">
                        <Badge tone={paymentStatus.tone}>{paymentStatus.label}</Badge>
                      </td>
                      <td data-label="Forma">{p.paymentMethodName || p.paymentMethod || "Cartão"}</td>
                      <td data-label="Identificador" className="kd-muted kd-num">
                        {p.refId || p.orderId?.slice(0, 8) || "–"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState compact title="Nenhum pagamento registrado ainda" description="Quando a primeira cobrança for processada, a data, o valor e a situação aparecem aqui." />
        )}
      </Card>

      <p className="kd-secure-note">
        <ShieldCheck size={16} aria-hidden />
        <span>Os dados do cartão ficam com a Cakto Pagamentos. O KARDAP não armazena números de cartão.</span>
      </p>

      {manage && (
        <Modal
          title="Gerenciar assinatura"
          description={`${entitlements.planName}${entitlements.nextPaymentDate ? ` · próxima cobrança em ${shortDate(entitlements.nextPaymentDate)}` : ""}`}
          size="sm"
          busy={updatingPayment}
          onClose={() => setManage(false)}
          footer={
            <>
              {!canceling && (
                <Button variant="ghost" className="kd-text-danger" onClick={() => setShowCancel(true)} disabled={updatingPayment}>
                  Cancelar assinatura
                </Button>
              )}
              <Button loading={updatingPayment} onClick={changePayment}>
                {updatingPayment ? "Salvando…" : "Salvar forma de pagamento"}
              </Button>
            </>
          }
        >
          <div className="kd-radio-list" role="radiogroup" aria-label="Forma de pagamento">
            <RadioCard name="kd-payment" value="credit_card" checked={method === "credit_card"} onChange={setMethod} icon={<CreditCard size={18} />} title="Cartão de crédito" description="Cobrança automática no cartão a cada renovação." />
            <RadioCard name="kd-payment" value="pix_auto" checked={method === "pix_auto"} onChange={setMethod} icon={<Smartphone size={18} />} title="Pix Automático" description="Débito recorrente autorizado uma vez no app do seu banco." />
            <RadioCard name="kd-payment" value="pix" checked={method === "pix"} onChange={setMethod} icon={<QrCode size={18} />} title="Pix a cada cobrança" description="Você recebe um Pix para pagar manualmente em cada renovação." />
          </div>
        </Modal>
      )}

      {showCancel && (
        <ConfirmDialog
          title="Cancelar a assinatura?"
          description={`Não haverá novas cobranças. O estabelecimento continua com o plano até ${longDate(sub?.nextPaymentDate || sub?.currentPeriodEnd) || "o fim do período já pago"}. Nenhum dado é apagado, e você pode assinar de novo quando quiser.`}
          confirmLabel="Cancelar assinatura"
          cancelLabel="Manter assinatura"
          onClose={() => setShowCancel(false)}
          onConfirm={cancel}
        />
      )}

      {downgrade && (
        <ConfirmDialog
          tone="primary"
          title={`Mudar para o ${shortPlanName(downgrade)}?`}
          description={`A mudança vale no fim do período pago${entitlements.nextPaymentDate ? ` (${longDate(entitlements.nextPaymentDate)})` : ""}. Até lá, tudo do ${shortPlanName(entitlements.planId)} continua. A cobrança atual não renova, e o ${shortPlanName(downgrade)} pode ser assinado a partir de 1 dia antes da data. Nada é apagado; acima dos novos limites, só novas criações ficam bloqueadas.`}
          confirmLabel="Agendar mudança"
          cancelLabel="Manter plano atual"
          onClose={() => setDowngrade(null)}
          onConfirm={scheduleDowngrade}
        />
      )}

      {enterprise && <EnterpriseContact onClose={() => setEnterprise(false)} restaurantId={restaurantId} />}
    </div>
  );
}
