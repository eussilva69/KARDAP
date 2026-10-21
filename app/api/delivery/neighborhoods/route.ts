import type { NextRequest } from "next/server";
import { authenticate, json, errorResponse, preflight, readJson } from "@/lib/billing/http";
import { rateLimit } from "@/lib/sso/server";
import { getCityNeighborhoods, registerNeighborhoodCandidate } from "@/lib/delivery/neighborhoods";

/**
 * GET /api/delivery/neighborhoods?ibgeCode=3509502 — bairros conhecidos do município (OpenStreetMap + IBGE).
 * `partial: true` indica cobertura incompleta; APIs externas nunca são consultadas pelo navegador.
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

export async function POST(req: NextRequest) {
  try {
    const caller = await authenticate(req);
    rateLimit(req, "delivery-neighborhood-candidate", 20, 60_000, caller.uid);
    const body = await readJson(req);
    const ibgeCode = String(body.ibgeCode || "");
    const name = String(body.name || "").trim();
    const cityName = String(body.cityName || "").trim();
    const uf = String(body.uf || "").trim().toUpperCase();
    if (!/^\d{7}$/.test(ibgeCode) || !name || !cityName || !/^[A-Z]{2}$/.test(uf)) return json(req, { error: "invalid_candidate", message: "Bairro ou município inválido." }, 400);
    await registerNeighborhoodCandidate({ ibgeCode, cityName, uf, name, source: "manual" });
    return json(req, { ok: true, status: "pending" }, 202);
  } catch (error) {
    return errorResponse(req, "neighborhood candidate", error);
  }
}
