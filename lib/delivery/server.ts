/**
 * Serviço de delivery (servidor): cria pedidos validados, altera status e consulta configuração.
 * Toda gravação passa por transação do Admin SDK — preços e totais são recalculados no servidor.
 */
import { adminDb } from "@/lib/firebase-admin";
import { BillingError, confirmNativeOrder, entitlementsFrom, monthlyUsage } from "@/lib/billing/server";
import type {
  CityDeliveryArea,
  DeliveryAddress,
  DeliveryCheckoutPayload,
  DeliveryConfig,
  DeliveryFeeResult,
  DeliveryOrder,
  DeliveryOrderItem,
  DeliveryOrderStatus,
  FeeMode,
  NeighborhoodEntry,
  ServedCity,
  StatusHistoryEntry,
} from "./types";
import { canTransition, DEFAULT_DELIVERY_CONFIG, isDeliveryStatus, normalizeCity, slugifyNeighborhood, TERMINAL_STATUSES } from "./types";

const restaurantRef = (id: string) => adminDb().collection("restaurantes").doc(id);

// ───────────────────────── Configuração ─────────────────────────

export async function getDeliveryConfig(restaurantId: string): Promise<DeliveryConfig> {
  const snap = await restaurantRef(restaurantId).get();
  if (!snap.exists) throw new BillingError("not_found", 404, "Estabelecimento não encontrado.");
  const raw = snap.get("delivery") as Partial<DeliveryConfig> | undefined;
  return { ...DEFAULT_DELIVERY_CONFIG, ...raw };
}

export async function saveDeliveryConfig(restaurantId: string, uid: string, patch: Partial<DeliveryConfig>): Promise<DeliveryConfig> {
  const db = adminDb();
  const ref = restaurantRef(restaurantId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new BillingError("not_found", 404, "Estabelecimento não encontrado.");
    if (snap.get("ownerId") !== uid) {
      const member = await tx.get(ref.collection("membros").doc(uid));
      if (!member.exists) throw new BillingError("forbidden", 403, "Você não faz parte da equipe deste estabelecimento.");
    }

    const entitlements = entitlementsFrom(snap);
    if (!entitlements.features.deliveryManagement) {
      throw new BillingError("plan_required", 402, "O delivery está disponível a partir do plano Pro.");
    }

    const current: DeliveryConfig = { ...DEFAULT_DELIVERY_CONFIG, ...(snap.get("delivery") as Partial<DeliveryConfig> | undefined) };
    const at = new Date().toISOString();

    const safe: Partial<DeliveryConfig> = {};
    if (typeof patch.enabled === "boolean") {
      safe.enabled = patch.enabled;
      if (patch.enabled && !current.enabled) safe.enabledAt = at;
      if (!patch.enabled && current.enabled) safe.disabledAt = at;
    }
    if (typeof patch.deliveryFeeCents === "number" && Number.isFinite(patch.deliveryFeeCents) && patch.deliveryFeeCents >= 0) {
      safe.deliveryFeeCents = Math.round(patch.deliveryFeeCents);
    }
    if (typeof patch.deliveryEta === "string") safe.deliveryEta = patch.deliveryEta.slice(0, 60);
    if (typeof patch.deliveryArea === "string") safe.deliveryArea = patch.deliveryArea.slice(0, 200);
    if (typeof patch.minOrderCents === "number" && Number.isFinite(patch.minOrderCents) && patch.minOrderCents >= 0) {
      safe.minOrderCents = Math.round(patch.minOrderCents);
    }
    if (Array.isArray(patch.paymentMethods)) {
      safe.paymentMethods = patch.paymentMethods.filter((m): m is string => typeof m === "string" && m.length <= 40).slice(0, 10);
    }
    if (typeof patch.notes === "string") safe.notes = patch.notes.slice(0, 500);
    if (typeof patch.feeMode === "string" && (patch.feeMode === "taxa_fixa" || patch.feeMode === "taxa_por_bairro")) {
      safe.feeMode = patch.feeMode;
    }
    if (Array.isArray(patch.servedCities)) {
      safe.servedCities = patch.servedCities
        .filter((c): c is ServedCity => !!c && typeof c.ibgeCode === "string" && typeof c.name === "string" && typeof c.uf === "string")
        .slice(0, 50)
        .map((c) => ({ ibgeCode: c.ibgeCode.slice(0, 10), name: c.name.slice(0, 100), uf: c.uf.slice(0, 2) }));
    }

    const next = { ...current, ...safe };
    tx.update(ref, { delivery: next, updatedAt: at });
    return next;
  });
}

