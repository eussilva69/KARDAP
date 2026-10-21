import type { NextRequest } from "next/server";
import { authenticate, json, errorResponse, preflight, readJson } from "@/lib/billing/http";
import { requireFeature } from "@/lib/billing/server";
import { getPublicOrderStatus, updateOrderStatus } from "@/lib/delivery/server";
import type { DeliveryOrderStatus } from "@/lib/delivery/types";

/**
 * GET  /api/delivery/orders/{orderId}/status?restaurantId=X — Acompanhamento público do pedido
 * POST /api/delivery/orders/{orderId}/status — Altera status (autenticado, PDV/painel)
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export async function GET(req: NextRequest, { params }: { params: { orderId: string } }) {
  try {
    const restaurantId = req.nextUrl.searchParams.get("restaurantId") || "";
    if (!restaurantId) return json(req, { error: "missing_restaurant", message: "Informe o restaurante." }, 400);
    const result = await getPublicOrderStatus(restaurantId, params.orderId);
    if (!result) return json(req, { error: "not_found", message: "Pedido não encontrado." }, 404);
    return json(req, result);
  } catch (error) {
    return errorResponse(req, "delivery status", error);
  }
}

export async function POST(req: NextRequest, { params }: { params: { orderId: string } }) {
  try {
    const body = await readJson(req);
    const caller = await authenticate(req, body);
    const restaurantId = String(body.restaurantId || "");
    const newStatus = String(body.status || "") as DeliveryOrderStatus;
    const courierId = typeof body.courierId === "string" ? body.courierId : undefined;
    // Só a equipe do próprio estabelecimento (com permissão de pedidos) altera o status: sem isto, qualquer conta
    // logada mudaria pedidos de outro restaurante informando o restaurantId dele.
    await requireFeature(restaurantId, caller.uid, "orderManagement");
    await updateOrderStatus(restaurantId, params.orderId, newStatus, caller.uid, courierId);
    return json(req, { ok: true, status: newStatus });
  } catch (error) {
    return errorResponse(req, "delivery status update", error);
  }
}
