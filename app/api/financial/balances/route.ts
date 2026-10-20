import type { NextRequest } from "next/server";
import { json, errorResponse, preflight } from "@/lib/billing/http";
import { adminAuth } from "@/lib/firebase-admin";
import { isSystemAdmin } from "@/lib/admin-db";
import { getRestaurantBalance } from "@/lib/financial/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

async function requireAdmin(req: NextRequest): Promise<string> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw Object.assign(new Error("Não autenticado."), { status: 401 });
  const decoded = await adminAuth().verifyIdToken(token);
  const ok = await isSystemAdmin(decoded.uid);
  if (!ok) throw Object.assign(new Error("Acesso restrito."), { status: 403 });
  return decoded.uid;
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const { searchParams } = new URL(req.url);
    const restaurantId = searchParams.get("restaurant_id");
    if (!restaurantId) throw new Error("restaurant_id obrigatório.");
    const balance = await getRestaurantBalance(restaurantId);
    return json(req, { balance });
  } catch (error) {
    return errorResponse(req, "restaurant balance", error);
  }
}
