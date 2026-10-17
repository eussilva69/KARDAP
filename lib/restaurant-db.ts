import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, QueryDocumentSnapshot, runTransaction, setDoc, startAfter, updateDoc, where, writeBatch } from "firebase/firestore";
import { getDb } from "./firebase";
import { withTimeout, withWriteTimeout } from "./async";
import type { PublishedVideo } from "@/services/video-worker/src/contract";

export type SnapshotMeta = { fromCache: boolean };
export type Pending = { pending?: boolean };

// Cada restaurante terá seu próprio documento. Quando houver cadastro de
// restaurantes, use o slug real no lugar deste valor padrão.
export function getRestaurantId() {
  return typeof window === "undefined"
    ? "unassigned"
    : localStorage.getItem("kardap-restaurant-id") || "unassigned";
}

export function publicMenuPath() {
  const slug = typeof window === "undefined" ? "seu-cardapio" : localStorage.getItem("kardap-restaurant-slug") || "seu-cardapio";
  return `/r/${slug}`;
}

function restaurantRef() {
  return doc(getDb(), "restaurantes", getRestaurantId());
}

export type RestaurantData = Record<string, unknown>;
export type RestaurantTable = { id: string; restaurantId?: string; number: number; name: string; capacity: number; status: "livre" | "ocupada"; qrToken: string };
export type RestaurantCategory = { id: string; name: string; description: string; order: number; active: boolean; createdAt?: string; updatedAt?: string };
/**
 * `videoUrl`, `videoPoster` e `video` são publicados pelo worker de vídeo (Cloud Run) depois da otimização.
 * O painel só pode limpá-los (remover o vídeo); vídeos antigos têm só `videoUrl`.
 */
/** Metadados da foto otimizada (lib/image-optimization.ts); fotos antigas não têm. */
export type ImageMeta = { width: number; height: number; format: string; size: number; smallSize: number; originalSize: number };

export type RestaurantProduct = { id: string; name: string; categoryId: string; category: string; description: string; price: string; priceCents: number; image?: string; imageThumb?: string; imageMeta?: ImageMeta | null; videoUrl?: string; videoPoster?: string; video?: PublishedVideo | null; likes?: number; available: boolean; createdAt?: string; updatedAt?: string };

export function watchRestaurant(
  onData: (data: RestaurantData | null, meta: SnapshotMeta) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(
    restaurantRef(),
    (snapshot) => onData(snapshot.exists() ? snapshot.data() : null, { fromCache: snapshot.metadata.fromCache }),
    onError,
  );
}

/** Observa o restaurante pelo slug para o cardápio público, sem depender da sessão do dono. */
export function watchPublicRestaurant(
  slug: string,
  onData: (data: (RestaurantData & { id: string }) | null, meta: SnapshotMeta) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(
    query(collection(getDb(), "restaurantes"), where("slug", "==", slug), limit(1)),
    (snapshot) => {
      const restaurant = snapshot.docs[0];
      onData(restaurant ? ({ id: restaurant.id, ...restaurant.data() } as RestaurantData & { id: string }) : null, { fromCache: snapshot.metadata.fromCache });
    },
    onError,
  );
}

export async function saveRestaurant(data: RestaurantData) {
  // `async` transforma erros de validação síncronos do SDK em Promise rejeitada,
  // permitindo que os chamadores tratem a falha sem derrubar a interface.
  return withWriteTimeout(setDoc(restaurantRef(), data, { merge: true }));
}

export function watchRestaurantTables(
  onData: (tables: (RestaurantTable & Pending)[], meta: SnapshotMeta) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(
    query(collection(restaurantRef(), "mesas"), orderBy("number", "asc")),
    { includeMetadataChanges: true },
    (snapshot) => onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data(), pending: item.metadata.hasPendingWrites } as RestaurantTable & Pending)), { fromCache: snapshot.metadata.fromCache }),
    onError,
  );
}

