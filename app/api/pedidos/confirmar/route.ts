import type { NextRequest } from "next/server";
import { authenticate, errorResponse, json, preflight, readJson } from "@/lib/billing/http";
import { confirmNativeOrder } from "@/lib/billing/server";
import { rateLimit } from "@/lib/sso/server";

/**
 * Confirma um pedido PRÓPRIO do KARDAP (PDV, mesa, delivery, retirada, equipe) e consome 1 da franquia do mês.
 * Corpo: { restaurantId, source, orderId? | idempotencyKey?, order? } (+ session, se chamado pelo servidor do PDV).
 * Reenvio do mesmo pedido responde 200 com duplicate: true, sem consumir de novo.
 * Franquia esgotada: 402 { error: "quota_exceeded", used, limit }. Pedidos de marketplace usam /api/pedidos/externos.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

export async function POST(req: NextRequest) {
  try {
    const body = await readJson(req);
    const caller = await authenticate(req, body);
    rateLimit(req, "orders-confirm", 600, 60_000, caller.uid);
    const result = await confirmNativeOrder({
      restaurantId: String(body.restaurantId || ""),
      uid: caller.uid,
      source: body.source,
      orderId: body.orderId,
      idempotencyKey: body.idempotencyKey,
      order: body.order,
    });
    return json(req, result, result.duplicate ? 200 : 201);
  } catch (error) {
    return errorResponse(req, "confirmar pedido", error);
  }
}
