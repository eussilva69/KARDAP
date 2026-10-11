import { adminDb } from "../firebase-admin";
import { PaymentRecord, PlanId, RestaurantSubscription } from "./types";
import { PLANS } from "./plans";

/**
 * Dados do cartão ficam fora do documento do restaurante, que é público por causa do cardápio.
 * Ficam em restaurantes/{id}/privado/assinatura, legível só pela equipe do restaurante e por admins.
 */
const PRIVATE_SUBSCRIPTION_FIELDS = ["cardBrand", "cardLastDigits"] as const;
type PrivateSubscriptionData = Partial<Pick<RestaurantSubscription, (typeof PRIVATE_SUBSCRIPTION_FIELDS)[number]>>;

function privateSubscriptionRef(restaurantId: string) {
  return adminDb().collection("restaurantes").doc(restaurantId).collection("privado").doc("assinatura");
}

async function readPrivateSubscription(restaurantId: string): Promise<PrivateSubscriptionData> {
  const snap = await privateSubscriptionRef(restaurantId).get();
  const data = (snap.exists ? snap.data() : null) || {};
  const picked: PrivateSubscriptionData = {};
  for (const key of PRIVATE_SUBSCRIPTION_FIELDS) if (data[key]) picked[key] = data[key];
  return picked;
}

export type CheckoutSessionRecord = {
  token: string;
  restaurantId: string;
  userId: string;
  planId: PlanId;
  cycle: "monthly" | "annual";
  userEmail?: string;
  createdAt: string;
  expiresAt: string;
};

/**
 * Registra uma sessão de checkout para correlacionar o comprador com o restaurante.
 * O token é passado via `?callback={token}` na URL do checkout da Cakto.
 */
