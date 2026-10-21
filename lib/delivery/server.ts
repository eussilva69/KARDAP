/**
 * Serviço de delivery (servidor): cria pedidos validados, altera status e consulta configuração.
 * Toda gravação passa por transação do Admin SDK — preços e totais são recalculados no servidor.
 */
import { createHash } from "crypto";
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
  NeighborhoodEntry,
  ServedCity,
  StatusHistoryEntry,
} from "./types";
import { canTransition, DEFAULT_DELIVERY_CONFIG, isDeliveryStatus, slugifyNeighborhood } from "./types";
import { findServedCity, resolveDeliveryFee } from "./match";
import { isDeliveryChannel, orderChannel } from "@/lib/orders/channels";
import { shouldActivateOrder } from "./checkout-lifecycle";
import { resolveMapDeliveryFee, sanitizeMapConfig } from "./map-areas";
import { geocodeAddress, placeAddress } from "./geo";

const restaurantRef = (id: string) => adminDb().collection("restaurantes").doc(id);

// ───────────────────────── Configuração ─────────────────────────

export async function getDeliveryConfig(restaurantId: string): Promise<DeliveryConfig> {
  const snap = await restaurantRef(restaurantId).get();
  if (!snap.exists) throw new BillingError("not_found", 404, "Estabelecimento não encontrado.");
  const raw = snap.get("delivery") as Partial<DeliveryConfig> | undefined;
  return { ...DEFAULT_DELIVERY_CONFIG, ...raw };
}

/** Configuração para o painel: só o dono ou a equipe do estabelecimento. */
export async function getDeliveryConfigForTeam(restaurantId: string, uid: string): Promise<DeliveryConfig> {
  const ref = restaurantRef(restaurantId);
  const snap = await ref.get();
  if (!snap.exists) throw new BillingError("not_found", 404, "Estabelecimento não encontrado.");
  await assertTeamMember(ref, snap, uid);
  return configOf(snap);
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
    if (typeof patch.feeMode === "string" && (patch.feeMode === "taxa_fixa" || patch.feeMode === "taxa_por_bairro" || patch.feeMode === "area_mapa")) {
      safe.feeMode = patch.feeMode;
    }
    if (patch.mapConfig !== undefined) safe.mapConfig = sanitizeMapConfig(patch.mapConfig);
    if (Array.isArray(patch.servedCities)) safe.servedCities = sanitizeCities(patch.servedCities);
    if (patch.defaultNeighborhoodFeeCents === null) safe.defaultNeighborhoodFeeCents = null;
    else if (typeof patch.defaultNeighborhoodFeeCents === "number" && Number.isFinite(patch.defaultNeighborhoodFeeCents) && patch.defaultNeighborhoodFeeCents >= 0) {
      safe.defaultNeighborhoodFeeCents = Math.round(patch.defaultNeighborhoodFeeCents);
    }
    if (typeof patch.serveUnlistedNeighborhoods === "boolean") safe.serveUnlistedNeighborhoods = patch.serveUnlistedNeighborhoods;

    const next = { ...current, ...safe };
    tx.update(ref, { delivery: next, updatedAt: at });
    return next;
  });
}

// ───────────────────────── Áreas de entrega e cálculo de frete ─────────────────────────

const IBGE_CODE = /^\d{7}$/;

async function assertTeamMember(ref: FirebaseFirestore.DocumentReference, snap: FirebaseFirestore.DocumentSnapshot, uid: string) {
  if (snap.get("ownerId") === uid) return;
  const member = await ref.collection("membros").doc(uid).get();
  if (!member.exists) throw new BillingError("forbidden", 403, "Você não faz parte da equipe deste estabelecimento.");
}

