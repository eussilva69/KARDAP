import type { NextRequest } from "next/server";
import { errorResponse, json, readJson } from "@/lib/billing/http";
import { recordExternalOrder } from "@/lib/billing/server";
import { authenticateClient } from "@/lib/sso/oauth";
import { rateLimit } from "@/lib/sso/server";

/**
 * Pedido recebido de marketplace (iFood, 99Food ou outro), enviado pelo SERVIDOR da integração (o PDV), autenticado
 * com o segredo do cliente: Authorization: Basic base64(client_id:client_secret).
 * Corpo: { restaurantId, provider: "ifood" | "99food" | "external_marketplace", externalOrderId, order?, providerName? }.
 * Nunca consome a franquia de pedidos próprios e nunca é bloqueado por ela. Reenvios atualizam o mesmo pedido.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const clientId = authenticateClient(req);
    rateLimit(req, "orders-external", 3000, 60_000, clientId);
    const body = await readJson(req);
    const result = await recordExternalOrder({
      restaurantId: String(body.restaurantId || ""),
      provider: body.provider,
      externalOrderId: body.externalOrderId,
      order: body.order,
      providerName: body.providerName,
    });
    return json(req, result, result.created ? 201 : 200);
  } catch (error) {
    return errorResponse(req, "pedido externo", error);
  }
}