// ───────────────────────── Áreas de entrega e cálculo de frete ─────────────────────────

export async function calculateDeliveryFee(
  restaurantId: string,
  city: string,
  district: string,
  uf?: string,
): Promise<DeliveryFeeResult> {
  const snap = await restaurantRef(restaurantId).get();
  if (!snap.exists) throw new BillingError("not_found", 404, "Estabelecimento não encontrado.");

  const config: DeliveryConfig = { ...DEFAULT_DELIVERY_CONFIG, ...(snap.get("delivery") as Partial<DeliveryConfig> | undefined) };
  const feeMode: FeeMode = config.feeMode || "taxa_fixa";
  const cities = config.servedCities || [];

  if (!cities.length) {
    return { feeCents: config.deliveryFeeCents, feeMode: "taxa_fixa", cityName: city, neighborhoodName: null, matched: true };
  }

  const normCity = normalizeCity(city);
  const matchedCity = cities.find((c) => normalizeCity(c.name) === normCity || (uf && normalizeCity(c.name) === normCity && c.uf.toLowerCase() === uf.toLowerCase()));
  if (!matchedCity) {
    return { feeCents: 0, feeMode, cityName: city, neighborhoodName: null, matched: false, reason: "Infelizmente, este restaurante ainda não realiza entregas na sua cidade." };
  }

  if (feeMode === "taxa_fixa") {
    return { feeCents: config.deliveryFeeCents, feeMode, cityName: matchedCity.name, neighborhoodName: null, matched: true };
  }

  const areaDoc = await restaurantRef(restaurantId).collection("delivery_areas").doc(matchedCity.ibgeCode).get();
  if (!areaDoc.exists) {
    return { feeCents: 0, feeMode, cityName: matchedCity.name, neighborhoodName: null, matched: false, reason: "Nenhum bairro configurado para esta cidade." };
  }

  const neighborhoods = (areaDoc.get("neighborhoods") || {}) as Record<string, NeighborhoodEntry>;
  const slug = slugifyNeighborhood(district);
  const entry = neighborhoods[slug];

  if (!entry || !entry.enabled) {
    return { feeCents: 0, feeMode, cityName: matchedCity.name, neighborhoodName: district, matched: false, reason: "Infelizmente, este restaurante ainda não realiza entregas no endereço informado." };
  }

  return { feeCents: entry.feeCents, feeMode, cityName: matchedCity.name, neighborhoodName: entry.name, matched: true };
}

export async function getDeliveryAreas(restaurantId: string, cityIbgeCode: string): Promise<CityDeliveryArea | null> {
  const doc = await restaurantRef(restaurantId).collection("delivery_areas").doc(cityIbgeCode).get();
  if (!doc.exists) return null;
  return doc.data() as CityDeliveryArea;
}

export async function saveDeliveryAreas(
  restaurantId: string,
  uid: string,
  cityIbgeCode: string,
  data: { cityName: string; uf: string; neighborhoods: Record<string, NeighborhoodEntry> },
): Promise<void> {
  const db = adminDb();
  const ref = restaurantRef(restaurantId);
  const snap = await ref.get();
  if (!snap.exists) throw new BillingError("not_found", 404, "Estabelecimento não encontrado.");
  if (snap.get("ownerId") !== uid) {
    const member = await ref.collection("membros").doc(uid).get();
    if (!member.exists) throw new BillingError("forbidden", 403, "Você não faz parte da equipe deste estabelecimento.");
  }
  const entitlements = entitlementsFrom(snap);
  if (!entitlements.features.deliveryManagement) throw new BillingError("plan_required", 402, "O delivery está disponível a partir do plano Pro.");

  const safeNeighborhoods: Record<string, NeighborhoodEntry> = {};
  const entries = Object.entries(data.neighborhoods);
  if (entries.length > 2000) throw new BillingError("too_many_neighborhoods", 400, "Limite de 2000 bairros por cidade.");
  for (const [key, val] of entries) {
    if (!val || typeof val.name !== "string") continue;
    const slug = slugifyNeighborhood(val.name) || key;
    safeNeighborhoods[slug] = {
      name: val.name.slice(0, 100),
      feeCents: Math.max(0, Math.round(Number(val.feeCents) || 0)),
      enabled: val.enabled !== false,
    };
  }

  const at = new Date().toISOString();
  const areaDoc: CityDeliveryArea = {
    cityName: data.cityName.slice(0, 100),
    uf: data.uf.slice(0, 2),
    ibgeCode: cityIbgeCode,
    neighborhoods: safeNeighborhoods,
    updatedAt: at,
  };

  const batch = db.batch();
  batch.set(ref.collection("delivery_areas").doc(cityIbgeCode), areaDoc);

  const config = (snap.get("delivery") as Partial<DeliveryConfig>) || {};
  const cities: ServedCity[] = config.servedCities || [];
  if (!cities.some((c) => c.ibgeCode === cityIbgeCode)) {
    const updated = [...cities, { ibgeCode: cityIbgeCode, name: data.cityName.slice(0, 100), uf: data.uf.slice(0, 2) }];
    batch.update(ref, { "delivery.servedCities": updated, updatedAt: at });
  }

  await batch.commit();
}

