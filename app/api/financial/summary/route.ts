import type { NextRequest } from "next/server";
import { json, errorResponse, preflight } from "@/lib/billing/http";
import { adminAuth } from "@/lib/firebase-admin";
import { isAdminUid as isSystemAdmin } from "@/lib/admin/server";
import { getFinancialSummary, getRestaurantFinancialRows } from "@/lib/financial/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

async function requireAdmin(req: NextRequest): Promise<string> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw Object.assign(new Error("Não autenticado."), { status: 401 });
  const decoded = await adminAuth().verifyIdToken(token);
  const ok = await isSystemAdmin(decoded.uid);
  if (!ok) throw Object.assign(new Error("Acesso restrito à administração."), { status: 403 });
  return decoded.uid;
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from") || undefined;
    const to = searchParams.get("to") || undefined;
    const restaurantId = searchParams.get("restaurant_id") || undefined;

    const [summary, rows] = await Promise.all([
      getFinancialSummary({ from, to, restaurant_id: restaurantId }),
      restaurantId ? [] : getRestaurantFinancialRows(),
    ]);

    return json(req, { summary, rows });
  } catch (error) {
    return errorResponse(req, "financial summary", error);
  }
}