/** Cidades atendidas como o servidor aceita gravar (o painel manda a lista inteira ao ativar/pausar uma cidade). */
function sanitizeCities(list: unknown[]): ServedCity[] {
  const seen = new Set<string>();
  const out: ServedCity[] = [];
  for (const c of list as Partial<ServedCity>[]) {
    if (!c || typeof c.ibgeCode !== "string" || !IBGE_CODE.test(c.ibgeCode) || typeof c.name !== "string" || typeof c.uf !== "string") continue;
    if (seen.has(c.ibgeCode)) continue;
    seen.add(c.ibgeCode);
    const city: ServedCity = { ibgeCode: c.ibgeCode, name: c.name.slice(0, 100), uf: c.uf.slice(0, 2).toUpperCase() };
    if (c.enabled === false) city.enabled = false;
    if (typeof c.placeId === "string" && c.placeId.length <= 300) city.placeId = c.placeId;
    out.push(city);
    if (out.length >= 50) break;
  }
  return out;
}

const configOf = (snap: FirebaseFirestore.DocumentSnapshot): DeliveryConfig => ({
  ...DEFAULT_DELIVERY_CONFIG,
  ...(snap.get("delivery") as Partial<DeliveryConfig> | undefined),
});

export async function calculateDeliveryFee(
  restaurantId: string,
  city: string,
  district: string,
  uf?: string,
  ibgeCode?: string,
  geoInput?: { placeId?: string; street?: string; number?: string; cep?: string },
): Promise<DeliveryFeeResult> {
  const snap = await restaurantRef(restaurantId).get();
  if (!snap.exists) throw new BillingError("not_found", 404, "Estabelecimento não encontrado.");

  const config = configOf(snap);
  if ((config.feeMode || "taxa_fixa") === "area_mapa") {
    const mapConfig = sanitizeMapConfig(config.mapConfig);
    let destination = geoInput?.placeId ? (await placeAddress(geoInput.placeId).catch(() => null))?.location : null;
    if (!destination) {
      const full = [geoInput?.street, geoInput?.number, district, city, uf, geoInput?.cep, "Brasil"].filter(Boolean).join(", ");
      destination = (await geocodeAddress(full).catch(() => null))?.location || null;
    }
    if (!destination) return { feeCents: 0, feeMode: "area_mapa", cityName: city, neighborhoodName: null, matched: false, reason: "Não foi possível localizar este endereço no mapa. Confira rua, número e CEP." };
    return resolveMapDeliveryFee(mapConfig, destination, city);
  }
  const address = { city, district, uf, ibgeCode: ibgeCode && IBGE_CODE.test(ibgeCode) ? ibgeCode : undefined };
  const served = findServedCity(config.servedCities || [], address);

  let area: { neighborhoods: Record<string, NeighborhoodEntry> } | null = null;
  if (served && served.enabled !== false) {
    const areaDoc = await restaurantRef(restaurantId).collection("delivery_areas").doc(served.ibgeCode).get();
    if (areaDoc.exists) area = { neighborhoods: (areaDoc.get("neighborhoods") || {}) as Record<string, NeighborhoodEntry> };
  }
  return resolveDeliveryFee(config, address, area, slugifyNeighborhood);
}

export async function getDeliveryAreas(restaurantId: string, uid: string, cityIbgeCode: string): Promise<CityDeliveryArea | null> {
  const ref = restaurantRef(restaurantId);
  const snap = await ref.get();
  if (!snap.exists) throw new BillingError("not_found", 404, "Estabelecimento não encontrado.");
  await assertTeamMember(ref, snap, uid);
  const doc = await ref.collection("delivery_areas").doc(cityIbgeCode).get();
  if (!doc.exists) return null;
  return doc.data() as CityDeliveryArea;
}