export function watchRestaurantCategories(onData: (categories: (RestaurantCategory & Pending)[], meta: SnapshotMeta) => void, onError: (error: Error) => void) {
  return onSnapshot(query(collection(restaurantRef(), "categorias"), orderBy("order", "asc")), { includeMetadataChanges: true }, (snapshot) =>
    onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data(), pending: item.metadata.hasPendingWrites } as RestaurantCategory & Pending)), { fromCache: snapshot.metadata.fromCache }), onError);
}

export async function createRestaurantCategory(input: Pick<RestaurantCategory, "name" | "description" | "order" | "active">) {
  const now = new Date().toISOString();
  return withWriteTimeout(addDoc(collection(restaurantRef(), "categorias"), { ...input, name: input.name.trim(), createdAt: now, updatedAt: now }));
}

export async function updateRestaurantCategory(id: string, input: Partial<Pick<RestaurantCategory, "name" | "description" | "order" | "active">>) {
  await withWriteTimeout(updateDoc(doc(restaurantRef(), "categorias", id), { ...input, ...(input.name ? { name: input.name.trim() } : {}), updatedAt: new Date().toISOString() }));
}

export async function deleteRestaurantCategory(id: string) {
  const linked = await withTimeout(getDocs(query(collection(restaurantRef(), "produtos"), where("categoryId", "==", id), limit(1))));
  if (!linked.empty) throw new Error("Não é possível excluir uma categoria com produtos vinculados.");
  await withWriteTimeout(deleteDoc(doc(restaurantRef(), "categorias", id)));
}

export function watchRestaurantProducts(onData: (products: (RestaurantProduct & Pending)[], meta: SnapshotMeta) => void, onError: (error: Error) => void) {
  return onSnapshot(query(collection(restaurantRef(), "produtos"), orderBy("createdAt", "desc")), { includeMetadataChanges: true }, (snapshot) =>
    onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data(), pending: item.metadata.hasPendingWrites } as RestaurantProduct & Pending)), { fromCache: snapshot.metadata.fromCache }), onError);
}

export function watchPublicRestaurantProducts(restaurantId: string, onData: (products: RestaurantProduct[], meta: SnapshotMeta) => void, onError: (error: Error) => void) {
  return onSnapshot(query(collection(getDb(), "restaurantes", restaurantId, "produtos"), where("available", "==", true)), (snapshot) =>
    onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as RestaurantProduct)).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))), { fromCache: snapshot.metadata.fromCache }), onError);
}

/** Categorias do cardápio público: define a ordem das seções e quais ficam ocultas para o cliente. */
export function watchPublicRestaurantCategories(restaurantId: string, onData: (categories: RestaurantCategory[]) => void, onError: (error: Error) => void) {
  return onSnapshot(query(collection(getDb(), "restaurantes", restaurantId, "categorias"), orderBy("order", "asc")), (snapshot) =>
    onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as RestaurantCategory))), onError);
}

/** Id de produto gerado antes de gravar: a foto sobe já com o id no nome do arquivo. */
export function newProductId() {
  return doc(collection(restaurantRef(), "produtos")).id;
}

export async function createRestaurantProduct(input: Omit<RestaurantProduct, "id" | "createdAt" | "updatedAt">, id?: string) {
  const category = await withTimeout(getDoc(doc(restaurantRef(), "categorias", input.categoryId)));
  if (!category.exists() || !category.data().active) throw new Error("Selecione uma categoria ativa deste estabelecimento.");
  const now = new Date().toISOString();
  const data = { ...input, name: input.name.trim(), createdAt: now, updatedAt: now };
  if (id) {
    const target = doc(restaurantRef(), "produtos", id);
    await withWriteTimeout(setDoc(target, data));
    return target;
  }
  return withWriteTimeout(addDoc(collection(restaurantRef(), "produtos"), data));
}

export async function updateRestaurantProduct(id: string, input: Partial<Omit<RestaurantProduct, "id" | "createdAt" | "updatedAt">>) {
  if (input.categoryId) {
    const category = await withTimeout(getDoc(doc(restaurantRef(), "categorias", input.categoryId)));
    if (!category.exists() || !category.data().active) throw new Error("Selecione uma categoria ativa deste estabelecimento.");
  }
  const clean = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
  await withWriteTimeout(updateDoc(doc(restaurantRef(), "produtos", id), { ...clean, ...(input.name ? { name: input.name.trim() } : {}), updatedAt: new Date().toISOString() }));
}

