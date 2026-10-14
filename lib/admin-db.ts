import { addDoc, collection, doc, getCountFromServer, getDoc, getDocs, limit, orderBy, query, updateDoc, where } from "firebase/firestore";
import { getDb } from "./firebase";
import { withTimeout, withWriteTimeout } from "./async";
import { effectiveSubscription, toDate } from "./cakto/access";
import type { RestaurantSubscription } from "./cakto/types";

/**
 * Dados da administração do sistema. As permissões são garantidas pelas regras do Firestore
 * (documento admins/{uid}); estas funções só organizam as leituras e registram cada ação.
 */

export type AdminRestaurant = {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  businessEmail: string;
  businessPhone: string;
  establishmentType: string;
  createdAt: Date | null;
  rawCreatedAt: unknown;
  onboardingCompleted: boolean;
  suspended: boolean;
  suspendedReason: string;
  subscription: Partial<RestaurantSubscription> | null;
};

export type AdminLogEntry = {
  id: string;
  adminUid: string;
  adminEmail: string;
  restaurantId: string;
  restaurantName: string;
  action: "extend_trial" | "suspend" | "reactivate" | "set_subscription" | "reconcile_usage" | "resolve_failure";
  reason?: string;
  before?: unknown;
  after?: unknown;
  detail: string;
  createdAt: string;
};

export type AdminIdentity = { uid: string; email: string };

const DAY = 24 * 60 * 60 * 1000;
const text = (value: unknown) => (typeof value === "string" ? value : "");

export async function isSystemAdmin(uid: string) {
  const snap = await withTimeout(getDoc(doc(getDb(), "admins", uid)));
  return snap.exists();
}

function toRestaurant(id: string, data: Record<string, any>): AdminRestaurant {
  return {
    id,
    name: text(data.name),
    slug: text(data.slug),
    ownerId: text(data.ownerId),
    businessEmail: text(data.businessEmail),
    businessPhone: text(data.businessPhone),
    establishmentType: text(data.establishmentType),
    createdAt: toDate(data.createdAt),
    rawCreatedAt: data.createdAt ?? null,
    onboardingCompleted: Boolean(data.onboarding?.completed),
    suspended: data.status === "suspended",
    suspendedReason: text(data.suspendedReason),
    subscription: (data.subscription as Partial<RestaurantSubscription>) || null,
  };
}

/** Todos os restaurantes (até `max`), do mais novo para o mais antigo. */
export async function listRestaurants(max = 2000) {
  const snap = await withTimeout(getDocs(query(collection(getDb(), "restaurantes"), limit(max))), 30000);
  const items = snap.docs.map((d) => toRestaurant(d.id, d.data()));
  items.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  return { items, truncated: snap.size >= max };
}

export async function getRestaurant(id: string) {
  const snap = await withTimeout(getDoc(doc(getDb(), "restaurantes", id)));
  return snap.exists() ? toRestaurant(snap.id, snap.data()) : null;
}

export type RestaurantDetail = {
  counts: { products: number; categories: number; tables: number; callsLast30: number };
  members: { uid: string; name: string; role: string }[];
  ownerEmail: string;
  payments: { id: string; date: Date | null; amount: string; status: string; method: string }[];
  log: AdminLogEntry[];
};

const settle = async <T,>(promise: Promise<T>, fallback: T) => {
  try {
    return await promise;
  } catch {
    return fallback;
  }
};

