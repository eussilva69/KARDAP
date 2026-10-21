import type { NextRequest } from "next/server";
import { BillingError } from "@/lib/billing/server";
import { authenticate, errorResponse, json, preflight, readJson } from "@/lib/billing/http";
import { adminBucket, adminDb } from "@/lib/firebase-admin";
import { rateLimit } from "@/lib/sso/server";
import { DEMO_RESTAURANT_ID, isDemoRestaurant } from "@/lib/demo/ids";
import { applyDemo, readDemoConfig, restoreMediaFiles } from "@/lib/demo/apply";
import { DEFAULT_FINANCIAL_SETTINGS, type FinancialSettings } from "@/lib/financial/types";

/**
 * POST /api/demo/reset — volta a conta demonstrativa ao estado inicial (docs/DEMO.md).
 * Só o dono da demonstração ou um administrador do sistema; só o restaurante demo (id fixo + marca isDemo).
 * Apaga as movimentações feitas na apresentação, regrava cardápio, mesas, pedidos e financeiro simulados com datas
 * relativas a agora e recoloca arquivos de mídia removidos. A conta de login e os outros restaurantes não mudam.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export async function POST(req: NextRequest) {
  try {
    const body = await readJson(req);
    const caller = await authenticate(req, body);
    rateLimit(req, "demo-reset", 3, 60_000, caller.uid);
    const db = adminDb();
    const restaurant = await db.collection("restaurantes").doc(DEMO_RESTAURANT_ID).get();
    if (!restaurant.exists || !isDemoRestaurant(restaurant.id, restaurant.data())) throw new BillingError("not_found", 404, "Demonstração não encontrada.");
    const isOwner = restaurant.get("ownerId") === caller.uid;
    const isAdmin = !isOwner && (await db.collection("admins").doc(caller.uid).get()).exists;
    if (!isOwner && !isAdmin) throw new BillingError("forbidden", 403, "Só a conta de demonstração ou a administração pode restaurar.");

    const config = await readDemoConfig(db);
    const ownerId = String(restaurant.get("ownerId"));
    const settingsSnap = await db.collection("financial_settings").doc("global").get();
    const settings = { ...DEFAULT_FINANCIAL_SETTINGS, ...(settingsSnap.exists ? (settingsSnap.data() as Partial<FinancialSettings>) : {}) };
    const result = await applyDemo(db, { ownerId, ownerEmail: config?.ownerEmail, media: config?.media || null, settings });
    const restoredFiles = await restoreMediaFiles(adminBucket(), config?.media || null);
    await db.collection("demoConfig").doc(DEMO_RESTAURANT_ID).set({ restoredBy: caller.uid, restoredAt: new Date().toISOString() }, { merge: true });
    return json(req, { ok: true, orders: result.orders, counts: result.counts, restoredFiles });
  } catch (error) {
    return errorResponse(req, "demo reset", error);
  }
}