export async function removeDeliveryCity(restaurantId: string, uid: string, cityIbgeCode: string): Promise<void> {
  const db = adminDb();
  const ref = restaurantRef(restaurantId);
  const snap = await ref.get();
  if (!snap.exists) throw new BillingError("not_found", 404, "Estabelecimento não encontrado.");
  if (snap.get("ownerId") !== uid) {
    const member = await ref.collection("membros").doc(uid).get();
    if (!member.exists) throw new BillingError("forbidden", 403, "Você não faz parte da equipe deste estabelecimento.");
  }

  const config = (snap.get("delivery") as Partial<DeliveryConfig>) || {};
  const cities = (config.servedCities || []).filter((c) => c.ibgeCode !== cityIbgeCode);
  const at = new Date().toISOString();

  const batch = db.batch();
  batch.delete(ref.collection("delivery_areas").doc(cityIbgeCode));
  batch.update(ref, { "delivery.servedCities": cities, updatedAt: at });
  await batch.commit();
}

export async function getServedNeighborhoods(restaurantId: string, cityName: string): Promise<{ name: string; slug: string }[]> {
  const snap = await restaurantRef(restaurantId).get();
  if (!snap.exists) return [];
  const config: DeliveryConfig = { ...DEFAULT_DELIVERY_CONFIG, ...(snap.get("delivery") as Partial<DeliveryConfig> | undefined) };
  const normCity = normalizeCity(cityName);
  const matchedCity = (config.servedCities || []).find((c) => normalizeCity(c.name) === normCity);
  if (!matchedCity) return [];
  const areaDoc = await restaurantRef(restaurantId).collection("delivery_areas").doc(matchedCity.ibgeCode).get();
  if (!areaDoc.exists) return [];
  const neighborhoods = (areaDoc.get("neighborhoods") || {}) as Record<string, NeighborhoodEntry>;
  return Object.entries(neighborhoods)
    .filter(([, v]) => v.enabled)
    .map(([slug, v]) => ({ name: v.name, slug }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

// ───────────────────────── Criar pedido (checkout público) ─────────────────────────

function validateAddress(addr: unknown): DeliveryAddress {
  if (!addr || typeof addr !== "object") throw new BillingError("invalid_address", 400, "Endereço de entrega inválido.");
  const a = addr as Record<string, unknown>;
  const str = (key: string, max: number, required: boolean) => {
    const v = typeof a[key] === "string" ? (a[key] as string).trim().slice(0, max) : "";
    if (required && !v) throw new BillingError("invalid_address", 400, `O campo "${key}" do endereço é obrigatório.`);
    return v;
  };
  return {
    cep: str("cep", 10, true),
    street: str("street", 200, true),
    number: str("number", 20, true),
    complement: str("complement", 100, false) || undefined,
    district: str("district", 100, true),
    city: str("city", 100, true),
    uf: str("uf", 2, false) || undefined,
    reference: str("reference", 200, false) || undefined,
  };
}

function validateCustomer(cust: unknown): { name: string; phone: string } {
  if (!cust || typeof cust !== "object") throw new BillingError("invalid_customer", 400, "Dados do cliente inválidos.");
  const c = cust as Record<string, unknown>;
  const name = typeof c.name === "string" ? c.name.trim().slice(0, 120) : "";
  const phone = typeof c.phone === "string" ? c.phone.replace(/\D/g, "").slice(0, 15) : "";
  if (!name) throw new BillingError("invalid_customer", 400, "Informe seu nome.");
  if (phone.length < 10) throw new BillingError("invalid_customer", 400, "Informe um telefone válido com DDD.");
  return { name, phone };
}

export async function createDeliveryOrder(payload: DeliveryCheckoutPayload, customerUid?: string): Promise<{ orderId: string; orderNumber: number; duplicate: boolean }> {
  const { restaurantId, idempotencyKey } = payload;
  if (!restaurantId || typeof restaurantId !== "string") throw new BillingError("invalid_restaurant", 400, "Restaurante inválido.");
  if (!idempotencyKey || idempotencyKey.length < 8) throw new BillingError("idempotency_required", 400, "Chave de idempotência obrigatória.");

  const db = adminDb();
  const ref = restaurantRef(restaurantId);
  const snap = await ref.get();
  if (!snap.exists) throw new BillingError("not_found", 404, "Estabelecimento não encontrado.");

  const config: DeliveryConfig = { ...DEFAULT_DELIVERY_CONFIG, ...(snap.get("delivery") as Partial<DeliveryConfig> | undefined) };
  if (!config.enabled) throw new BillingError("delivery_disabled", 403, "Este estabelecimento não está aceitando pedidos de delivery no momento.");

  const entitlements = entitlementsFrom(snap);
  if (!entitlements.valid) throw new BillingError("subscription", 402, "O estabelecimento não possui assinatura ativa.");
  if (!entitlements.features.deliveryManagement) throw new BillingError("plan_required", 402, "O plano do estabelecimento não inclui delivery.");

  const customer = validateCustomer(payload.customer);
  const address = validateAddress(payload.address);

  if (!Array.isArray(payload.items) || !payload.items.length) throw new BillingError("empty_cart", 400, "Adicione pelo menos um produto ao carrinho.");
  if (payload.items.length > 50) throw new BillingError("too_many_items", 400, "Limite de 50 itens por pedido.");

  const paymentMethod = typeof payload.paymentMethod === "string" ? payload.paymentMethod.trim().slice(0, 40) : "";
  if (!paymentMethod) throw new BillingError("invalid_payment", 400, "Selecione a forma de pagamento.");

  const productIds = Array.from(new Set(payload.items.map((i) => i.productId)));
  const productSnaps = await Promise.all(productIds.map((id) => ref.collection("produtos").doc(id).get()));
  const productMap = new Map(productSnaps.filter((s) => s.exists).map((s) => [s.id, s.data()!]));

  const items: DeliveryOrderItem[] = [];
  let subtotalCents = 0;

  for (const item of payload.items) {
    const product = productMap.get(item.productId);
    if (!product) throw new BillingError("product_not_found", 400, `Produto "${item.productId}" não encontrado ou indisponível.`);
    if (product.available === false) throw new BillingError("product_unavailable", 400, `O produto "${product.name}" não está disponível no momento.`);

    const qty = Math.max(1, Math.min(99, Math.floor(Number(item.quantity) || 1)));
    let unitCents = 0;
    if (typeof product.priceCents === "number" && Number.isFinite(product.priceCents)) {
      unitCents = product.priceCents;
    } else {
      const raw = String(product.price ?? "").replace(/\./g, "").replace(",", ".");
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) unitCents = Math.round(parsed * 100);
    }

    const totalCents = unitCents * qty;
    subtotalCents += totalCents;
    items.push({
      productId: item.productId,
      name: String(product.name || "").slice(0, 200),
      quantity: qty,
      unitPriceCents: unitCents,
      totalCents,
      notes: typeof item.notes === "string" ? item.notes.trim().slice(0, 300) : undefined,
    });
  }

  if (config.minOrderCents > 0 && subtotalCents < config.minOrderCents) {
    const min = (config.minOrderCents / 100).toFixed(2).replace(".", ",");
    throw new BillingError("min_order", 400, `O pedido mínimo para delivery é R$ ${min}.`);
  }

  const feeResult = await calculateDeliveryFee(restaurantId, address.city, address.district, address.uf);
  if (!feeResult.matched) {
    throw new BillingError("address_not_served", 400, feeResult.reason || "Endereço fora da área de entrega.");
  }
  const deliveryFeeCents = feeResult.feeCents;
  const totalCents = subtotalCents + deliveryFeeCents;

  const orderNumber = await nextOrderNumber(restaurantId);

  const at = new Date().toISOString();
  const orderData: Omit<DeliveryOrder, "id"> = {
    restaurantId,
    orderNumber,
    status: "pendente",
    customer: { ...customer, uid: customerUid },
    address,
    items,
    subtotalCents,
    deliveryFeeCents,
    discountCents: 0,
    totalCents,
    paymentMethod,
    paymentStatus: "pendente",
    notes: typeof payload.notes === "string" ? payload.notes.trim().slice(0, 500) : undefined,
    feeCalculation: {
      feeMode: feeResult.feeMode,
      cityMatched: feeResult.cityName,
      neighborhoodMatched: feeResult.neighborhoodName ?? undefined,
      feeCents: feeResult.feeCents,
    },
    origin: { source: "kardap_delivery", channel: "web", isNativeOrder: true },
    statusHistory: [{ status: "pendente", at }],
    createdAt: at,
    updatedAt: at,
  };

  const result = await confirmNativeOrder({
    restaurantId,
    uid: "delivery_public",
    source: "kardap_delivery",
    idempotencyKey,
    order: orderData,
  });

  return { orderId: result.orderId, orderNumber, duplicate: result.duplicate };
}

async function nextOrderNumber(restaurantId: string): Promise<number> {
  const db = adminDb();
  const counterRef = restaurantRef(restaurantId).collection("privado").doc("delivery_counter");

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const current = Number(snap.get("lastOrderNumber")) || 0;
    const next = current + 1;
    tx.set(counterRef, { lastOrderNumber: next, updatedAt: new Date().toISOString() }, { merge: true });
    return next;
  });
}

