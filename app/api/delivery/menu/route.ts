import type { NextRequest } from "next/server";
import { json, errorResponse, preflight } from "@/lib/billing/http";
import { getDeliveryConfig } from "@/lib/delivery/server";

/**
 * GET /api/delivery/menu?restaurantId=X — Configuração pública do delivery (sem autenticação).
 * Retorna apenas o necessário para o checkout: taxa, ETA, área, pedido mínimo, métodos de pagamento.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export async function GET(req: NextRequest) {
  try {
    const restaurantId = req.nextUrl.searchParams.get("restaurantId") || "";
    if (!restaurantId) return json(req, { error: "missing_restaurant", message: "Informe o restaurante." }, 400);

    const config = await getDeliveryConfig(restaurantId);
    if (!config.enabled) return json(req, { error: "delivery_disabled", message: "Este restaurante não está aceitando pedidos de delivery." }, 403);

    return json(req, {
      deliveryFeeCents: config.deliveryFeeCents,
      deliveryEta: config.deliveryEta,
      deliveryArea: config.deliveryArea,
      minOrderCents: config.minOrderCents,
      paymentMethods: config.paymentMethods,
      notes: config.notes || "",
      feeMode: config.feeMode || "taxa_fixa",
      servedCities: config.servedCities || [],
    });
  } catch (error) {
    return errorResponse(req, "delivery menu", error);
  }
}
