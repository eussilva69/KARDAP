"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, CalendarDays, CreditCard, QrCode, RotateCw, ShieldCheck, Smartphone } from "lucide-react";
import { getFirebaseAuth } from "@/lib/auth";
import { friendlyError } from "@/lib/async";
import { getRestaurantId } from "@/lib/restaurant-db";
import { brl, plural } from "@/lib/format";
import { accountState, effectiveSubscription, planLabel, toDate, trialDaysLeft, TRIAL_DAYS, type AccountState } from "@/lib/cakto/access";
import type { BillingCycle, PaymentRecord, PlanId, RestaurantSubscription } from "@/lib/cakto/types";
import { CycleToggle, PLAN_ORDER, PlanCard, PlanComparison } from "@/components/plans/plan-cards";
import { Badge, Button, Callout, Card, CardHead, ConfirmDialog, EmptyState, Modal, PageHeader, RadioCard, Skeleton, type BadgeTone } from "@/components/ui";
import type { AccountInfo, Notify } from "./types";

const STATE: Record<AccountState, { label: string; tone: BadgeTone }> = {
  trial: { label: "Teste grátis", tone: "signal" },
  trial_ended: { label: "Teste encerrado", tone: "outline" },
  active: { label: "Ativa", tone: "success" },
  late: { label: "Pagamento pendente", tone: "danger" },
  canceled: { label: "Cancelada", tone: "outline" },
  expired: { label: "Expirada", tone: "outline" },
  none: { label: "Sem plano", tone: "outline" },
};

const PAYMENT_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  paid: { label: "Aprovado", tone: "success" },
  waiting_payment: { label: "Aguardando", tone: "signal" },
  refused: { label: "Recusado", tone: "danger" },
  refunded: { label: "Estornado", tone: "outline" },
  canceled: { label: "Cancelado", tone: "outline" },
};

const longDate = (value: unknown) => toDate(value)?.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) || "";
const shortDate = (value: unknown) => toDate(value)?.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) || "–";

type Method = "credit_card" | "pix_auto" | "pix";

