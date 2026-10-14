import { NextRequest, NextResponse } from "next/server";
import { CAKTO_CONFIG, isCaktoConfigured, isWebhookConfigured, unsignedWebhooksAllowed } from "@/lib/cakto/config";
import { cancelCaktoSubscription, verifyCaktoWebhookSignature } from "@/lib/cakto/client";
import { planForOffer } from "@/lib/cakto/plans";
import {
  addPaymentRecord,
  claimWebhookEvent,
  finishWebhookEvent,
  getCheckoutSession,
  updateRestaurantSubscription,
  webhookEventKey,
  type CheckoutSessionRecord,
} from "@/lib/cakto/server-db";
import { CaktoWebhookPayload, PaymentRecord, RestaurantSubscription } from "@/lib/cakto/types";
import { recordSyncFailure } from "@/lib/billing/server";
import { CATALOG_VERSION } from "@/lib/billing/plans";
import { adminDb } from "@/lib/firebase-admin";

const IGNORED = new Set(["checkout_abandonment", "pix_gerado", "boleto_gerado", "refund_requested"]);

/**
 * Webhook da Cakto (docs/PLANOS.md, "Cobrança"). Regras:
 * - sem assinatura válida (HMAC ou segredo), nada é processado; sem CAKTO_WEBHOOK_SECRET configurado, também não;
 * - o plano só é ativado quando a oferta paga é a esperada para o plano escolhido no checkout;
 * - cada evento é processado uma vez (reentregas respondem 200 sem efeito); se o processamento falhar, a próxima
 *   entrega da Cakto tenta de novo;
 * - eventos de uma assinatura que já foi substituída (upgrade) não mexem na assinatura atual.
 */