// ───────────────────────── Alterar status (PDV / painel) ─────────────────────────

export async function updateOrderStatus(
  restaurantId: string,
  orderId: string,
  newStatus: DeliveryOrderStatus,
  uid: string,
  courierId?: string,
): Promise<void> {
  if (!isDeliveryStatus(newStatus)) throw new BillingError("invalid_status", 400, "Status inválido.");

  const db = adminDb();
  const ref = restaurantRef(restaurantId).collection("pedidos").doc(orderId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new BillingError("not_found", 404, "Pedido não encontrado.");
    if (snap.get("establishmentId") !== restaurantId) throw new BillingError("forbidden", 403, "Pedido não pertence a este estabelecimento.");

    const currentStatus = snap.get("status") as DeliveryOrderStatus;
    if (!canTransition(currentStatus, newStatus)) {
      throw new BillingError("invalid_transition", 400, `Não é possível alterar de "${currentStatus}" para "${newStatus}".`);
    }

    const at = new Date().toISOString();
    const history: StatusHistoryEntry = { status: newStatus, at, by: uid };
    const update: Record<string, unknown> = {
      status: newStatus,
      updatedAt: at,
      statusHistory: [...((snap.get("statusHistory") as StatusHistoryEntry[]) || []), history],
    };

    if (newStatus === "confirmado") {
      update.confirmedAt = at;
      update.confirmedBy = uid;
    }
    if (courierId && newStatus === "saiu_para_entrega") {
      update.courierId = courierId;
    }

    tx.update(ref, update);
  });
}

// ───────────────────────── Consulta pública (acompanhamento) ─────────────────────────

export async function getPublicOrderStatus(restaurantId: string, orderId: string): Promise<{ status: DeliveryOrderStatus; orderNumber: number; statusHistory: StatusHistoryEntry[]; updatedAt: string } | null> {
  const snap = await restaurantRef(restaurantId).collection("pedidos").doc(orderId).get();
  if (!snap.exists || snap.get("establishmentId") !== restaurantId) return null;
  if (snap.get("origin.source") !== "kardap_delivery") return null;
  return {
    status: snap.get("status"),
    orderNumber: snap.get("orderNumber"),
    statusHistory: snap.get("statusHistory") || [],
    updatedAt: snap.get("updatedAt"),
  };
}

// ───────────────────────── Delivery link ─────────────────────────

export function deliverySlug(restaurantId: string, slug: string): string {
  return `/r/${slug}/delivery`;
}
