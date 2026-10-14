import { createHash } from "node:crypto";
import { adminDb } from "../firebase-admin";
import { applySubscriptionChange, type Actor } from "../billing/server";
import { CATALOG_VERSION, isPlanId, shortPlanName, type StoredSubscription } from "../billing/plans";
import { PaymentRecord, RestaurantSubscription } from "./types";
import type { CheckoutPlanId } from "./plans";

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

export type CheckoutKind = "new" | "upgrade" | "downgrade" | "renew";

export type CheckoutSessionRecord = {
  token: string;
  restaurantId: string;
  userId: string;
  planId: CheckoutPlanId;
  cycle: "monthly";
  /** Oferta que precisa chegar no webhook para este checkout ativar o plano (pagar outra oferta não vale). */
  expectedOfferId: string;
  priceCents: number;
  kind: CheckoutKind;
  previousPlanId?: string | null;
  /** Assinatura anterior no gateway, cancelada depois que a nova for confirmada (troca de plano). */
  previousProviderSubscriptionId?: string | null;
  userEmail?: string;
  createdAt: string;
  expiresAt: string;
};

/**
 * Registra uma sessão de checkout para correlacionar o comprador com o restaurante.
 * O token é passado via `?callback={token}` na URL do checkout da Cakto.
 */
export async function createCheckoutSession(session: Omit<CheckoutSessionRecord, "createdAt" | "expiresAt">): Promise<void> {
  const now = new Date();
  const record: CheckoutSessionRecord = { ...session, createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString() };
  await adminDb().collection("cakto_checkout_sessions").doc(session.token).set(record);
}

/** Recupera uma sessão de checkout pelo token opaco recebido no webhook. */
export async function getCheckoutSession(token: string): Promise<CheckoutSessionRecord | null> {
  if (!token || typeof token !== "string" || token.length > 100) return null;
  const doc = await adminDb().collection("cakto_checkout_sessions").doc(token).get();
  return doc.exists ? (doc.data() as CheckoutSessionRecord) : null;
}

// ───────────────────────── Idempotência do webhook ─────────────────────────

/**
 * Chave do evento: tipo + pedido (a Cakto manda "assinatura criada" e "compra aprovada" do mesmo pedido, que são
 * eventos diferentes). Sem identificador, o próprio corpo: só a repetição exata é descartada.
 */
export function webhookEventKey(event: string, dataId: string | undefined, rawBody: string) {
  const base = dataId ? `${event}:${dataId}` : `${event}:corpo:${createHash("sha256").update(rawBody).digest("hex")}`;
  return createHash("sha256").update(base).digest("hex").slice(0, 40);
}

/**
 * Reserva o processamento do evento. "duplicate" quando já foi concluído ou outro processamento está em andamento
 * (há menos de 2 minutos). Um processamento que falhou pode ser refeito na próxima entrega da Cakto.
 */
export async function claimWebhookEvent(key: string, event: string, payload: { data?: { id?: string; refId?: string; status?: string } }): Promise<"new" | "duplicate"> {
  const db = adminDb();
  const ref = db.collection("cakto_webhook_events").doc(key);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const status = snap.get("status");
    const started = Date.parse(String(snap.get("startedAt") || ""));
    if (snap.exists && (status === "done" || status === "ignored" || (status === "processing" && Date.now() - started < 120_000))) return "duplicate";
    tx.set(ref, {
      eventId: key,
      event,
      status: "processing",
      attempts: (Number(snap.get("attempts")) || 0) + 1,
      startedAt: new Date().toISOString(),
      orderId: payload?.data?.id || null,
      refId: payload?.data?.refId || null,
      providerStatus: payload?.data?.status || null,
    }, { merge: true });
    return "new";
  });
}

export async function finishWebhookEvent(key: string, result: { status: "done" | "ignored" | "failed"; restaurantId?: string | null; note?: string }) {
  await adminDb()
    .collection("cakto_webhook_events")
    .doc(key)
    .set({ status: result.status, restaurantId: result.restaurantId || null, note: result.note || null, finishedAt: new Date().toISOString() }, { merge: true });
}

// ───────────────────────── Assinatura ─────────────────────────

/**
 * Atualiza a assinatura do restaurante preservando o que não veio no patch (personalizações, mudança agendada…)
 * e registra a mudança em eventosAssinatura. Dados do cartão vão para o documento privado.
 */
export async function updateRestaurantSubscription(
  restaurantId: string,
  subscriptionData: Partial<RestaurantSubscription>,
  actor: Actor = { kind: "webhook" },
  reason = "Atualização da cobrança (Cakto)",
  eventId?: string,
): Promise<void> {
  const { cardBrand, cardLastDigits, ...publicData } = subscriptionData;
  const patch: Partial<StoredSubscription> = { ...(publicData as Partial<StoredSubscription>), paymentProvider: "cakto" };
  if (isPlanId(patch.planId)) {
    patch.planName = shortPlanName(patch.planId);
    if (patch.planVersion === undefined) patch.planVersion = CATALOG_VERSION;
  }
  const db = adminDb();
  const exists = (await db.collection("restaurantes").doc(restaurantId).get()).exists;
  if (!exists) {
    console.warn(`[Cakto DB] Restaurante ${restaurantId} não encontrado para atualizar assinatura.`);
    return;
  }
  await applySubscriptionChange(restaurantId, patch, actor, reason, eventId);
  if (cardBrand !== undefined || cardLastDigits !== undefined) {
    await privateSubscriptionRef(restaurantId).set({ cardBrand: cardBrand || null, cardLastDigits: cardLastDigits || null, updatedAt: new Date().toISOString() }, { merge: true });
  }
}

/** Adiciona um registro de histórico de pagamento na subcoleção do restaurante. */
export async function addPaymentRecord(restaurantId: string, payment: PaymentRecord): Promise<void> {
  const id = payment.orderId || payment.id || `pay_${Date.now()}`;
  await adminDb().collection("restaurantes").doc(restaurantId).collection("pagamentos").doc(id).set(payment, { merge: true });
}

/** Consulta a assinatura atual e o histórico de pagamentos de um restaurante. */
export async function getRestaurantSubscriptionWithHistory(restaurantId: string): Promise<{ subscription: RestaurantSubscription | null; payments: PaymentRecord[] }> {
  const db = adminDb();
  const restaurantDoc = await db.collection("restaurantes").doc(restaurantId).get();
  if (!restaurantDoc.exists) return { subscription: null, payments: [] };
  const stored = (restaurantDoc.data()?.subscription as RestaurantSubscription) || null;
  const subscription = stored ? ({ ...stored, ...(await readPrivateSubscription(restaurantId)) } as RestaurantSubscription) : null;
  const paymentsSnap = await db.collection("restaurantes").doc(restaurantId).collection("pagamentos").orderBy("createdAt", "desc").limit(20).get();
  const payments = paymentsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PaymentRecord, "id">) }));
  return { subscription, payments };
}