export async function saveDeliveryAreas(
  restaurantId: string,
  uid: string,
  cityIbgeCode: string,
  data: { cityName: string; uf: string; placeId?: string; neighborhoods: Record<string, NeighborhoodEntry> },
): Promise<DeliveryConfig> {
  if (!IBGE_CODE.test(cityIbgeCode)) throw new BillingError("invalid_city", 400, "Código IBGE inválido.");
  const db = adminDb();
  const ref = restaurantRef(restaurantId);
  const snap = await ref.get();
  if (!snap.exists) throw new BillingError("not_found", 404, "Estabelecimento não encontrado.");
  await assertTeamMember(ref, snap, uid);
  const entitlements = entitlementsFrom(snap);
  if (!entitlements.features.deliveryManagement) throw new BillingError("plan_required", 402, "O delivery está disponível a partir do plano Pro.");

  const safeNeighborhoods: Record<string, NeighborhoodEntry> = {};
  const entries = Object.entries(data.neighborhoods || {});
  if (entries.length > 2000) throw new BillingError("too_many_neighborhoods", 400, "Limite de 2000 bairros por cidade.");
  for (const [key, val] of entries) {
    if (!val || typeof val.name !== "string" || !val.name.trim()) continue;
    const name = val.name.replace(/\s+/g, " ").trim().slice(0, 100);
    const slug = slugifyNeighborhood(name) || key;
    const fee = val.feeCents === null || val.feeCents === undefined || (val.feeCents as unknown) === "" ? null : Number(val.feeCents);
    if (fee !== null && (!Number.isFinite(fee) || fee < 0 || fee > 100_000_00)) {
      throw new BillingError("invalid_fee", 400, `Taxa inválida para o bairro ${name}.`);
    }
    safeNeighborhoods[slug] = { name, feeCents: fee === null ? null : Math.round(fee), enabled: val.enabled !== false };
  }

  const at = new Date().toISOString();
  const areaDoc: CityDeliveryArea = {
    cityName: data.cityName.slice(0, 100),
    uf: data.uf.slice(0, 2).toUpperCase(),
    ibgeCode: cityIbgeCode,
    neighborhoods: safeNeighborhoods,
    updatedAt: at,
  };

  const config = configOf(snap);
  const cities = config.servedCities || [];
  const nextCities = cities.some((c) => c.ibgeCode === cityIbgeCode)
    ? cities
    : sanitizeCities([...cities, { ibgeCode: cityIbgeCode, name: areaDoc.cityName, uf: areaDoc.uf, placeId: data.placeId }]);

  const batch = db.batch();
  batch.set(ref.collection("delivery_areas").doc(cityIbgeCode), areaDoc);
  if (nextCities !== cities) batch.update(ref, { "delivery.servedCities": nextCities, updatedAt: at });
  await batch.commit();
  return { ...config, servedCities: nextCities };
}

export async function removeDeliveryCity(restaurantId: string, uid: string, cityIbgeCode: string): Promise<DeliveryConfig> {
  const db = adminDb();
  const ref = restaurantRef(restaurantId);
  const snap = await ref.get();
  if (!snap.exists) throw new BillingError("not_found", 404, "Estabelecimento não encontrado.");
  await assertTeamMember(ref, snap, uid);

  const config = configOf(snap);
  const cities = (config.servedCities || []).filter((c) => c.ibgeCode !== cityIbgeCode);
  const at = new Date().toISOString();

  const batch = db.batch();
  batch.delete(ref.collection("delivery_areas").doc(cityIbgeCode));
  batch.update(ref, { "delivery.servedCities": cities, updatedAt: at });
  await batch.commit();
  return { ...config, servedCities: cities };
}