export async function deleteRestaurantProduct(id: string) {
  await withWriteTimeout(deleteDoc(doc(restaurantRef(), "produtos", id)));
}

/** Resolve o token do QR para uma mesa real dentro do restaurante público. */
export function watchPublicTable(
  restaurantId: string,
  token: string,
  onData: (table: RestaurantTable | null) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(
    query(collection(getDb(), "restaurantes", restaurantId, "mesas"), where("qrToken", "==", token), limit(1)),
    (snapshot) => {
      const table = snapshot.docs[0];
      onData(table ? ({ id: table.id, ...table.data() } as RestaurantTable) : null);
    },
    onError,
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * POST autenticado numa API de planos (lib/billing), com nova tentativa automática: uma falta de rede ou uma
 * resposta que não chegou a tempo (comum logo depois do cadastro, com a função ainda "fria" no servidor) tenta de
 * novo sozinha, até duas vezes; um erro do próprio servidor (limite do plano, sessão expirada, dado inválido) não
 * é repetido, porque repetir não muda o resultado. Lança um erro com `.code` (o campo `error` da resposta).
 */
async function postBillingApi<T>(path: string, body: unknown, fallbackMessage: string, attempt = 1): Promise<T> {
  const { getFirebaseAuth } = await import("./auth");
  const token = await getFirebaseAuth().currentUser?.getIdToken();
  if (!token) throw new Error("Sua sessão expirou. Entre de novo para continuar.");
  let res: Response;
  try {
    res = await withTimeout(
      fetch(path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }),
      25000,
    );
  } catch {
    if (attempt < 3) {
      await sleep(attempt * 1500);
      return postBillingApi<T>(path, body, fallbackMessage, attempt + 1);
    }
    throw Object.assign(new Error("Não foi possível conectar ao servidor. Verifique sua internet e tente de novo."), { code: "network" });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // 5xx é instabilidade do servidor (ex.: função ainda inicializando): vale repetir. 4xx é definitivo.
    if (res.status >= 500 && attempt < 3) {
      await sleep(attempt * 1500);
      return postBillingApi<T>(path, body, fallbackMessage, attempt + 1);
    }
    throw Object.assign(new Error(typeof data.message === "string" ? data.message : fallbackMessage), { code: data.error, details: data });
  }
  return data as T;
}

/**
 * Mesas são criadas pelo servidor (POST /api/restaurants/{id}/mesas): o limite do plano é conferido na mesma
 * transação que grava a mesa, então não dá para passar do limite com cliques simultâneos nem gravando direto.
 */
async function createTablesOnServer(body: { name?: string; quantity?: number }): Promise<RestaurantTable[]> {
  const restaurantId = getRestaurantId();
  const data = await postBillingApi<{ tables?: { id: string; number: number; name: string; qrToken: string }[] }>(
    `/api/restaurants/${encodeURIComponent(restaurantId)}/mesas`,
    body,
    "Não foi possível criar a mesa. Tente de novo.",
  );
  return (data.tables || []).map((t) => ({ ...t, restaurantId, capacity: 4, status: "livre" as const }));
}

/**
 * Ativa o teste grátis de 30 dias do plano escolhido no cadastro (docs/PLANOS.md). Só deve ser chamada depois que
 * o onboarding salva `onboarding.completed = true` com sucesso. Idempotente: chamar de novo (duplo clique, nova
 * tentativa) não estende nem reinicia o prazo.
 */
export async function activateTrial(planId: string): Promise<{ activated: boolean; planId: string; trialEndsAt: string }> {
  return postBillingApi(
    "/api/billing/activate-trial",
    { restaurantId: getRestaurantId(), planId },
    "Não foi possível ativar o teste grátis agora. Você pode ativar depois em Meu plano.",
  );
}

export async function createInitialTables(quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 200) {
    throw new Error("Informe entre 0 e 200 mesas.");
  }
  if (quantity === 0) return [] as RestaurantTable[];
  return createTablesOnServer({ quantity });
}

