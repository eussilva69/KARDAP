import { NextRequest, NextResponse } from "next/server";
import { caktoGetSubscription, verifyCaktoWebhook } from "@/lib/billing/cakto";
import { resolvePlanByOfferId } from "@/lib/billing/plans";
import {
  bindCaktoSubscription,
  findUidByCaktoSubscription,
  findUidByCustomerEmail,
  isEventAlreadyProcessed,
  recordPayment,
  updateSubscription,
  type SubscriptionStatus,
} from "@/lib/billing/subscriptions";
import { SUBSCRIPTION_EVENT_TO_STATUS, type CaktoEvent, type CaktoWebhookPayloadData } from "@/lib/billing/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook da Cakto.
 *
 * Fluxo:
 * 1. Lê o corpo bruto (necessário para o HMAC).
 * 2. Valida `X-Cakto-Signature` + `X-Cakto-Timestamp` contra `CAKTO_WEBHOOK_SECRET`.
 * 3. Resolve o `uid` via índice por subscription id ou por e-mail do cliente.
 * 4. Checa idempotência por eventId.
 * 5. Atualiza o estado da assinatura e registra pagamento quando aplicável.
 * 6. Responde 200 rapidamente — qualquer erro irrecuperável retorna 500 para
 *    forçar reentrega.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-cakto-signature");
  const timestamp = request.headers.get("x-cakto-timestamp");

  const verification = verifyCaktoWebhook({
    rawBody,
    signatureHeader: signature,
    timestampHeader: timestamp,
  });

  if (!verification.ok) {
    console.warn("[cakto webhook] rejected", verification.reason);
    return NextResponse.json({ error: verification.reason }, { status: 401 });
  }

  const event = verification.event as CaktoEvent;
  const data = (verification.data || {}) as CaktoWebhookPayloadData;

  try {
    // 1. Correlacionar com o usuário
    const subId = data.subscription?.id || null;
    const customerEmail = data.customer?.email?.toLowerCase() || null;

    let uid: string | null = null;
    if (subId) uid = await findUidByCaktoSubscription(subId);
    if (!uid && customerEmail) uid = await findUidByCustomerEmail(customerEmail);

    if (!uid) {
      // Sem correspondência: evento não relacionado ao SaaS (ou pending ainda
      // não registrado). Respondemos 200 para não reentregar indefinidamente.
      console.warn("[cakto webhook] user not found", { event, subId, customerEmail });
      return NextResponse.json({ ok: true, skipped: "user_not_found" });
    }

    // 2. Idempotência: usa `id` do payload como chave do evento
    const eventId = `${event}:${data.id || data.refId || subId || Math.random().toString(36).slice(2)}`;
    if (await isEventAlreadyProcessed(uid, eventId)) {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    // 3. Resolver plano por offer id (quando presente)
    const offerIdFromPayload = typeof data.offer === "string" ? data.offer : data.offer?.id || data.subscription?.offer || "";
    const resolvedPlan = offerIdFromPayload ? resolvePlanByOfferId(offerIdFromPayload) : null;

    // 4. Transições
    const now = new Date().toISOString();
    const patch: Partial<Parameters<typeof updateSubscription>[1]> = {};

    if (subId) {
      await bindCaktoSubscription(uid, subId);
      patch.caktoSubscriptionId = subId;
    }
    if (data.customer?.id) patch.caktoCustomerId = data.customer.id;
    if (customerEmail) patch.caktoCustomerEmail = customerEmail;
    if (resolvedPlan) {
      patch.planId = resolvedPlan.plan.id;
      patch.period = resolvedPlan.offer.period;
      patch.caktoOfferId = resolvedPlan.offer.offerId;
    }

    // Status derivado do evento
    const mapped = SUBSCRIPTION_EVENT_TO_STATUS[event] as SubscriptionStatus | undefined;
    if (mapped) patch.status = mapped;

    // Pagamentos
    if (event === "purchase_approved") {
      await recordPayment(uid, {
        orderId: String(data.id || data.refId || `order-${Date.now()}`),
        caktoOrderRef: data.refId || null,
        status: "approved",
        amount: data.amount ?? null,
        createdAt: now,
        event,
      });
      // Primeira cobrança aprovada: considera ativa mesmo se o webhook de
      // subscription_created vier depois (fora de ordem).
      if (!patch.status) patch.status = "active";
      if (!patch.startedAt) patch.startedAt = now;
    }
    if (event === "purchase_refused") {
      await recordPayment(uid, {
        orderId: String(data.id || data.refId || `order-${Date.now()}`),
        caktoOrderRef: data.refId || null,
        status: "refused",
        amount: data.amount ?? null,
        createdAt: now,
        event,
      });
      if (!patch.status) patch.status = "past_due";
    }
    if (event === "refund" || event === "chargeback") {
      await recordPayment(uid, {
        orderId: String(data.id || data.refId || `order-${Date.now()}`),
        caktoOrderRef: data.refId || null,
        status: event === "refund" ? "refunded" : "chargeback",
        amount: data.amount ?? null,
        createdAt: now,
        event,
      });
      patch.status = "canceled";
      patch.canceledAt = now;
    }

    // Datas de ciclo quando a Cakto envia
    if (data.subscription?.next_payment_date) patch.nextPaymentDate = data.subscription.next_payment_date;
    const periodEnd = data.subscription?.currentPeriodEnd || data.subscription?.current_period_end;
    if (periodEnd) patch.currentPeriodEnd = periodEnd;

    // 5. Reconciliação opcional: para eventos de assinatura, consulta o estado real
    if (subId && (event === "subscription_created" || event === "subscription_renewed")) {
      try {
        const live = await caktoGetSubscription(subId);
        if (live?.next_payment_date) patch.nextPaymentDate = live.next_payment_date;
        if (live?.amount) patch.amount = live.amount;
        if (live?.status) {
          const liveStatus = live.status === "late" ? "past_due" : (live.status as SubscriptionStatus);
          patch.status = liveStatus;
        }
      } catch (err) {
        console.warn("[cakto webhook] live reconcile failed", err);
      }
    }

    if (event === "subscription_canceled") {
      patch.canceledAt = now;
    }

    await updateSubscription(uid, patch);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[cakto webhook] processing error", err);
    // 500 pede reentrega pela Cakto
    return NextResponse.json({ error: "processing_error" }, { status: 500 });
  }
}
