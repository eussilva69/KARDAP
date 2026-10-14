/**
 * Compatibilidade: as telas usam estas funções desde antes do catálogo atual. Todas delegam para a regra única
 * em lib/billing/plans.ts (resolveEntitlements), que também roda no servidor. Sem segredos nem variáveis de ambiente.
 */
import {
  GRACE_PERIOD_DAYS as GRACE,
  PLAN_CATALOG,
  TRIAL_DAYS as TRIAL,
  resolveEntitlements,
  shortPlanName,
  toDate as parseDate,
  type Entitlements,
  type PlanId,
  type StoredSubscription,
} from "../billing/plans";

export const TRIAL_DAYS = TRIAL;
export const GRACE_PERIOD_DAYS = GRACE;
export const toDate = parseDate;

export type PlanFeatureKey = "waiter_call" | "bill_request" | "advanced_reports" | "custom_brand" | "unlimited_tables";

/** Resumo da assinatura para as telas, com a origem guardada para recalcular os direitos em qualquer instante. */
export type SubscriptionSummary = {
  planId: PlanId;
  planName: string;
  status: Entitlements["status"];
  trialEndsAt?: string | null;
  currentPeriodEnd?: unknown;
  nextPaymentDate?: unknown;
  lateSince?: unknown;
  canceledAt?: unknown;
  cycle?: string;
  priceCents?: number;
  /** true quando o teste vem da data de criação do restaurante (nenhuma assinatura registrada ainda). */
  implicitTrial?: boolean;
  source: StoredSubscription | null;
  createdAt: unknown;
};

const DAY = 24 * 60 * 60 * 1000;

/** Assinatura que vale para o restaurante (com o teste automático de 15 dias do Pro quando não há registro). */
export function effectiveSubscription(subscription: unknown, createdAt: unknown): SubscriptionSummary | null {
  const stored = (subscription as StoredSubscription | null | undefined) || null;
  const e = resolveEntitlements(stored, { createdAt });
  if (e.reason === "no_subscription") return null;
  const source = e.implicitTrial ? null : stored;
  return {
    planId: e.planId,
    planName: e.planName,
    status: e.status,
    trialEndsAt: e.trialEndsAt,
    currentPeriodEnd: source?.currentPeriodEnd,
    nextPaymentDate: source?.nextPaymentDate,
    lateSince: source?.lateSince,
    canceledAt: source?.canceledAt,
    cycle: typeof source?.cycle === "string" ? source.cycle : undefined,
    priceCents: typeof source?.priceCents === "number" ? source.priceCents : undefined,
    implicitTrial: e.implicitTrial,
    source,
    createdAt,
  };
}

/** Direitos efetivos agora (ou no instante informado). */
export function entitlementsOf(summary: SubscriptionSummary | null | undefined, now = Date.now()): Entitlements {
  return resolveEntitlements(summary?.source ?? null, { createdAt: summary?.createdAt, now });
}

export function canAccessFeature(subscription: SubscriptionSummary | null | undefined, feature: PlanFeatureKey, now = Date.now()): boolean {
  if (!subscription) return false;
  const e = entitlementsOf(subscription, now);
  switch (feature) {
    case "waiter_call":
      return e.features.waiterCall;
    case "bill_request":
      return e.features.billRequest;
    case "advanced_reports":
      return e.features.reports;
    case "custom_brand":
      return e.features.customBranding;
    case "unlimited_tables":
      return e.limits.maxTables === null;
  }
}

/** Limite de mesas que vale agora (null = ilimitado). Sem dados, o do Start. */
export function tableLimit(subscription: SubscriptionSummary | null | undefined, now = Date.now()) {
  return subscription ? entitlementsOf(subscription, now).limits.maxTables : PLAN_CATALOG.start.limits.maxTables;
}

/** Dias restantes de teste (arredondado para cima) ou null fora do teste. */
export function trialDaysLeft(subscription: SubscriptionSummary | null | undefined, now = Date.now()) {
  if (!subscription || subscription.status !== "trialing") return null;
  const ends = parseDate(subscription.trialEndsAt);
  if (!ends) return null;
  return Math.max(0, Math.ceil((ends.getTime() - now) / DAY));
}

export type AccountState = "trial" | "trial_ended" | "active" | "late" | "canceled" | "expired" | "none";

/** Situação comercial em linguagem única para painel e administração. */
export function accountState(subscription: SubscriptionSummary | null | undefined, now = Date.now()): AccountState {
  if (!subscription) return "none";
  switch (subscription.status) {
    case "trialing":
      return (trialDaysLeft(subscription, now) ?? 1) > 0 ? "trial" : "trial_ended";
    case "active":
      return "active";
    case "past_due":
      return "late";
    case "canceled":
      return "canceled";
    default:
      return "expired";
  }
}

/** Valor mensal equivalente em centavos (assinaturas anuais anteriores divididas por 12). */
export function monthlyCents(subscription: { cycle?: unknown; priceCents?: unknown } | null | undefined) {
  const cents = Number(subscription?.priceCents) || 0;
  if (!cents) return 0;
  return subscription?.cycle === "annual" ? Math.round(cents / 12) : cents;
}

/** Nome curto do plano ("Start", "Pro"...). O Essencial anterior aparece como Start, que o substituiu. */
export const planLabel = (planId: string | undefined | null) => (planId === "essencial" ? "Start" : shortPlanName(planId));
