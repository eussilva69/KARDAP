import type { NextRequest } from "next/server";
import { json, errorResponse, preflight } from "@/lib/billing/http";
import { customerPaymentMethods, getDeliveryConfig } from "@/lib/delivery/server";
import { isGoogleConfigured } from "@/lib/delivery/geo";

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
      // Pix e cartão online só aparecem com o gateway configurado (sem ele o pedido ficaria parado no pagamento).
      paymentMethods: customerPaymentMethods(config.paymentMethods),
      notes: config.notes || "",
      feeMode: config.feeMode || "taxa_fixa",
      servedCities: (config.servedCities || []).filter((c) => c.enabled !== false).map(({ ibgeCode, name, uf }) => ({ ibgeCode, name, uf })),
      hasServedCities: (config.servedCities || []).length > 0,
      addressSearch: isGoogleConfigured(),
    });
  } catch (error) {
    return errorResponse(req, "delivery menu", error);
  }
}