export async function createRestaurantTable(name?: string) {
  const [table] = await createTablesOnServer({ name: name?.trim() || undefined });
  return table;
}

async function tableDocumentByName(name: string) {
  const snapshot = await withTimeout(getDocs(query(collection(restaurantRef(), "mesas"), where("name", "==", name), limit(1))));
  return snapshot.docs[0] || null;
}

export async function renameRestaurantTable(currentName: string, nextName: string) {
  const table = await tableDocumentByName(currentName);
  if (!table) throw new Error("Mesa não encontrada.");
  await withWriteTimeout(setDoc(table.ref, { name: nextName.trim(), updatedAt: new Date().toISOString() }, { merge: true }));
}

export async function deleteRestaurantTable(name: string) {
  const table = await tableDocumentByName(name);
  if (!table) throw new Error("Mesa não encontrada.");
  await withWriteTimeout(deleteDoc(table.ref));
}

export async function findRestaurantByOwner(ownerId: string): Promise<{ id: string; slug: string; name: string; onboardingCompleted: boolean } | null> {
  if (!ownerId) return null;
  try {
    const db = getDb();
    const q = query(collection(db, "restaurantes"), where("ownerId", "==", ownerId), limit(1));
    const snap = await withTimeout(getDocs(q), 10000);
    if (!snap.empty) {
      const d = snap.docs[0];
      const data = d.data();
      const id = d.id;
      const slug = (data.slug as string) || "";
      const name = (data.name as string) || "";
      const onboardingCompleted = Boolean((data.onboarding as { completed?: boolean } | undefined)?.completed);
      if (typeof window !== "undefined") {
        localStorage.setItem("kardap-restaurant-id", id);
        localStorage.setItem("kardap-restaurant-owner", ownerId);
        if (slug) localStorage.setItem("kardap-restaurant-slug", slug);
      }
      return { id, slug, name, onboardingCompleted };
    }
    return null;
  } catch (error) {
    console.error("Erro ao recuperar restaurante do proprietário:", error);
    return null;
  }
}

export async function ensureRestaurant(ownerId: string, ownerName?: string | null) {
  const existingId = typeof window === "undefined" ? null : localStorage.getItem("kardap-restaurant-id");
  if (existingId && existingId !== "unassigned") return existingId;

  // Verifica se o usuário já possui restaurante cadastrado no Firestore antes de criar um novo
  const found = await findRestaurantByOwner(ownerId);
  if (found) {
    return found.id;
  }

  const db = getDb();
  const restaurant = doc(collection(db, "restaurantes"));
  // Gravar o id antes da operação torna uma nova tentativa idempotente no mesmo navegador.
  if (typeof window !== "undefined") {
    localStorage.setItem("kardap-restaurant-id", restaurant.id);
    localStorage.setItem("kardap-restaurant-owner", ownerId);
  }
  const batch = writeBatch(db);
  const now = new Date().toISOString();
  batch.set(restaurant, {
    name: "",
    slug: "",
    ownerId,
    status: "active",
    onboarding: { completed: false, currentStep: 1, startedAt: now },
    createdAt: now,
    updatedAt: now,
  });
  batch.set(doc(restaurant, "membros", ownerId), {
    uid: ownerId,
    name: ownerName || null,
    role: "owner",
    permissions: ["*"],
    active: true,
    createdAt: now,
  });
  // Marca e configurações ficam no próprio documento do restaurante (brand e settings), que o painel
  // e o cardápio público leem em tempo real. A antiga cópia em configuracoes/geral não era lida por nada.
  try {
    await withWriteTimeout(batch.commit(), 20000);
    return restaurant.id;
  } catch (error) {
    if (typeof window !== "undefined") {
      localStorage.removeItem("kardap-restaurant-id");
    }
    throw error;
  }
}

