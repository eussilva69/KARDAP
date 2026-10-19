import type { NextRequest } from "next/server";
import { authenticate, json, errorResponse, preflight, readJson } from "@/lib/billing/http";
import { getDeliveryAreas, saveDeliveryAreas, removeDeliveryCity } from "@/lib/delivery/server";
import type { NeighborhoodEntry } from "@/lib/delivery/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export async function GET(req: NextRequest, { params }: { params: { restaurantId: string } }) {
  try {
    await authenticate(req);
    const cityCode = req.nextUrl.searchParams.get("cityCode") || "";
    if (!cityCode) return json(req, { error: "missing_code", message: "Informe o código da cidade." }, 400);

    const data = await getDeliveryAreas(params.restaurantId, cityCode);
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
    const cityName = String(body.cityName || "");
    const uf = String(body.uf || "");
    if (!cityCode || !cityName || !uf) {
      return json(req, { error: "missing_fields", message: "cityCode, cityName e uf são obrigatórios." }, 400);
    }

    const neighborhoods = (body.neighborhoods || {}) as Record<string, NeighborhoodEntry>;
    await saveDeliveryAreas(params.restaurantId, caller.uid, cityCode, { cityName, uf, neighborhoods });

    return json(req, { ok: true });
  } catch (error) {
    return errorResponse(req, "delivery areas save", error);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { restaurantId: string } }) {
  try {
    const caller = await authenticate(req);
    const cityCode = req.nextUrl.searchParams.get("cityCode") || "";
    if (!cityCode) return json(req, { error: "missing_code", message: "Informe o código da cidade." }, 400);

    await removeDeliveryCity(params.restaurantId, caller.uid, cityCode);
    return json(req, { ok: true });
  } catch (error) {
    return errorResponse(req, "delivery areas delete", error);
  }
}
