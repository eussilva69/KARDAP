import type { NextRequest } from "next/server";
import { json, errorResponse, preflight } from "@/lib/billing/http";
import { rateLimit } from "@/lib/sso/server";
import { getCityNeighborhoods } from "@/lib/delivery/neighborhoods";

/**
 * GET /api/delivery/neighborhoods?ibgeCode=3509502 — bairros conhecidos do município (OpenStreetMap + IBGE).
 * `partial: true` = o OpenStreetMap não respondeu a tempo; o painel completa a lista consultando pelo navegador.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export async function GET(req: NextRequest) {
  try {
    rateLimit(req, "delivery-neighborhoods", 20, 60_000);
    const ibgeCode = req.nextUrl.searchParams.get("ibgeCode") || "";
    if (!/^\d{7}$/.test(ibgeCode)) {
      return json(req, { error: "invalid_code", message: "Código IBGE inválido." }, 400);
    }
    return json(req, await getCityNeighborhoods(ibgeCode));
  } catch (error) {
    return errorResponse(req, "neighborhood search", error);
  }
}
