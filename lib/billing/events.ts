/**
 * Mapeia eventos de webhook da Cakto para transições do nosso modelo.
 * Importante: processamento idempotente é responsabilidade do chamador.
 */

import type { SubscriptionStatus } from "./subscriptions";

export type CaktoEvent =
  | "checkout_abandonment"
  | "purchase_approved"
  | "purchase_refused"
  | "refund"
  | "refund_requested"
  | "chargeback"
  | "pix_gerado"
  | "boleto_gerado"
  | "picpay_gerado"
  | "openfinance_nubank_gerado"
  | "subscription_created"
  | "subscription_renewed"
  | "subscription_renewal_refused"
  | "subscription_paused"
  | "subscription_resumed"
  | "subscription_late"
  | "subscription_late_recovered"
  | "subscription_canceled";

export const SUBSCRIPTION_EVENT_TO_STATUS: Partial<Record<CaktoEvent, SubscriptionStatus>> = {
  subscription_created: "active",
  subscription_renewed: "active",
  subscription_renewal_refused: "past_due",
  subscription_paused: "paused",
  subscription_resumed: "active",
  subscription_late: "past_due",
  subscription_late_recovered: "active",
  subscription_canceled: "canceled",
};

export type CaktoWebhookPayloadData = {
  id?: string;
  refId?: string;
  status?: string;
  amount?: string | number;
  discount?: string | number;
  customer?: { name?: string; email?: string; id?: string };
  product?: { id?: string; name?: string };
  offer?: { id?: string; name?: string } | string;
  subscription?:
    | ({
        id?: string;
        status?: string;
        next_payment_date?: string | null;
        current_period_end?: string | null;
        currentPeriodEnd?: string | null;
        offer?: string;
        amount?: string | number;
      } & Record<string, unknown>)
    | null;
};
