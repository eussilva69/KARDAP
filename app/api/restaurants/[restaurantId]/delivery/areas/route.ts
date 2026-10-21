import type { NextRequest } from "next/server";
import { authenticate, json, errorResponse, preflight, readJson } from "@/lib/billing/http";
import { getDeliveryAreas, saveDeliveryAreas, removeDeliveryCity } from "@/lib/delivery/server";
import type { NeighborhoodEntry } from "@/lib/delivery/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

const IBGE_CODE = /^\d{7}$/;
const badCode = (req: NextRequest) => json(req, { error: "invalid_code", message: "Código IBGE da cidade inválido." }, 400);

export async function GET(req: NextRequest, { params }: { params: { restaurantId: string } }) {
  try {
    const caller = await authenticate(req);
    const cityCode = req.nextUrl.searchParams.get("cityCode") || "";
    if (!IBGE_CODE.test(cityCode)) return badCode(req);

    const data = await getDeliveryAreas(params.restaurantId, caller.uid, cityCode);
    return json(req, data || { neighborhoods: {} });
  } catch (error) {
    return errorResponse(req, "delivery areas get", error);
  }
}

export async function POST(req: NextRequest, { params }: { params: { restaurantId: string } }) {
  try {
    const caller = await authenticate(req);
    const body = await readJson(req);

    const cityCode = String(body.cityCode || "");
    const cityName = String(body.cityName || "").trim();
    const uf = String(body.uf || "").trim();
    if (!IBGE_CODE.test(cityCode)) return badCode(req);
    if (!cityName || uf.length !== 2) {
      return json(req, { error: "missing_fields", message: "Informe a cidade e a UF." }, 400);
    }
    const neighborhoods = body.neighborhoods && typeof body.neighborhoods === "object" ? (body.neighborhoods as Record<string, NeighborhoodEntry>) : {};
    const placeId = typeof body.placeId === "string" ? body.placeId : undefined;

    const config = await saveDeliveryAreas(params.restaurantId, caller.uid, cityCode, { cityName, uf, placeId, neighborhoods });
    return json(req, { ok: true, config });
  } catch (error) {
    return errorResponse(req, "delivery areas save", error);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { restaurantId: string } }) {
  try {
    const caller = await authenticate(req);
    const cityCode = req.nextUrl.searchParams.get("cityCode") || "";
    if (!IBGE_CODE.test(cityCode)) return badCode(req);

    const config = await removeDeliveryCity(params.restaurantId, caller.uid, cityCode);
    return json(req, { ok: true, config });
  } catch (error) {
    return errorResponse(req, "delivery areas delete", error);
  }
}
