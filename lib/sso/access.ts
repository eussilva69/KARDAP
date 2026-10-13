/**
 * Permissão por aplicativo (somente servidor). Estar logado no KARDAP não basta para abrir o PDV:
 * o usuário precisa ser dono ou membro ativo com a permissão "pdv" (ou "*") de um restaurante não suspenso.
 *
 * Fontes, as mesmas que as regras do Firestore usam:
 * - restaurantes/{id}.ownerId
 * - restaurantes/{id}/membros/{uid} { role, permissions[], active }
 * - usuarios/{uid}.restaurantIds (perfil criado pelo servidor no cadastro)
 */
import { adminDb } from "@/lib/firebase-admin";

export type AppName = "pdv";
export type AppRestaurant = { id: string; name: string; role: string };
export type AppAccess = { allowed: boolean; restaurants: AppRestaurant[] };

const PERMISSION: Record<AppName, string> = { pdv: "pdv" };

export async function appAccess(uid: string, app: AppName): Promise<AppAccess> {
  const db = adminDb();
  const [profile, owned] = await Promise.all([
    db.collection("usuarios").doc(uid).get(),
    db.collection("restaurantes").where("ownerId", "==", uid).limit(20).get(),
  ]);
  const ids = new Set<string>(owned.docs.map((d) => d.id));
  const listed = profile.get("restaurantIds");
  if (Array.isArray(listed)) listed.slice(0, 20).forEach((id) => typeof id === "string" && id && ids.add(id));

  const restaurants: AppRestaurant[] = [];
  await Promise.all(
    Array.from(ids).map(async (id) => {
      const ref = db.collection("restaurantes").doc(id);
      const [restaurant, member] = await Promise.all([ref.get(), ref.collection("membros").doc(uid).get()]);
      if (!restaurant.exists || restaurant.get("status") === "suspended") return;
      const isOwner = restaurant.get("ownerId") === uid;
      const data = member.exists ? member.data() || {} : null;
      const permissions: unknown[] = Array.isArray(data?.permissions) ? data!.permissions : [];
      const activeMember = Boolean(data) && data!.active !== false;
      const allowed =
        isOwner ||
        (activeMember && (data!.role === "owner" || permissions.includes("*") || permissions.includes(PERMISSION[app])));
      if (allowed) restaurants.push({ id, name: String(restaurant.get("name") || ""), role: isOwner ? "owner" : String(data?.role || "member") });
    }),
  );
  restaurants.sort((a, b) => a.name.localeCompare(b.name));
  return { allowed: restaurants.length > 0, restaurants };
}