export async function POST(request: NextRequest) {
  const rawBuffer = Buffer.from(await request.arrayBuffer());
  const rawBodyText = rawBuffer.toString("utf-8");
  let payload: CaktoWebhookPayload;
  try {
    payload = JSON.parse(rawBodyText);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (isWebhookConfigured()) {
    const valid = verifyCaktoWebhookSignature({
      rawBody: rawBuffer,
      timestamp: request.headers.get("x-cakto-timestamp"),
      signature: request.headers.get("x-cakto-signature"),
      bodySecret: payload.secret,
      secret: CAKTO_CONFIG.webhookSecret,
    });
    if (!valid) {
      console.warn("[Cakto Webhook] Assinatura inválida: evento recusado.");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (!unsignedWebhooksAllowed()) {
    console.error("[Cakto Webhook] CAKTO_WEBHOOK_SECRET não configurado: evento recusado (nenhuma assinatura é ativada sem confirmação autêntica).");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const { event, data } = payload;
  if (!event || !data) return NextResponse.json({ error: "Missing event or data" }, { status: 400 });
  if (IGNORED.has(event)) return NextResponse.json({ received: true, ignored: event }, { status: 200 });

  const key = webhookEventKey(event, data.id, rawBodyText);
  if ((await claimWebhookEvent(key, event, payload)) === "duplicate") {
    return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
  }

  try {
    const outcome = await processEvent(payload, key);
    await finishWebhookEvent(key, outcome);
    return NextResponse.json({ received: true, event, ...outcome }, { status: 200 });
  } catch (error) {
    console.error("[Cakto Webhook] Falha ao processar:", (error as Error)?.message);
    await finishWebhookEvent(key, { status: "failed", note: String((error as Error)?.message || "erro").slice(0, 200) }).catch(() => undefined);
    // 500: a Cakto reenvia e o evento é processado de novo.
    return NextResponse.json({ error: "Internal server error processing webhook" }, { status: 500 });
  }
}

type Outcome = { status: "done" | "ignored"; restaurantId?: string | null; note?: string };

async function findRestaurantBySubscription(subscriptionId: string | undefined) {
  if (!subscriptionId) return null;
  const snap = await adminDb().collection("restaurantes").where("subscription.caktoSubscriptionId", "==", subscriptionId).limit(1).get();
  return snap.empty ? null : snap.docs[0].id;
}

async function findRestaurantByEmail(email: string | undefined) {
  if (!email) return null;
  const normalized = email.toLowerCase().trim();
  const db = adminDb();
  const users = await db.collection("usuarios").where("email", "==", normalized).limit(1).get();
  const ids = users.empty ? null : (users.docs[0].get("restaurantIds") as string[] | undefined);
  if (ids?.length) return ids[0];
  const owned = await db.collection("restaurantes").where("ownerEmail", "==", normalized).limit(1).get();
  return owned.empty ? null : owned.docs[0].id;
}

async function processEvent(payload: CaktoWebhookPayload, key: string): Promise<Outcome> {
  const { event, data } = payload;
  const db = adminDb();
  const nowIso = new Date().toISOString();
  const amount = typeof data.amount === "number" ? data.amount : Number(data.amount || 0);
  const amountFormatted = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amount);
  const session: CheckoutSessionRecord | null = data.callback ? await getCheckoutSession(data.callback) : null;
  const providerSubscriptionId = data.subscription?.id || undefined;

  const restaurantId = session?.restaurantId || (await findRestaurantBySubscription(providerSubscriptionId)) || (await findRestaurantByEmail(data.customer?.email));
  if (!restaurantId) {
    await recordSyncFailure("webhook_restaurant_not_found", { event, orderId: data.id || null, eventKey: key });
    return { status: "ignored", note: "restaurant_not_found" };
  }
  const restaurant = await db.collection("restaurantes").doc(restaurantId).get();
  if (!restaurant.exists) return { status: "ignored", note: "restaurant_missing" };
  const current = (restaurant.get("subscription") as Partial<RestaurantSubscription> | undefined) || null;
  // Evento de uma assinatura que não é a atual (ex.: a antiga, depois de um upgrade): não altera o plano.
  const belongsToCurrent = !providerSubscriptionId || !current?.caktoSubscriptionId || current.caktoSubscriptionId === providerSubscriptionId;

  const payment = (status: PaymentRecord["status"], extra: Partial<PaymentRecord> = {}): PaymentRecord => ({
    id: data.id || `pay_${Date.now()}`,
    orderId: data.id || "",
    refId: data.refId || null,
    amount,
    amountFormatted,
    status,
    paymentMethod: data.paymentMethod || "unknown",
    paymentMethodName: data.paymentMethodName || null,
    cardBrand: data.card?.brand || null,
    cardLastDigits: data.card?.lastDigits || null,
    paidAt: status === "paid" ? data.paidAt || nowIso : null,
    createdAt: data.createdAt || nowIso,
    checkoutUrl: data.checkoutUrl || null,
    ...extra,
  });

  switch (event) {
    case "purchase_approved": {
      const offerId = data.offer?.id || "";
      let planId: string | null = null;
      let legacy = false;
      if (session) {
        if (!offerId || offerId !== session.expectedOfferId) {
          await recordSyncFailure("offer_mismatch", { restaurantId, event, orderId: data.id || null, expectedOfferId: session.expectedOfferId, receivedOfferId: offerId || null, planId: session.planId, eventKey: key });
          await addPaymentRecord(restaurantId, payment("paid"));
          return { status: "ignored", restaurantId, note: "offer_mismatch" };
        }
        planId = session.planId;
      } else {
        const mapped = planForOffer(offerId);
        if (!mapped) {
          await recordSyncFailure("unknown_offer", { restaurantId, event, orderId: data.id || null, receivedOfferId: offerId || null, eventKey: key });
          await addPaymentRecord(restaurantId, payment("paid"));
          return { status: "ignored", restaurantId, note: "unknown_offer" };
        }
        planId = mapped.planId;
        legacy = mapped.legacy;
      }
      const periodEnd = data.subscription?.next_payment_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await updateRestaurantSubscription(
        restaurantId,
        {
          planId: planId as RestaurantSubscription["planId"],
          planVersion: legacy ? 1 : CATALOG_VERSION,
          status: "active",
          cycle: legacy ? current?.cycle || "monthly" : "monthly",
          priceCents: Math.round(amount * 100),
          caktoSubscriptionId: providerSubscriptionId || null,
          caktoOrderId: data.id || null,
          caktoOfferId: offerId || null,
          paymentMethod: data.paymentMethod || null,
          paymentMethodName: data.paymentMethodName || null,
          cardBrand: data.card?.brand || null,
          cardLastDigits: data.card?.lastDigits || null,
          currentPeriodStart: data.paidAt || nowIso,
          currentPeriodEnd: periodEnd,
          nextPaymentDate: periodEnd,
          trialEndsAt: null,
          canceledAt: null,
          lateSince: null,
          cancelAtPeriodEnd: false,
          scheduledChange: null,
        },
        { kind: "webhook" },
        `Pagamento aprovado (${session?.kind || "compra direta"}): plano ${planId}`,
        `cakto-${key}`,
      );
      await addPaymentRecord(restaurantId, payment("paid"));

      // Troca de plano: a assinatura anterior no gateway para de cobrar.
      const previous = session?.previousProviderSubscriptionId;
      if (previous && previous !== providerSubscriptionId) {
        try {
          if (!isCaktoConfigured()) throw new Error("Cakto não configurada");
          await cancelCaktoSubscription(previous);
        } catch (error) {
          await recordSyncFailure("cancel_previous_subscription", { restaurantId, previousSubscriptionId: previous, newSubscriptionId: providerSubscriptionId || null, message: String((error as Error)?.message || "").slice(0, 200) });
        }
      }
      return { status: "done", restaurantId };
    }

    case "subscription_created":
    case "subscription_renewed": {
      // Assinatura nova de um checkout: só vale se a oferta for a esperada para o plano escolhido.
      if (session && data.offer?.id && data.offer.id !== session.expectedOfferId) {
        await recordSyncFailure("offer_mismatch", { restaurantId, event, expectedOfferId: session.expectedOfferId, receivedOfferId: data.offer.id, eventKey: key });
        return { status: "ignored", restaurantId, note: "offer_mismatch" };
      }
      // Sem plano registrado e sem checkout correspondente: quem define o plano é a compra aprovada.
      if (!current?.planId && !session) return { status: "ignored", restaurantId, note: "waiting_purchase" };
      if (!belongsToCurrent && !(event === "subscription_created" && session)) {
        await recordSyncFailure("event_for_replaced_subscription", { restaurantId, event, subscriptionId: providerSubscriptionId || null, currentSubscriptionId: current?.caktoSubscriptionId || null, orderId: data.id || null });
        if (event === "subscription_renewed") await addPaymentRecord(restaurantId, payment("paid"));
        return { status: "ignored", restaurantId, note: "replaced_subscription" };
      }
      const next = data.subscription?.next_payment_date || null;
      await updateRestaurantSubscription(
        restaurantId,
        {
          status: "active",
          caktoSubscriptionId: providerSubscriptionId || current?.caktoSubscriptionId || null,
          ...(next ? { nextPaymentDate: next, currentPeriodEnd: next } : {}),
          ...(event === "subscription_renewed" ? { currentPeriodStart: data.paidAt || nowIso } : {}),
          lateSince: null,
        },
        { kind: "webhook" },
        event === "subscription_renewed" ? "Renovação aprovada" : "Assinatura criada no gateway",
        `cakto-${key}`,
      );
      if (event === "subscription_renewed") await addPaymentRecord(restaurantId, payment("paid"));
      return { status: "done", restaurantId };
    }

    case "subscription_renewal_refused":
    case "subscription_late": {
      if (!belongsToCurrent) return { status: "ignored", restaurantId, note: "replaced_subscription" };
      await updateRestaurantSubscription(restaurantId, { status: "past_due", lateSince: current?.lateSince || nowIso }, { kind: "webhook" }, "Cobrança recusada ou em atraso", `cakto-${key}`);
      return { status: "done", restaurantId };
    }

    case "subscription_late_recovered":
    case "subscription_resumed": {
      if (!belongsToCurrent) return { status: "ignored", restaurantId, note: "replaced_subscription" };
      await updateRestaurantSubscription(restaurantId, { status: "active", lateSince: null }, { kind: "webhook" }, "Pagamento regularizado", `cakto-${key}`);
      return { status: "done", restaurantId };
    }

    case "subscription_canceled":
    case "subscription_paused": {
      // O cancelamento da assinatura ANTIGA (depois de um upgrade) chega aqui e não pode encerrar a nova.
      if (!belongsToCurrent) return { status: "ignored", restaurantId, note: "replaced_subscription" };
      await updateRestaurantSubscription(restaurantId, { status: "canceled", canceledAt: data.canceledAt || nowIso, cancelAtPeriodEnd: true }, { kind: "webhook" }, "Assinatura cancelada no gateway", `cakto-${key}`);
      return { status: "done", restaurantId };
    }

    case "refund":
    case "chargeback": {
      if (data.id) await addPaymentRecord(restaurantId, payment("refunded", { id: `refund_${data.id}`, amountFormatted: `-${amountFormatted}`, paidAt: nowIso }));
      // Só encerra o acesso quando o estorno é do pagamento da assinatura atual.
      const currentOrder = !data.id || !current?.caktoOrderId || current.caktoOrderId === data.id;
      if (belongsToCurrent && currentOrder) {
        await updateRestaurantSubscription(restaurantId, { status: "expired" }, { kind: "webhook" }, event === "refund" ? "Pagamento estornado" : "Chargeback", `cakto-${key}`);
      } else {
        await recordSyncFailure("refund_of_other_payment", { restaurantId, event, orderId: data.id || null });
      }
      return { status: "done", restaurantId };
    }

    case "purchase_refused": {
      if (data.id) await addPaymentRecord(restaurantId, payment("refused", { createdAt: nowIso }));
      return { status: "done", restaurantId };
    }

    default:
      return { status: "ignored", restaurantId, note: `event_${event}` };
  }
}
