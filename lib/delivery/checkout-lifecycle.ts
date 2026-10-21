import { ONLINE_PAYMENT_METHODS } from "./types.ts";

export type CheckoutPaymentStatus = "pendente" | "aprovado" | "recusado" | "cancelado" | "estornado" | "chargeback";

export function mercadoPagoStatus(status: unknown): CheckoutPaymentStatus {
  if (status === "approved") return "aprovado";
  if (status === "rejected") return "recusado";
  if (status === "cancelled") return "cancelado";
  if (status === "refunded") return "estornado";
  if (status === "charged_back") return "chargeback";
  return "pendente";
}

export function shouldActivateOrder(paymentMethod: string, status: CheckoutPaymentStatus): boolean {
  return !ONLINE_PAYMENT_METHODS.has(paymentMethod) || status === "aprovado";
}

export function mercadoPagoIdempotencyKey(orderId: string, paymentMethod: string): string {
  return `kardap_del_${orderId}_${paymentMethod}`;
}