const slugify = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 54) || "cardapio";

export async function reserveMenuSlug(name: string) {
  const db = getDb();
  const restaurantId = getRestaurantId();
  const base = slugify(name);
  for (let suffix = 1; suffix < 1000; suffix += 1) {
    const slug = suffix === 1 ? base : `${base}-${suffix}`;
    const claim = doc(db, "menuSlugs", slug);
    const reserved = await withTimeout(runTransaction(db, async (transaction) => {
      const existing = await transaction.get(claim);
      if (existing.exists() && existing.data().restaurantId !== restaurantId) return false;
      if (!existing.exists()) transaction.set(claim, { restaurantId, createdAt: new Date().toISOString() });
      return true;
    }), 20000);
    if (reserved) return slug;
  }
  throw new Error("Não foi possível gerar um link disponível para o cardápio.");
}

/* ─── Google Business (Places API) ─── */

export type PlaceResult = { placeId: string; name: string; address: string; city: string; state: string; mapsUrl: string };
export type PlaceDetails = { placeId: string; name: string; address: string; mapsUrl: string; reviewUrl: string };
export type GoogleBusiness = { placeId: string; name: string; address: string; reviewUrl: string; enabled: boolean; source: string; linkedAt?: unknown; updatedAt?: unknown };

async function getAuthHeaders(): Promise<HeadersInit> {
  const { getFirebaseAuth } = await import("./auth");
  const token = await getFirebaseAuth().currentUser?.getIdToken();
  if (!token) throw new Error("Sessão expirada. Entre de novo.");
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

export async function searchGooglePlaces(query: string): Promise<PlaceResult[]> {
  if (query.length < 3) return [];
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/google-places/search?q=${encodeURIComponent(query)}`, { headers, signal: AbortSignal.timeout(10000) });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || "Erro ao pesquisar."); }
  const data = await res.json();
  return data.results || [];
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/google-places/details?placeId=${encodeURIComponent(placeId)}`, { headers, signal: AbortSignal.timeout(10000) });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || "Erro ao obter detalhes."); }
  return res.json();
}

export async function saveGoogleBusiness(data: { placeId: string; name: string; address: string; reviewUrl: string; source: string }): Promise<void> {
  const restaurantId = getRestaurantId();
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/restaurants/${encodeURIComponent(restaurantId)}/google-business`, {
    method: "POST", headers, body: JSON.stringify(data),
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || "Erro ao salvar."); }
}

export async function deleteGoogleBusiness(): Promise<void> {
  const restaurantId = getRestaurantId();
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/restaurants/${encodeURIComponent(restaurantId)}/google-business`, {
    method: "DELETE", headers,
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || "Erro ao remover."); }
}

