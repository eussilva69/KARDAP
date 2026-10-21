import type { NextRequest } from "next/server";
import { errorResponse, json, preflight, readJson } from "@/lib/billing/http";
import { BillingError } from "@/lib/billing/server";
import { isAdminUid as isSystemAdmin } from "@/lib/admin/server";
import { adminAuth } from "@/lib/firebase-admin";
import { decideWithdrawal, listWithdrawals, payWithdrawal } from "@/lib/financial/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

async function requireAdmin(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new BillingError("unauthenticated", 401, "Não autenticado.");
  const user = await adminAuth().verifyIdToken(token);
  if (!(await isSystemAdmin(user.uid))) throw new BillingError("forbidden", 403, "Acesso restrito à administração.");
  return user.uid;
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const restaurantId = new URL(req.url).searchParams.get("restaurant_id") || undefined;
    return json(req, { withdrawals: await listWithdrawals({ restaurant_id: restaurantId, limit: 100 }) });
  } catch (error) {
    return errorResponse(req, "list withdrawals", error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const adminUid = await requireAdmin(req);
    const body = await readJson(req);
    const id = typeof body.withdrawal_id === "string" ? body.withdrawal_id : "";
    if (!id) throw new BillingError("invalid_withdrawal", 400, "withdrawal_id é obrigatório.");
    if (body.action === "approve") await decideWithdrawal(id, adminUid, "approve");
    else if (body.action === "reject") await decideWithdrawal(id, adminUid, "reject", typeof body.reason === "string" ? body.reason : "");
    else if (body.action === "pay") await payWithdrawal(id, adminUid, { transferTransactionId: typeof body.transfer_transaction_id === "string" ? body.transfer_transaction_id : undefined, paymentProofReference: typeof body.payment_proof_reference === "string" ? body.payment_proof_reference : undefined });
    else throw new BillingError("invalid_action", 400, "Ação inválida.");
    return json(req, { ok: true });
  } catch (error) {
    return errorResponse(req, "manage withdrawal", error);
  }
}
