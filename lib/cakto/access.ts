import type { PlanId, RestaurantSubscription, SubscriptionStatus } from "./types";

/**
 * Regras de acesso por plano. Módulo sem segredos nem variáveis de ambiente:
 * roda igual no navegador (cardápio, painel) e no servidor (rotas de API).
 */

export const TRIAL_DAYS = 15;
export const GRACE_PERIOD_DAYS = 3;
/** Limite de mesas do plano Essencial (e de quem está sem plano ativo). */
export const ESSENTIAL_TABLE_LIMIT = 30;

export type PlanFeatureKey = "waiter_call" | "bill_request" | "advanced_reports" | "custom_brand" | "unlimited_tables";

/** O que o navegador precisa saber da assinatura para aplicar as regras. Sem dados de pagamento. */
export type SubscriptionSummary = Pick<RestaurantSubscription, "planId" | "status"> &
  Partial<Pick<RestaurantSubscription, "planName" | "cycle" | "priceCents" | "trialEndsAt" | "currentPeriodEnd" | "nextPaymentDate" | "lateSince" | "canceledAt">> & {
    /** true quando o teste vem da data de criação do restaurante (nenhuma assinatura registrada ainda). */
    implicitTrial?: boolean;
  };

const DAY = 24 * 60 * 60 * 1000;

/** Converte datas gravadas como texto ISO, Timestamp do Firestore ou {seconds}. */
export function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const maybe = value as { toDate?: () => Date; seconds?: number };
  if (typeof maybe.toDate === "function") return maybe.toDate();
  if (typeof maybe.seconds === "number") return new Date(maybe.seconds * 1000);
  return null;
}

/**
 * Assinatura que vale para o restaurante. Sem assinatura registrada, todo restaurante tem
 * 15 dias de teste do plano Pro contados da criação (como prometem os Termos de Uso).
 */
export function effectiveSubscription(subscription: Partial<RestaurantSubscription> | null | undefined, createdAt: unknown): SubscriptionSummary | null {
  if (subscription && subscription.planId && subscription.status && subscription.status !== "inactive") {
    return subscription as SubscriptionSummary;
  }
  const created = toDate(createdAt);
  if (!created) return null;
  return {
    planId: "pro",
    planName: "Pro",
    status: "trial",
    trialEndsAt: new Date(created.getTime() + TRIAL_DAYS * DAY).toISOString(),
    implicitTrial: true,
  };
}

export function canAccessFeature(subscription: SubscriptionSummary | null | undefined, feature: PlanFeatureKey, now = Date.now()): boolean {
  if (!subscription) return false;

  // Em teste, o acesso é ao Pro completo até a data de término.
  if (subscription.status === "trial") {
    const ends = toDate(subscription.trialEndsAt);
    return !ends || ends.getTime() >= now;
  }

  // Inadimplência: mantém o acesso durante a carência.
  if (subscription.status === "late") {
    const since = toDate(subscription.lateSince);
    if (since && (now - since.getTime()) / DAY > GRACE_PERIOD_DAYS) return false;
  } else if (subscription.status !== "active") {
    // Cancelada, pausada ou expirada: vale até o fim do período já pago.
    const paidUntil = toDate(subscription.currentPeriodEnd);
    if (!paidUntil || paidUntil.getTime() < now) return false;
  }

  if (subscription.planId === "pro") return true;

  // Plano Essencial
  switch (feature) {
    case "waiter_call":
    case "custom_brand":
      return true;
    default:
      return false;
  }
}

export function tableLimit(subscription: SubscriptionSummary | null | undefined, now = Date.now()) {
  return canAccessFeature(subscription, "unlimited_tables", now) ? null : ESSENTIAL_TABLE_LIMIT;
}

/** Dias restantes de teste (arredondado para cima) ou null fora do teste. */
export function trialDaysLeft(subscription: SubscriptionSummary | null | undefined, now = Date.now()) {
  if (!subscription || subscription.status !== "trial") return null;
  const ends = toDate(subscription.trialEndsAt);
  if (!ends) return null;
  return Math.max(0, Math.ceil((ends.getTime() - now) / DAY));
}

export type AccountState = "trial" | "trial_ended" | "active" | "late" | "canceled" | "expired" | "none";

/** Situação comercial em linguagem única para painel e administração. */
export function accountState(subscription: SubscriptionSummary | null | undefined, now = Date.now()): AccountState {
  if (!subscription) return "none";
  const status = subscription.status as SubscriptionStatus;
  if (status === "trial") return (trialDaysLeft(subscription, now) ?? 1) > 0 ? "trial" : "trial_ended";
  if (status === "active") return "active";
  if (status === "late") return "late";
  if (status === "canceled" || status === "paused") return "canceled";
  return "expired";
}

/** Valor mensal equivalente em centavos (planos anuais divididos por 12). */
export function monthlyCents(subscription: Pick<RestaurantSubscription, "cycle" | "priceCents"> | null | undefined) {
  if (!subscription?.priceCents) return 0;
  return subscription.cycle === "annual" ? Math.round(subscription.priceCents / 12) : subscription.priceCents;
}

export const planLabel = (planId: PlanId | string | undefined) => (planId === "pro" ? "Pro" : planId === "essencial" ? "Essencial" : "Sem plano");