export async function getGoogleBusiness(): Promise<GoogleBusiness | null> {
  const restaurantId = getRestaurantId();
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/restaurants/${encodeURIComponent(restaurantId)}/google-business`, { headers });
  if (!res.ok) return null;
  const data = await res.json();
  return data.googleBusiness || null;
}

export type ChamadoDoc = { id: string; table: string; type: string; status: "ativo" | "andamento" | "concluido"; createdAt: string };

/** Observa a primeira página de chamados em tempo real (subcoleção paginada). */
export function watchChamados(
  pageSize: number,
  onData: (items: ChamadoDoc[], meta: SnapshotMeta & { lastCursor: QueryDocumentSnapshot | null; hasMore: boolean }) => void,
  onError: (error: Error) => void,
) {
  const q = query(collection(restaurantRef(), "chamados"), orderBy("createdAt", "desc"), limit(pageSize + 1));
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snapshot) => {
      const hasMore = snapshot.docs.length > pageSize;
      const docs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;
      const items = docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ChamadoDoc, "id">) }));
      const lastCursor = docs.length ? docs[docs.length - 1] : null;
      onData(items, { fromCache: snapshot.metadata.fromCache, lastCursor, hasMore });
    },
    onError,
  );
}

/** Carrega a próxima página de chamados após um cursor (one-shot, não escuta). */
export async function fetchChamadosPage(cursor: QueryDocumentSnapshot | null, pageSize: number) {
  const base = query(collection(restaurantRef(), "chamados"), orderBy("createdAt", "desc"), limit(pageSize + 1));
  const q = cursor ? query(base, startAfter(cursor)) : base;
  const snapshot = await withTimeout(getDocs(q));
  const hasMore = snapshot.docs.length > pageSize;
  const docs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;
  const items = docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ChamadoDoc, "id">) }));
  const lastCursor = docs.length ? docs[docs.length - 1] : null;
  return { items, lastCursor, hasMore };
}

export async function updateChamadoStatus(id: string, status: ChamadoDoc["status"]) {
  await withWriteTimeout(updateDoc(doc(restaurantRef(), "chamados", id), { status, updatedAt: new Date().toISOString() }));
}

/* ───────────────────────── Perfil do cliente (cardápio público) ───────────────────────── */

export type CustomerAddress = { id: string; label: string; street: string; number: string; complement: string; district: string; city: string; reference: string };

export type CustomerProfile = {
  name?: string;
  email?: string;
  phone?: string;
  emailNotifications?: boolean;
  addresses?: CustomerAddress[];
};

export async function saveCustomerProfile(uid: string, data: Partial<CustomerProfile>) {
  const { doc, setDoc } = await import("firebase/firestore");
  await withWriteTimeout(setDoc(doc(getDb(), "clientes", uid), data, { merge: true }), 10000);
}

export function watchCustomerProfile(
  uid: string,
  onChange: (data: CustomerProfile | null, meta: { fromCache: boolean }) => void,
  onError: (err: Error) => void,
) {
  const { doc, onSnapshot } = require("firebase/firestore");
  const ref = doc(getDb(), "clientes", uid);
  return onSnapshot(
    ref,
    (snap: any) => onChange(snap.exists() ? (snap.data() as CustomerProfile) : null, { fromCache: snap.metadata.fromCache }),
    onError,
  );
}

/* ───────────────────────── Solicitação de serviço (QR home) ───────────────────────── */

export type ChamadoStatus = "ativo" | "andamento" | "concluido";
export type ServiceRequestType = "call_waiter" | "request_bill";

export async function createServiceRequest(params: {
  restaurantId: string;
  tableToken: string;
  type: ServiceRequestType;
  sessionId: string;
}): Promise<{ id: string; duplicate: boolean }> {
  const { addDoc, collection, query, where, getDocs, limit } = await import("firebase/firestore");
  const colRef = collection(getDb(), "restaurantes", params.restaurantId, "chamados");
  const existing = await getDocs(query(colRef, where("sessionId", "==", params.sessionId), where("type", "==", params.type), where("status", "in", ["ativo", "andamento"]), limit(1)));
  if (!existing.empty) return { id: existing.docs[0].id, duplicate: true };
  const now = new Date().toISOString();
  const ref = await withWriteTimeout(addDoc(colRef, { table: params.tableToken, type: params.type, status: "ativo", sessionId: params.sessionId, createdAt: now }), 12000);
  return { id: ref.id, duplicate: false };
}

export function watchServiceRequest(
  restaurantId: string,
  requestId: string,
  onChange: (status: ChamadoStatus | null) => void,
) {
  const { doc, onSnapshot } = require("firebase/firestore");
  const ref = doc(getDb(), "restaurantes", restaurantId, "chamados", requestId);
  return onSnapshot(ref, (snap: any) => onChange(snap.exists() ? snap.data().status : null));
}

/** Chamado enviado pelo cliente no cardápio público: grava na subcoleção paginada do restaurante. */
export async function addPublicCall(restaurantId: string, call: { table: string; type: string }) {
  const now = new Date().toISOString();
  const entry = { ...call, status: "ativo" as const, createdAt: now };
  const ref = await withWriteTimeout(addDoc(collection(getDb(), "restaurantes", restaurantId, "chamados"), entry), 12000);
  return { id: ref.id, ...entry, time: "agora" };
}