export async function getServedNeighborhoods(restaurantId: string, cityName: string, uf?: string, ibgeCode?: string): Promise<{ name: string; slug: string }[]> {
  const snap = await restaurantRef(restaurantId).get();
  if (!snap.exists) return [];
  const config = configOf(snap);
  const matchedCity = findServedCity(config.servedCities || [], { city: cityName, uf, ibgeCode });
  if (!matchedCity || matchedCity.enabled === false) return [];
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
    uf: str("uf", 2, false).toUpperCase() || undefined,
    reference: str("reference", 200, false) || undefined,
    placeId: str("placeId", 300, false) || undefined,
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
  if (!config.paymentMethods.includes(paymentMethod)) throw new BillingError("payment_disabled", 400, "Esta forma de pagamento não está habilitada pelo restaurante.");

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

  const feeResult = await calculateDeliveryFee(restaurantId, address.city, address.district, address.uf, undefined, { placeId: address.placeId, street: address.street, number: address.number, cep: address.cep });
  if (!feeResult.matched) {
    throw new BillingError("address_not_served", 400, feeResult.reason || "Endereço fora da área de entrega.");
  }
  const deliveryFeeCents = feeResult.feeCents;
  const totalCents = subtotalCents + deliveryFeeCents;

  const at = new Date().toISOString();
  const orderData: Omit<DeliveryOrder, "id"> = {
    restaurantId,
    orderNumber: 0,
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
    operationalReady: false,
    notes: typeof payload.notes === "string" ? payload.notes.trim().slice(0, 500) : undefined,
    feeCalculation: {
      feeMode: feeResult.feeMode,
      cityMatched: feeResult.cityName,
      cityIbgeCode: feeResult.cityIbgeCode,
      neighborhoodMatched: feeResult.neighborhoodName ?? undefined,
      matchType: feeResult.matchType,
      usedDefaultFee: feeResult.usedDefaultFee,
      feeCents: feeResult.feeCents,
      distanceKm: feeResult.distanceKm,
      mapAreaId: feeResult.mapAreaId,
      mapAreaName: feeResult.mapAreaName,
    },
    origin: { source: "kardap_delivery", channel: "web", isNativeOrder: true },
    statusHistory: [{ status: "pendente", at }],
    createdAt: at,
    updatedAt: at,
  };

  const orderId = `n_${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 32)}`;
  const orderRef = ref.collection("pedidos").doc(orderId);
  const counterRef = ref.collection("privado").doc("delivery_counter");
  const prepared = await db.runTransaction(async (tx) => {
    const [existing, counter] = await Promise.all([tx.get(orderRef), tx.get(counterRef)]);
    if (existing.exists) return { orderNumber: Number(existing.get("orderNumber") || 0), duplicate: true };
    const orderNumber = (Number(counter.get("lastOrderNumber")) || 0) + 1;
    tx.set(counterRef, { lastOrderNumber: orderNumber, updatedAt: at }, { merge: true });
    tx.set(orderRef, withoutUndefined({ ...orderData, orderNumber, establishmentId: restaurantId, checkout: { state: "prepared", idempotencyKey }, quota: { consumed: false } }));
    return { orderNumber, duplicate: false };
  });

  if (shouldActivateOrder(paymentMethod, "pendente")) await activateDeliveryOrder(restaurantId, orderId, "delivery_public");
  return { orderId, orderNumber: prepared.orderNumber, duplicate: prepared.duplicate };
}

/** Origem sugerida para o editor, derivada do endereço oficial já vinculado à loja. */
export async function getDeliveryMapOrigin(restaurantId: string): Promise<{ location: { lat: number; lng: number }; placeId?: string; label?: string } | null> {
  const snap = await restaurantRef(restaurantId).get();
  if (!snap.exists) return null;
  const config = configOf(snap);
  if (config.mapConfig?.storeLocation) return { location: config.mapConfig.storeLocation, placeId: config.mapConfig.storePlaceId };
  const business = snap.get("googleBusiness") as { placeId?: string; address?: string } | undefined;
  let address = business?.placeId ? await placeAddress(business.placeId).catch(() => null) : null;
  if (!address?.location && business?.address) address = await geocodeAddress(business.address).catch(() => null);
  return address?.location ? { location: address.location, placeId: business?.placeId || address.placeId, label: business?.address || address.formatted } : null;
}

/** Libera um checkout preparado para a fila operacional e consome a franquia uma única vez. */
export async function activateDeliveryOrder(restaurantId: string, orderId: string, actor = "payment_webhook"): Promise<void> {
  const orderRef = restaurantRef(restaurantId).collection("pedidos").doc(orderId);
  const snap = await orderRef.get();
  if (!snap.exists || snap.get("origin.source") !== "kardap_delivery") throw new BillingError("not_found", 404, "Pedido não encontrado.");
  if (snap.get("operationalReady") === true && snap.get("quota.consumed") === true) return;
  const at = new Date().toISOString();
  await confirmNativeOrder({
    restaurantId,
    uid: "delivery_public",
    source: "kardap_delivery",
    orderId,
    // O Firestore recusa campos undefined (cliente sem login não tem uid; complemento, referência e observações são
    // opcionais): sem esta limpeza, todo pedido de cliente anônimo falhava com erro 500.
    order: withoutUndefined({ ...snap.data(), status: "pendente", operationalReady: true, checkout: { ...(snap.get("checkout") || {}), state: "submitted", submittedAt: at }, statusHistory: [{ status: "pendente", at, by: actor }] }),
  });
  // `confirmNativeOrder` confirma consumo de franquia, não aceite operacional.
  // O aceite só será registrado quando o restaurante mudar para `confirmado`.
  await orderRef.set({ confirmedAt: null, confirmedBy: null }, { merge: true });
}