async function authorizedFetch(input: string, init: RequestInit = {}) {
  const token = await getFirebaseAuth().currentUser?.getIdToken();
  if (!token) throw new Error("Sua sessão expirou. Entre de novo para gerenciar a assinatura.");
  return fetch(input, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
}

/** Lê a mensagem de erro da API (já escrita para o usuário) sem expor detalhes técnicos. */
async function apiError(res: Response, fallback: string) {
  try {
    const data = await res.json();
    return new Error(typeof data?.error === "string" && data.error.length < 160 ? data.error : fallback);
  } catch {
    return new Error(fallback);
  }
}

export function SubscriptionPage({ notify, account }: { notify: Notify; account: AccountInfo }) {
  const restaurantId = getRestaurantId();
  // Situação vinda do documento do restaurante: aparece na hora, mesmo sem a API de cobrança.
  const plan = effectiveSubscription(account.subscription, account.createdAt);
  const state = accountState(plan);
  const daysLeft = trialDaysLeft(plan);

  const [remote, setRemote] = useState<RestaurantSubscription | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[] | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [cycle, setCycle] = useState<BillingCycle>((account.subscription?.cycle as BillingCycle) || "monthly");
  const [checkoutLoading, setCheckoutLoading] = useState<PlanId | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [method, setMethod] = useState<Method>("credit_card");
  const [updatingPayment, setUpdatingPayment] = useState(false);

  const loadHistory = useCallback(async () => {
    setHistoryError("");
    setPayments(null);
    try {
      const res = await authorizedFetch(`/api/cakto/subscription?restaurantId=${encodeURIComponent(restaurantId)}`);
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

  const subscribe = async (planId: PlanId) => {
    setCheckoutLoading(planId);
    try {
      const res = await authorizedFetch("/api/cakto/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, cycle, restaurantId }),
      });
      if (!res.ok) throw await apiError(res, "Não foi possível abrir o pagamento agora.");
      const data = await res.json();
      if (!data.checkoutUrl) throw new Error("Não foi possível abrir o pagamento agora.");
      notify("Abrindo o pagamento seguro da Cakto…");
      window.location.href = data.checkoutUrl;
    } catch (err) {
      notify(friendlyError(err, "Não foi possível abrir o pagamento. Tente de novo em instantes."), "error");
      setCheckoutLoading(null);
    }
  };

  const cancel = async () => {
    try {
      const res = await authorizedFetch("/api/cakto/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", restaurantId }),
      });
      if (!res.ok) throw await apiError(res, "Não foi possível cancelar a assinatura agora.");
      notify("Assinatura cancelada. Não haverá novas cobranças.");
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
      const res = await authorizedFetch("/api/cakto/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "change_payment_method", restaurantId, paymentMethod: method }),
      });
      if (!res.ok) throw await apiError(res, "Não foi possível alterar a forma de pagamento.");
      notify("Forma de pagamento atualizada");
      setShowPayment(false);
      loadHistory();
    } catch (err) {
      notify(friendlyError(err, "Não foi possível alterar a forma de pagamento. Tente de novo."), "error");
    } finally {
      setUpdatingPayment(false);
    }
  };

  const paid = state === "active" || state === "late" || state === "canceled";
  const currentPlanId = paid ? (plan?.planId as PlanId) : null;
  const sub = remote || (account.subscription as RestaurantSubscription | null);
  const methodLabel = sub
    ? sub.paymentMethodName ||
      (sub.cardLastDigits
        ? `Cartão final ${sub.cardLastDigits}${sub.cardBrand ? ` (${sub.cardBrand})` : ""}`
        : sub.paymentMethod === "pix_auto"
          ? "Pix Automático"
          : sub.paymentMethod === "pix"
            ? "Pix"
            : "Não informada")
    : "";
  // O plano recomendado recebe a ação principal; o outro fica como alternativa.
  const recommended: PlanId = currentPlanId === "pro" ? "essencial" : "pro";

  return (
    <div className="kd-stack">
      <PageHeader title="Assinatura" description="Seu plano, a próxima cobrança e o histórico de pagamentos. Os pagamentos são processados pela Cakto." />

      <Card className="kd-plan-now k-enter" aria-labelledby="kd-plan-now-title">
        <div className="kd-plan-now-head">
          <div>
            <Badge tone={STATE[state].tone}>{STATE[state].label}</Badge>
            <h2 className="kd-h2" id="kd-plan-now-title">
              {state === "trial" || state === "trial_ended" ? `Teste do plano Pro` : plan ? `Plano ${planLabel(plan.planId)}` : "Nenhum plano ativo"}
            </h2>
            <p className="kd-lead">
              {state === "trial"
                ? `Você usa tudo do Pro até ${longDate(plan?.trialEndsAt)}. ${daysLeft === 0 ? "O teste termina hoje." : `Faltam ${plural(daysLeft || 0, "dia", "dias")}.`}`
                : state === "trial_ended"
                  ? `O teste de ${TRIAL_DAYS} dias terminou em ${longDate(plan?.trialEndsAt)}. Escolha um plano abaixo para continuar com os recursos do Pro.`
                  : state === "late"
                    ? "A última cobrança não foi aprovada. Atualize a forma de pagamento para não perder recursos."
                    : state === "canceled"
                      ? `Sem novas cobranças. ${plan?.currentPeriodEnd ? `Acesso até ${longDate(plan.currentPeriodEnd)}.` : ""}`
                      : state === "active"
                        ? "Assinatura em dia."
                        : "Escolha um plano abaixo para continuar usando o cardápio digital."}
            </p>
          </div>
          {paid && sub?.priceCents ? (
            <p className="kd-plan-now-price kd-num">
              <b>{brl(sub.priceCents)}</b>
              <span>{sub.cycle === "annual" ? "por ano" : "por mês"}</span>
            </p>
          ) : null}
        </div>
        {paid && sub && (
          <div className="kd-plan-now-facts">
            <div>
              <span>
                <CalendarDays size={15} aria-hidden /> {state === "canceled" ? "Acesso até" : "Próxima cobrança"}
              </span>
              <b>{longDate(sub.nextPaymentDate || sub.currentPeriodEnd) || "Sem data prevista"}</b>
            </div>
            <div>
              <span>
                <CreditCard size={15} aria-hidden /> Forma de pagamento
              </span>
              <b>{methodLabel}</b>
            </div>
            <div className="kd-plan-now-actions">
              <Button size="sm" variant={state === "late" ? "primary" : "secondary"} onClick={() => setShowPayment(true)}>
                Alterar pagamento
              </Button>
              {state !== "canceled" && (
                <Button size="sm" variant="ghost" className="kd-text-danger" onClick={() => setShowCancel(true)}>
                  Cancelar assinatura
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>

      <section className="kd-stack-sm" aria-labelledby="kd-plans-title">
        <div className="kd-section-head">
          <div>
            <h2 className="kd-h2" id="kd-plans-title">
              {paid ? "Trocar de plano" : "Escolha seu plano"}
            </h2>
            <p className="kd-muted">A diferença principal é o número de mesas e o pedido de conta pelo cardápio.</p>
          </div>
          <CycleToggle cycle={cycle} onChange={setCycle} />
        </div>
        <div className="kd-plans">
          {PLAN_ORDER.map((id, i) => {
            const isCurrent = currentPlanId === id && state !== "canceled";
            return (
              <PlanCard
                key={id}
                planId={id}
                cycle={cycle}
                index={i}
                current={isCurrent}
                action={
                  isCurrent ? null : (
                    <Button
                      block
                      variant={id === recommended ? "primary" : "secondary"}
                      loading={checkoutLoading === id}
                      disabled={Boolean(checkoutLoading && checkoutLoading !== id)}
                      onClick={() => subscribe(id)}
                      iconEnd={<ArrowRight size={16} aria-hidden />}
                    >
                      {checkoutLoading === id ? "Abrindo pagamento…" : paid ? `Mudar para o ${planLabel(id)}` : `Assinar o ${planLabel(id)}`}
                    </Button>
                  )
                }
              />
            );
          })}
        </div>
        <details className="kd-disclosure">
          <summary>Comparar todos os recursos</summary>
          <div className="kd-card kd-card--flush">
            <PlanComparison />
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
        <span>Os dados do cartão ficam com a Cakto Pagamentos. O Kardap não armazena números de cartão.</span>
      </p>

      {showCancel && (
        <ConfirmDialog
          title="Cancelar a assinatura?"
          description={`Não haverá novas cobranças. O restaurante continua com acesso ao plano até ${longDate(sub?.nextPaymentDate || sub?.currentPeriodEnd) || "o fim do período já pago"}, e você pode assinar de novo quando quiser.`}
          confirmLabel="Cancelar assinatura"
          cancelLabel="Manter assinatura"
          onClose={() => setShowCancel(false)}
          onConfirm={cancel}
        />
      )}

      {showPayment && (
        <Modal
          title="Alterar forma de pagamento"
          description="Vale para as próximas cobranças da assinatura."
          size="sm"
          busy={updatingPayment}
          onClose={() => setShowPayment(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setShowPayment(false)} disabled={updatingPayment}>
                Cancelar
              </Button>
              <Button loading={updatingPayment} onClick={changePayment}>
                {updatingPayment ? "Salvando…" : "Salvar forma de pagamento"}
              </Button>
            </>
          }
        >
          <div className="kd-radio-list" role="radiogroup" aria-label="Forma de pagamento">
            <RadioCard
              name="kd-payment"
              value="credit_card"
              checked={method === "credit_card"}
              onChange={setMethod}
              icon={<CreditCard size={18} />}
              title="Cartão de crédito"
              description="Cobrança automática no cartão a cada renovação."
            />
            <RadioCard
              name="kd-payment"
              value="pix_auto"
              checked={method === "pix_auto"}
              onChange={setMethod}
              icon={<Smartphone size={18} />}
              title="Pix Automático"
              description="Débito recorrente autorizado uma vez no app do seu banco."
            />
            <RadioCard
              name="kd-payment"
              value="pix"
              checked={method === "pix"}
              onChange={setMethod}
              icon={<QrCode size={18} />}
              title="Pix a cada cobrança"
              description="Você recebe um Pix para pagar manualmente em cada renovação."
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
