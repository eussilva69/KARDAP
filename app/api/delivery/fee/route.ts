import type { NextRequest } from "next/server";
import { json, errorResponse, preflight } from "@/lib/billing/http";
import { rateLimit } from "@/lib/sso/server";
import { calculateDeliveryFee, getServedNeighborhoods } from "@/lib/delivery/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export async function GET(req: NextRequest) {
  try {
    rateLimit(req, "delivery-fee", 90, 60_000);
    const params = req.nextUrl.searchParams;
    const restaurantId = params.get("restaurantId") || "";
    const city = (params.get("city") || "").slice(0, 100);
    const district = (params.get("district") || "").slice(0, 100);
    const uf = (params.get("uf") || "").slice(0, 2);
    const ibgeCode = (params.get("ibgeCode") || "").slice(0, 7);

    if (!restaurantId) return json(req, { error: "missing_restaurant", message: "Informe o restaurante." }, 400);
    if (!city) return json(req, { error: "missing_city", message: "Informe a cidade." }, 400);

    const result = await calculateDeliveryFee(restaurantId, city, district, uf || undefined, ibgeCode || undefined);

    // Cidade atendida mas bairro não reconhecido (ou ainda não informado): devolve a lista para o cliente escolher.
    let servedNeighborhoods: { name: string; slug: string }[] | undefined;
    if (result.cityIbgeCode && (!result.matched || !district) && result.feeMode === "taxa_por_bairro") {
      servedNeighborhoods = await getServedNeighborhoods(restaurantId, city, uf || undefined, result.cityIbgeCode);
    }

    return json(req, { ...result, servedNeighborhoods });
  } catch (error) {
    return errorResponse(req, "delivery fee", error);
  }
}