export async function createCheckoutSession(
  session: Omit<CheckoutSessionRecord, "createdAt" | "expiresAt">,
): Promise<void> {
  const db = adminDb();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 48 horas

  const record: CheckoutSessionRecord = {
    ...session,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  await db.collection("cakto_checkout_sessions").doc(session.token).set(record);
}

/**
 * Recupera uma sessão de checkout ativa pelo token opaco recebido no webhook.
 */
export async function getCheckoutSession(token: string): Promise<CheckoutSessionRecord | null> {
  if (!token) return null;
  const db = adminDb();
  const doc = await db.collection("cakto_checkout_sessions").doc(token).get();
  if (!doc.exists) return null;
  return doc.data() as CheckoutSessionRecord;
}

/**
 * Garante idempotência verificando e registrando o processamento do evento de webhook.
 * Retorna true se o evento JÁ havia sido processado anteriormente (duplicado).
 */
export async function checkAndMarkWebhookEvent(
  eventId: string,
  event: string,
  payload: any,
): Promise<boolean> {
  if (!eventId) return false;
  const db = adminDb();
  const ref = db.collection("cakto_webhook_events").doc(eventId);

  const doc = await ref.get();
  if (doc.exists) {
    return true; // Já processado
  }

  await ref.set({
    eventId,
    event,
    processedAt: new Date().toISOString(),
    orderId: payload?.data?.id || null,
    refId: payload?.data?.refId || null,
    status: payload?.data?.status || null,
  });

  return false;
}

/**
 * Atualiza os dados da assinatura de um restaurante no Firestore.
 */
export async function updateRestaurantSubscription(
  restaurantId: string,
  subscriptionData: Partial<RestaurantSubscription>,
): Promise<void> {
  const db = adminDb();
  const ref = db.collection("restaurantes").doc(restaurantId);

  const doc = await ref.get();
  if (!doc.exists) {
    console.warn(`[Cakto DB] Restaurante ${restaurantId} não encontrado para atualizar assinatura.`);
    return;
  }

  const stored = (doc.data()?.subscription as RestaurantSubscription) || null;
  // Junta a parte privada para que a mesclagem abaixo enxergue o cartão já salvo.
  const existing = stored ? ({ ...stored, ...(await readPrivateSubscription(restaurantId)) } as RestaurantSubscription) : null;
  const now = new Date().toISOString();

  const planId = subscriptionData.planId || existing?.planId || "essencial";
  const planConfig = PLANS[planId] || PLANS.essencial;

  const merged: RestaurantSubscription = {
    planId,
    planName: planConfig.name,
    status: subscriptionData.status || existing?.status || "active",
    cycle: subscriptionData.cycle || existing?.cycle || "monthly",
    priceCents: subscriptionData.priceCents ?? existing?.priceCents ?? planConfig.prices.monthly.cents,
    caktoSubscriptionId:
      subscriptionData.caktoSubscriptionId !== undefined
        ? subscriptionData.caktoSubscriptionId
        : existing?.caktoSubscriptionId || null,
    caktoOrderId:
      subscriptionData.caktoOrderId !== undefined
        ? subscriptionData.caktoOrderId
        : existing?.caktoOrderId || null,
    caktoOfferId:
      subscriptionData.caktoOfferId !== undefined
        ? subscriptionData.caktoOfferId
        : existing?.caktoOfferId || null,
    paymentMethod:
      subscriptionData.paymentMethod !== undefined
        ? subscriptionData.paymentMethod
        : existing?.paymentMethod || null,
    paymentMethodName:
      subscriptionData.paymentMethodName !== undefined
        ? subscriptionData.paymentMethodName
        : existing?.paymentMethodName || null,
    cardBrand:
      subscriptionData.cardBrand !== undefined
        ? subscriptionData.cardBrand
        : existing?.cardBrand || null,
    cardLastDigits:
      subscriptionData.cardLastDigits !== undefined
        ? subscriptionData.cardLastDigits
        : existing?.cardLastDigits || null,
    currentPeriodStart:
      subscriptionData.currentPeriodStart !== undefined
        ? subscriptionData.currentPeriodStart
        : existing?.currentPeriodStart || now,
    currentPeriodEnd:
      subscriptionData.currentPeriodEnd !== undefined
        ? subscriptionData.currentPeriodEnd
        : existing?.currentPeriodEnd || null,
    nextPaymentDate:
      subscriptionData.nextPaymentDate !== undefined
        ? subscriptionData.nextPaymentDate
        : existing?.nextPaymentDate || null,
    trialEndsAt:
      subscriptionData.trialEndsAt !== undefined
        ? subscriptionData.trialEndsAt
        : existing?.trialEndsAt || null,
    canceledAt:
      subscriptionData.canceledAt !== undefined
        ? subscriptionData.canceledAt
        : existing?.canceledAt || null,
    lateSince:
      subscriptionData.lateSince !== undefined
        ? subscriptionData.lateSince
        : existing?.lateSince || null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  const { cardBrand, cardLastDigits, ...publicSubscription } = merged;
  // Substitui o mapa inteiro: dados de cartão gravados ali por versões antigas saem do documento público.
  await ref.update({
    subscription: publicSubscription,
    updatedAt: now,
  });
  await privateSubscriptionRef(restaurantId).set({ cardBrand: cardBrand || null, cardLastDigits: cardLastDigits || null, updatedAt: now }, { merge: true });
}

/**
 * Adiciona um registro de histórico de pagamento na subcoleção do restaurante.
 */
export async function addPaymentRecord(
  restaurantId: string,
  payment: PaymentRecord,
): Promise<void> {
  const db = adminDb();
  const id = payment.orderId || payment.id || `pay_${Date.now()}`;
  await db
    .collection("restaurantes")
    .doc(restaurantId)
    .collection("pagamentos")
    .doc(id)
    .set(payment, { merge: true });
}

/**
 * Consulta a assinatura atual e o histórico de pagamentos de um restaurante.
 */
export async function getRestaurantSubscriptionWithHistory(restaurantId: string): Promise<{
  subscription: RestaurantSubscription | null;
  payments: PaymentRecord[];
}> {
  const db = adminDb();
  const restaurantDoc = await db.collection("restaurantes").doc(restaurantId).get();

  if (!restaurantDoc.exists) {
    return { subscription: null, payments: [] };
  }

  const data = restaurantDoc.data();
  const stored = (data?.subscription as RestaurantSubscription) || null;
  const subscription = stored ? ({ ...stored, ...(await readPrivateSubscription(restaurantId)) } as RestaurantSubscription) : null;

  // Busca histórico de pagamentos ordenados por data
  const paymentsSnap = await db
    .collection("restaurantes")
    .doc(restaurantId)
    .collection("pagamentos")
    .orderBy("createdAt", "desc")
    .limit(20)
    .get();

  const payments = paymentsSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<PaymentRecord, "id">),
  }));

  return { subscription, payments };
}
