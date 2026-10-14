/**
 * Permissão por aplicativo (somente servidor). Estar logado no KARDAP não basta para abrir o PDV:
 * 1. papel: dono, ou membro ativo com a permissão "pdv" (ou "*"), de um restaurante não suspenso;
 * 2. plano: a assinatura do restaurante precisa estar válida e incluir o PDV (Pro, Business, Enterprise ou o
 *    teste do Pro). A regra é a mesma do painel (lib/billing/plans.ts), resolvida aqui no servidor central.
 *
 * Fontes, as mesmas que as regras do Firestore usam:
 * - restaurantes/{id}.ownerId e restaurantes/{id}.subscription
 * - restaurantes/{id}/membros/{uid} { role, permissions[], active }
 * - usuarios/{uid}.restaurantIds (perfil criado pelo servidor no cadastro)
 */
import { adminDb } from "@/lib/firebase-admin";
import { resolveEntitlements, roleAllows, type PlanId, type StoredSubscription } from "@/lib/billing/plans";

export type AppName = "pdv";
export type AppRestaurant = { id: string; name: string; role: string; planId?: PlanId };
/** Restaurante em que a pessoa tem o papel certo, mas o plano não libera: "plan" (Start) ou "subscription" (vencida). */
export type BlockedRestaurant = AppRestaurant & { reason: "plan" | "subscription" };
export type AppAccess = { allowed: boolean; restaurants: AppRestaurant[]; blocked: BlockedRestaurant[] };

export async function appAccess(uid: string, app: AppName): Promise<AppAccess> {
  void app;
  const db = adminDb();
  const [profile, owned] = await Promise.all([
    db.collection("usuarios").doc(uid).get(),
    db.collection("restaurantes").where("ownerId", "==", uid).limit(20).get(),
  ]);
  const ids = new Set<string>(owned.docs.map((d) => d.id));
  const listed = profile.get("restaurantIds");
  if (Array.isArray(listed)) listed.slice(0, 20).forEach((id) => typeof id === "string" && id && ids.add(id));

  const restaurants: AppRestaurant[] = [];
  const blocked: BlockedRestaurant[] = [];
  await Promise.all(
    Array.from(ids).map(async (id) => {
      const ref = db.collection("restaurantes").doc(id);
      const [restaurant, member] = await Promise.all([ref.get(), ref.collection("membros").doc(uid).get()]);
      if (!restaurant.exists || restaurant.get("status") === "suspended") return;
      const isOwner = restaurant.get("ownerId") === uid;
      const data = member.exists ? member.data() || {} : null;
      const access = isOwner ? { isOwner: true } : data ? { isOwner: false, role: String(data.role || "member"), permissions: Array.isArray(data.permissions) ? data.permissions : [], active: data.active !== false } : null;
      if (!roleAllows(access, "pdvAccess")) return;
      const entitlements = resolveEntitlements(restaurant.get("subscription") as StoredSubscription, { createdAt: restaurant.get("createdAt"), restaurantStatus: restaurant.get("status") });
      const entry: AppRestaurant = { id, name: String(restaurant.get("name") || ""), role: isOwner ? "owner" : String(data?.role || "member"), planId: entitlements.planId };
      if (entitlements.features.pdvAccess) restaurants.push(entry);
      else blocked.push({ ...entry, reason: entitlements.contracted.features.pdvAccess && !entitlements.valid ? "subscription" : "plan" });
    }),
  );
  restaurants.sort((a, b) => a.name.localeCompare(b.name));
  blocked.sort((a, b) => a.name.localeCompare(b.name));
  return { allowed: restaurants.length > 0, restaurants, blocked };
}