export async function getRestaurantDetail(restaurant: AdminRestaurant): Promise<RestaurantDetail> {
  const db = getDb();
  const base = ["restaurantes", restaurant.id] as const;
  const count = (sub: string) => settle(withTimeout(getCountFromServer(collection(db, ...base, sub))).then((r) => r.data().count), 0);
  const since = new Date(Date.now() - 30 * DAY).toISOString();
  const [products, categories, tables, callsLast30, membersSnap, ownerSnap, paymentsSnap, log] = await Promise.all([
    count("produtos"),
    count("categorias"),
    count("mesas"),
    settle(withTimeout(getCountFromServer(query(collection(db, ...base, "chamados"), where("createdAt", ">=", since)))).then((r) => r.data().count), 0),
    settle(withTimeout(getDocs(collection(db, ...base, "membros"))), null),
    restaurant.ownerId ? settle(withTimeout(getDoc(doc(db, "usuarios", restaurant.ownerId))), null) : Promise.resolve(null),
    settle(withTimeout(getDocs(query(collection(db, ...base, "pagamentos"), limit(20)))), null),
    listAdminLog(restaurant.id),
  ]);
  const payments = (paymentsSnap?.docs || [])
    .map((d) => {
      const p = d.data();
      return { id: d.id, date: toDate(p.paidAt || p.createdAt), amount: text(p.amountFormatted), status: text(p.status), method: text(p.paymentMethodName || p.paymentMethod) };
    })
    .sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
  return {
    counts: { products, categories, tables, callsLast30 },
    members: (membersSnap?.docs || []).map((d) => ({ uid: d.id, name: text(d.data().name), role: text(d.data().role) })),
    ownerEmail: text(ownerSnap?.exists() ? ownerSnap.data()?.email : ""),
    payments,
    log,
  };
}

export async function listAdminLog(restaurantId?: string, max = 30): Promise<AdminLogEntry[]> {
  const db = getDb();
  const q = restaurantId
    ? query(collection(db, "adminLog"), where("restaurantId", "==", restaurantId), limit(max))
    : query(collection(db, "adminLog"), orderBy("createdAt", "desc"), limit(max));
  const snap = await settle(withTimeout(getDocs(q)), null);
  return (snap?.docs || [])
    .map((d) => ({ id: d.id, ...(d.data() as Omit<AdminLogEntry, "id">) }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function log(admin: AdminIdentity, restaurant: AdminRestaurant, action: AdminLogEntry["action"], detail: string) {
  await withWriteTimeout(
    addDoc(collection(getDb(), "adminLog"), {
      adminUid: admin.uid,
      adminEmail: admin.email,
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      action,
      detail,
      createdAt: new Date().toISOString(),
    }),
  );
}

/** Assinaturas pagas em andamento não recebem extensão de teste. */
export function canExtendTrial(restaurant: AdminRestaurant) {
  const status = restaurant.subscription?.status;
  return status !== "active" && status !== "late" && status !== "past_due";
}

/** Ações de assinatura passam pelo servidor, que confere o administrador e registra antes/depois e motivo. */
export async function adminSubscriptionAction(body: Record<string, unknown>) {
  const { getFirebaseAuth } = await import("./auth");
  const token = await getFirebaseAuth().currentUser?.getIdToken();
  if (!token) throw new Error("Sua sessão expirou. Entre de novo.");
  const res = await withTimeout(fetch("/api/admin/assinaturas", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }), 20000);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.message === "string" ? data.message : "Não foi possível concluir a alteração.");
  return data;
}

/** Estende o teste (Pro) contando a partir do fim atual ou de hoje, o que vier depois. */
export async function extendTrial(restaurant: AdminRestaurant, days: number, _admin: AdminIdentity, reason = `Extensão do teste em ${days} dias pelo painel de administração`) {
  if (!canExtendTrial(restaurant)) throw new Error("Este restaurante tem uma assinatura paga em andamento.");
  const data = await adminSubscriptionAction({ restaurantId: restaurant.id, action: "extend_trial", days, reason });
  return String(data.trialEndsAt);
}

export async function setSuspended(restaurant: AdminRestaurant, suspended: boolean, reason: string, admin: AdminIdentity) {
  const now = new Date().toISOString();
  await withWriteTimeout(
    updateDoc(doc(getDb(), "restaurantes", restaurant.id), {
      status: suspended ? "suspended" : "active",
      suspendedAt: suspended ? now : null,
      suspendedReason: suspended ? reason.trim() : "",
      updatedAt: now,
    }),
  );
  await log(admin, restaurant, suspended ? "suspend" : "reactivate", suspended ? `Cardápio suspenso. Motivo: ${reason.trim()}` : "Cardápio reativado");
}
