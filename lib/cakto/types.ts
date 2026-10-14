import type { PlanId as CatalogPlanId, PlanLimits, FeatureKey } from "../billing/plans";

/** Planos atuais e os anteriores ("essencial"), que ainda podem estar gravados em assinaturas antigas. */
export type PlanId = CatalogPlanId | "essencial";
/** Assinaturas novas são mensais; "annual" só aparece em assinaturas anteriores. */
export type BillingCycle = "monthly" | "annual";

/** Situação gravada. Os valores antigos (trial, late, inactive, paused) continuam aceitos na leitura. */
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired"
  | "suspended"
  | "trial"
  | "late"
  | "inactive"
  | "paused";

export type RestaurantSubscription = {
  planId: PlanId;
  /** Versão do catálogo em que a assinatura foi contratada (2 = Start/Pro/Business/Enterprise). */
  planVersion?: number;
  paymentProvider?: string | null;
  cancelAtPeriodEnd?: boolean;
  /** Mudança para um plano menor, agendada para o fim do período pago. */
  scheduledChange?: { planId: PlanId; effectiveAt: string | null; requestedAt: string } | null;
  /** Personalizações do contrato (Enterprise ou condições mantidas de planos anteriores). */
  customLimits?: Partial<PlanLimits> | null;
  customFeatures?: Partial<Record<FeatureKey, boolean>> | null;
  planName: string;
  status: SubscriptionStatus;
  cycle: BillingCycle;
  priceCents: number;
  caktoSubscriptionId?: string | null;
  caktoOrderId?: string | null;
  caktoOfferId?: string | null;
  paymentMethod?: string | null; // "credit_card" | "pix" | "pix_auto" | etc
  paymentMethodName?: string | null;
  cardBrand?: string | null;
  cardLastDigits?: string | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  nextPaymentDate?: string | null;
  trialEndsAt?: string | null;
  canceledAt?: string | null;
  lateSince?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaymentRecord = {
  id: string;
  orderId: string;
  refId?: string | null;
  amount: number;
  amountFormatted: string;
  status: "paid" | "waiting_payment" | "refused" | "refunded" | "canceled";
  paymentMethod: string;
  paymentMethodName?: string | null;
  cardLastDigits?: string | null;
  cardBrand?: string | null;
  paidAt?: string | null;
  createdAt: string;
  checkoutUrl?: string | null;
};

export type CaktoOAuthTokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: "Bearer" | string;
  scope: string;
};

export type CaktoSubscriptionApiResponse = {
  id: string;
  status: "active" | "inactive" | "canceled" | "expired" | "paused" | "late" | "trial";
  current_period?: number;
  recurrence_period?: number;
  quantity_recurrences?: number;
  amount: string;
  paymentMethod?: string;
  customer?: string;
  product?: string;
  offer?: string;
  parent_order?: string;
  orders?: string[];
  next_payment_date?: string | null;
  createdAt: string;
  updatedAt: string;
  canceledAt?: string | null;
};

export type CaktoWebhookPayload = {
  secret: string;
  event:
    | "purchase_approved"
    | "purchase_refused"
    | "pix_gerado"
    | "boleto_gerado"
    | "subscription_created"
    | "subscription_renewed"
    | "subscription_renewal_refused"
    | "subscription_late"
    | "subscription_late_recovered"
    | "subscription_paused"
    | "subscription_resumed"
    | "subscription_canceled"
    | "refund"
    | "refund_requested"
    | "chargeback"
    | "checkout_abandonment";
  data: CaktoWebhookData;
};

export type CaktoWebhookData = {
  id?: string;
  refId?: string;
  status?: string;
  offer_type?: string;
  checkoutUrl?: string | null;
  callback?: string | null;
  baseAmount?: number;
  amount?: number | null;
  fees?: number | null;
  discount?: string | null;
  paymentMethod?: string;
  paymentMethodName?: string;
  customer?: {
    id?: number | string;
    name?: string;
    email?: string;
    phone?: string;
    docNumber?: string;
  };
  product?: {
    id?: string;
    short_id?: string;
    name?: string;
    type?: string;
  };
  offer?: {
    id?: string;
    name?: string;
    price?: number;
    currency?: string;
  };
  subscription?: {
    id?: string;
    status?: string;
    current_period?: number;
    recurrence_period?: number;
    next_payment_date?: string | null;
  } | null;
  subscription_period?: number | null;
  createdAt?: string;
  paidAt?: string | null;
  due_date?: string | null;
  canceledAt?: string | null;
  card?: {
    holderName?: string;
    lastDigits?: string;
    brand?: string;
  };
  pix?: {
    qrCode?: string;
    expirationDate?: string;
  };
};
