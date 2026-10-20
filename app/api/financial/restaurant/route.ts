import type { NextRequest } from "next/server";
import { BillingError } from "@/lib/billing/server";
import { errorResponse, json, preflight, readJson } from "@/lib/billing/http";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { getRestaurantBalance, getFinancialSummary, listTransactions, listWithdrawals, requestWithdrawal } from "@/lib/financial/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

async function ownerRestaurant(req: NextRequest, restaurantId: string) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new BillingError("unauthenticated", 401, "Entre para acessar o financeiro.");
  const user = await adminAuth().verifyIdToken(token);
  const restaurant = await adminDb().collection("restaurantes").doc(restaurantId).get();
  if (!restaurant.exists) throw new BillingError("not_found", 404, "Estabelecimento não encontrado.");
  if (restaurant.get("ownerId") !== user.uid) throw new BillingError("forbidden", 403, "Somente o responsável pelo estabelecimento acessa os saques.");
  return user;
}

export async function GET(req: NextRequest) {
  try {
    const restaurantId = new URL(req.url).searchParams.get("restaurant_id") || "";
    if (!restaurantId) throw new BillingError("invalid_restaurant", 400, "restaurant_id é obrigatório.");
    await ownerRestaurant(req, restaurantId);
    const [balance, summary, transactions, withdrawals] = await Promise.all([
      getRestaurantBalance(restaurantId),
      getFinancialSummary({ restaurant_id: restaurantId }),
      listTransactions({ restaurant_id: restaurantId, limit: 100 }),
      listWithdrawals({ restaurant_id: restaurantId, limit: 30 }),
    ]);
    return json(req, { balance, summary, transactions, withdrawals });
  } catch (error) {
    return errorResponse(req, "restaurant financial dashboard", error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJson(req);
    const restaurantId = typeof body.restaurant_id === "string" ? body.restaurant_id : "";
    if (!restaurantId) throw new BillingError("invalid_restaurant", 400, "restaurant_id é obrigatório.");
    await ownerRestaurant(req, restaurantId);
    const pixKey = typeof body.pix_key === "string" ? body.pix_key : "";
    const withdrawal = await requestWithdrawal(restaurantId, pixKey);
    return json(req, { withdrawal }, 201);
  } catch (error) {
    return errorResponse(req, "request withdrawal", error);
  }
}