/** Cópia sem chaves undefined (em qualquer nível), no formato que o Firestore aceita. */
function withoutUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => withoutUndefined(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, withoutUndefined(v)]),
    ) as T;
  }
  return value;
}

// ───────────────────────── Alterar status (PDV / painel) ─────────────────────────

export async function updateOrderStatus(
  restaurantId: string,
  orderId: string,
  newStatus: DeliveryOrderStatus,
  uid: string,
  courierId?: string,
  reason?: string,
): Promise<void> {
  const safeReason = typeof reason === "string" ? reason.trim().slice(0, 300) : "";
  if (newStatus === "recusado" && safeReason.length < 3) throw new BillingError("reason_required", 400, "Informe o motivo da recusa.");
  if (!isDeliveryStatus(newStatus)) throw new BillingError("invalid_status", 400, "Status inválido.");

  const db = adminDb();
  const ref = restaurantRef(restaurantId).collection("pedidos").doc(orderId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new BillingError("not_found", 404, "Pedido não encontrado.");
    if (snap.get("establishmentId") !== restaurantId) throw new BillingError("forbidden", 403, "Pedido não pertence a este estabelecimento.");

    const currentStatus = snap.get("status") as DeliveryOrderStatus;
    if (!canTransition(currentStatus, newStatus, { delivery: isDeliveryChannel(orderChannel(snap.get("origin"))) })) {
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
    if ((newStatus === "recusado" || newStatus === "cancelado") && safeReason) update.cancelReason = safeReason;

    tx.update(ref, update);
  });

  // Recusa/cancelamento de pedido já pago inicia o estorno no provedor. O webhook
  // continua sendo a fonte de verdade para a conclusão financeira do estorno.
  if (newStatus === "recusado" || newStatus === "cancelado") {
    const cancelled = await ref.get();
    const paymentId = String(cancelled.get("payment.paymentId") || "");
    if (cancelled.get("paymentStatus") === "pago" && paymentId) {
      const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
      if (!accessToken) throw new BillingError("refund_not_configured", 503, "Pedido recusado, mas o estorno precisa de configuração do Mercado Pago.");
      const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}/refunds`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", "X-Idempotency-Key": `kardap_refund_${orderId}` },
        body: "{}",
      });
      const at = new Date().toISOString();
      if (!response.ok) {
        await ref.set({ refund: { status: "failed", requestedAt: at }, updatedAt: at }, { merge: true });
        throw new BillingError("refund_failed", 502, "Pedido recusado. Não foi possível iniciar o estorno automaticamente; verifique o financeiro.");
      }
      await ref.set({ refund: { status: "pending", requestedAt: at, paymentId }, updatedAt: at }, { merge: true });
    }
  }
}

// ───────────────────────── Consulta pública (acompanhamento) ─────────────────────────

export async function getPublicOrderStatus(restaurantId: string, orderId: string): Promise<{ status: DeliveryOrderStatus; orderNumber: number; statusHistory: StatusHistoryEntry[]; updatedAt: string; paymentStatus?: string; operationalReady: boolean; payment?: Record<string, unknown>; cancelReason?: string } | null> {
  const snap = await restaurantRef(restaurantId).collection("pedidos").doc(orderId).get();
  if (!snap.exists || snap.get("establishmentId") !== restaurantId) return null;
  if (snap.get("origin.source") !== "kardap_delivery") return null;
  return {
    status: snap.get("status"),
    orderNumber: snap.get("orderNumber"),
    statusHistory: snap.get("statusHistory") || [],
    updatedAt: snap.get("updatedAt"),
    paymentStatus: snap.get("paymentStatus"),
    operationalReady: snap.get("operationalReady") === true,
    payment: snap.get("payment") || undefined,
    cancelReason: snap.get("cancelReason") || undefined,
  };
}

// ───────────────────────── Delivery link ─────────────────────────

export function deliverySlug(restaurantId: string, slug: string): string {
  return `/r/${slug}/delivery`;
}
