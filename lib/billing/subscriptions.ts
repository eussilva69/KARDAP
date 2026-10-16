/**
 * Camada de banco das assinaturas no Firestore (via firebase-admin).
 *
 * Documentos:
 *   usuarios/{uid}/assinatura/current   → documento único com a assinatura ativa/último estado
 *   usuarios/{uid}/assinatura/current/eventos/{eventId}   → ids de eventos já processados (idempotência)
 *   usuarios/{uid}/assinatura/current/pagamentos/{orderId} → histórico de pagamentos
 *
 * Também mantemos um índice por caktoSubscriptionId e por e-mail do cliente
 * para correlacionar eventos de webhook ao usuário correto:
 *   indices/cakto_subscription/{subscriptionId}  → { uid }
 *   indices/cakto_customer_email/{emailLower}    → { uid }
 */

import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import type { PlanId, PlanPeriod } from "./plans";

export type SubscriptionStatus =
  | "pending"     // criada no SaaS, aguardando pagamento inicial
  | "active"
  | "trial"
  | "past_due"   // atrasada (cakto: "late")
  | "paused"
  | "canceled"
  | "expired"
  | "inactive";

export type SubscriptionRecord = {
  uid: string;
  planId: PlanId;
  period: PlanPeriod;
  caktoOfferId: string;
  caktoSubscriptionId?: string | null;
  caktoCustomerId?: string | null;
  caktoCustomerEmail?: string | null;
  status: SubscriptionStatus;
  amount?: string | number | null;
  currency?: string | null;
  startedAt?: string | null;
  currentPeriodEnd?: string | null;
  nextPaymentDate?: string | null;
  canceledAt?: string | null;
  lastEventAt?: string;
  updatedAt?: string;
  createdAt?: string;
};

export type PaymentRecord = {
  orderId: string;
  caktoOrderRef?: string | null;
  status: "approved" | "refused" | "refunded" | "chargeback" | "pending";
  amount?: string | number | null;
  method?: string | null;
  createdAt: string;
  event: string;
};

export function userSubRef(uid: string) {
  return adminDb().collection("usuarios").doc(uid).collection("assinatura").doc("current");
}

export async function getUserSubscription(uid: string): Promise<SubscriptionRecord | null> {
  const snap = await userSubRef(uid).get();
  return snap.exists ? (snap.data() as SubscriptionRecord) : null;
}

/**
 * Cria/atualiza a assinatura "pending" no momento em que o usuário clica
 * em contratar. Ela será promovida a `active` quando o webhook validar
 * o pagamento.
 */
export async function upsertPendingSubscription(input: {
  uid: string;
  email: string | null;
  planId: PlanId;
  period: PlanPeriod;
  caktoOfferId: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const ref = userSubRef(input.uid);
  const existing = await ref.get();
  // Nunca sobrescreve uma assinatura ativa ou em período pago.
  if (existing.exists) {
    const current = existing.data() as SubscriptionRecord;
    if (current.status === "active" || current.status === "trial") {
      // Já tem assinatura vigente — bloqueio no API handler.
      throw new Error("already_active");
    }
  }
  await ref.set(
    {
      uid: input.uid,
      planId: input.planId,
      period: input.period,
      caktoOfferId: input.caktoOfferId,
      caktoCustomerEmail: input.email ? input.email.toLowerCase() : null,
      status: "pending" as SubscriptionStatus,
      updatedAt: now,
      createdAt: existing.exists ? existing.data()?.createdAt || now : now,
    },
    { merge: true },
  );
  if (input.email) {
    await adminDb()
      .collection("indices")
      .doc("cakto_customer_email")
      .collection("map")
      .doc(input.email.toLowerCase())
      .set({ uid: input.uid, updatedAt: now }, { merge: true });
  }
}

export async function findUidByCaktoSubscription(subscriptionId: string): Promise<string | null> {
  const snap = await adminDb()
    .collection("indices").doc("cakto_subscription").collection("map").doc(subscriptionId).get();
  return snap.exists ? (snap.data()?.uid as string) || null : null;
}

export async function findUidByCustomerEmail(email: string): Promise<string | null> {
  const snap = await adminDb()
    .collection("indices").doc("cakto_customer_email").collection("map").doc(email.toLowerCase()).get();
  return snap.exists ? (snap.data()?.uid as string) || null : null;
}

export async function bindCaktoSubscription(uid: string, subscriptionId: string) {
  const now = new Date().toISOString();
  await adminDb()
    .collection("indices").doc("cakto_subscription").collection("map").doc(subscriptionId)
    .set({ uid, updatedAt: now }, { merge: true });
}

/**
 * Marca um eventId como processado em uma transação. Retorna `true` se já
 * havia sido processado (devemos ignorar) ou `false` se é a primeira vez.
 */
export async function isEventAlreadyProcessed(uid: string, eventId: string): Promise<boolean> {
  const ref = userSubRef(uid).collection("eventos").doc(eventId);
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return true;
    tx.set(ref, { processedAt: FieldValue.serverTimestamp() });
    return false;
  });
}

export async function updateSubscription(uid: string, patch: Partial<SubscriptionRecord>) {
  const now = new Date().toISOString();
  await userSubRef(uid).set({ ...patch, updatedAt: now, lastEventAt: now }, { merge: true });
}

export async function recordPayment(uid: string, payment: PaymentRecord) {
  await userSubRef(uid).collection("pagamentos").doc(payment.orderId).set(payment, { merge: true });
}

export async function listPayments(uid: string, limit = 20): Promise<PaymentRecord[]> {
  const snap = await userSubRef(uid).collection("pagamentos").orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs.map((d) => d.data() as PaymentRecord);
}

/** Regra de acesso: assinatura confirmada e vigente libera recursos pagos. */
export function hasPaidAccess(sub: SubscriptionRecord | null): boolean {
  if (!sub) return false;
  if (sub.status === "active" || sub.status === "trial") return true;
  // Período pago ainda não expirou mesmo após cancelamento
  if (sub.status === "canceled" && sub.currentPeriodEnd) {
    return new Date(sub.currentPeriodEnd).getTime() > Date.now();
  }
  return false;
}
