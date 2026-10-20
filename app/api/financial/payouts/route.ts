import type { NextRequest } from "next/server";
import { json, errorResponse, preflight, readJson } from "@/lib/billing/http";
import { adminAuth } from "@/lib/firebase-admin";
import { isSystemAdmin } from "@/lib/admin-db";
import { createPayout, confirmPayout, cancelPayout, listPayouts } from "@/lib/financial/server";
import type { PayoutStatus } from "@/lib/financial/types";

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
    const payouts = await listPayouts({
      restaurant_id: searchParams.get("restaurant_id") || undefined,
      status: (searchParams.get("status") as PayoutStatus) || undefined,
      limit: Math.min(Number(searchParams.get("limit") || "50"), 200),
    });
    return json(req, { payouts });
  } catch (error) {
    return errorResponse(req, "list payouts", error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const adminUid = await requireAdmin(req);
    const body = await readJson(req);
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");

    if (action === "confirm") {
      const payoutId = String(body.payout_id || "");
      if (!payoutId) throw new Error("payout_id obrigatório.");
      await confirmPayout(payoutId, adminUid, {
        gateway_transfer_id: body.gateway_transfer_id ? String(body.gateway_transfer_id) : undefined,
        receipt_reference: body.receipt_reference ? String(body.receipt_reference) : undefined,
        notes: body.notes ? String(body.notes) : undefined,
      });
      return json(req, { ok: true });
    }

    if (action === "cancel") {
      const payoutId = String(body.payout_id || "");
      if (!payoutId) throw new Error("payout_id obrigatório.");
      await cancelPayout(payoutId, adminUid, body.reason ? String(body.reason) : undefined);
      return json(req, { ok: true });
    }

    // Criar novo repasse
    const restaurantId = String(body.restaurant_id || "");
    const amountCents = Number(body.amount_cents);
    if (!restaurantId) throw new Error("restaurant_id obrigatório.");
    if (!amountCents || amountCents <= 0) throw new Error("amount_cents deve ser positivo.");

    const payout = await createPayout(restaurantId, amountCents, adminUid, {
      pix_key: body.pix_key ? String(body.pix_key) : undefined,
      notes: body.notes ? String(body.notes) : undefined,
      destination_info: body.destination_info ? String(body.destination_info) : undefined,
    });

    return json(req, { payout }, 201);
  } catch (error) {
    return errorResponse(req, "manage payout", error);
  }
}
