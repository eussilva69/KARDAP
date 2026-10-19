import type { NextRequest } from "next/server";
import { json, errorResponse, preflight, readJson } from "@/lib/billing/http";
import { createDeliveryOrder } from "@/lib/delivery/server";
import { rateLimit } from "@/lib/sso/server";

/**
 * POST /api/delivery/orders — Cria pedido de delivery (chamado pelo checkout público, sem autenticação obrigatória).
 * O cliente pode estar logado (uid opcional) ou não.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export async function POST(req: NextRequest) {
  try {
    const body = await readJson(req);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    rateLimit(req, "delivery-order", 10, 60_000, ip);

    let customerUid: string | undefined;
    const authHeader = req.headers.get("authorization") || "";
    if (/^Bearer\s+/i.test(authHeader)) {
      try {
        const { adminAuth } = await import("@/lib/firebase-admin");
        const decoded = await adminAuth().verifyIdToken(authHeader.replace(/^Bearer\s+/i, ""));
        if (decoded.firebase?.sign_in_provider !== "anonymous") customerUid = decoded.uid;
      } catch {
        // Token inválido: prossegue sem uid (pedido anônimo)
      }
    }

    const result = await createDeliveryOrder(
      {
        restaurantId: String(body.restaurantId || ""),
        customer: body.customer as any,
        address: body.address as any,
        items: body.items as any,
        paymentMethod: String(body.paymentMethod || ""),
        notes: typeof body.notes === "string" ? body.notes : undefined,
        idempotencyKey: String(body.idempotencyKey || ""),
      },
      customerUid,
    );

    return json(req, result, result.duplicate ? 200 : 201);
  } catch (error) {
    return errorResponse(req, "delivery order", error);
  }
}
