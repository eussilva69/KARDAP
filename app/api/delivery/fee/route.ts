import type { NextRequest } from "next/server";
import { json, errorResponse, preflight } from "@/lib/billing/http";
import { calculateDeliveryFee, getServedNeighborhoods } from "@/lib/delivery/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export async function GET(req: NextRequest) {
  try {
    const restaurantId = req.nextUrl.searchParams.get("restaurantId") || "";
    const city = req.nextUrl.searchParams.get("city") || "";
    const district = req.nextUrl.searchParams.get("district") || "";
    const uf = req.nextUrl.searchParams.get("uf") || "";

    if (!restaurantId) return json(req, { error: "missing_restaurant", message: "Informe o restaurante." }, 400);
    if (!city) return json(req, { error: "missing_city", message: "Informe a cidade." }, 400);

    const result = await calculateDeliveryFee(restaurantId, city, district, uf || undefined);

    let servedNeighborhoods: { name: string; slug: string }[] | undefined;
    if ((!result.matched && result.reason?.includes("bairro")) || (!district && result.feeMode === "taxa_por_bairro")) {
      servedNeighborhoods = await getServedNeighborhoods(restaurantId, city);
    }

    return json(req, { ...result, servedNeighborhoods });
  } catch (error) {
    return errorResponse(req, "delivery fee", error);
  }
}
