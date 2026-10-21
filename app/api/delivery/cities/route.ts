import type { NextRequest } from "next/server";
import { json, errorResponse, preflight } from "@/lib/billing/http";
import { rateLimit } from "@/lib/sso/server";
import { searchIbgeCities } from "@/lib/delivery/ibge";
import { cityFromPlace, citySuggestions, isGoogleConfigured } from "@/lib/delivery/geo";

/**
 * GET /api/delivery/cities?q=campi&session=… — cidades para o painel "Áreas de entrega".
 * Google Places Autocomplete (cidades do Brasil) ligado ao município do IBGE; sem Google, busca direto no IBGE.
 * GET /api/delivery/cities?placeId=…&session=… — resolve a cidade de uma sugestão sem município identificado.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export async function GET(req: NextRequest) {
  try {
    rateLimit(req, "delivery-cities", 60, 60_000);
    const params = req.nextUrl.searchParams;
    const session = (params.get("session") || "").slice(0, 100) || undefined;

    const placeId = (params.get("placeId") || "").trim();
    if (placeId) {
      if (placeId.length > 300) return json(req, { error: "invalid_place", message: "Cidade inválida." }, 400);
      const city = await cityFromPlace(placeId, session);
      if (!city?.ibgeCode) return json(req, { error: "city_not_found", message: "Não encontramos esta cidade no IBGE." }, 404);
      return json(req, city);
    }

    const q = (params.get("q") || "").trim().slice(0, 80);
    if (q.length < 2) return json(req, []);

    if (isGoogleConfigured()) {
      try {
        const results = await citySuggestions(q, session);
        // Sugestões que não são municípios brasileiros (bairros, distritos) ficam de fora.
        const seen = new Set<string>();
        return json(
          req,
          results.filter((c) => c.ibgeCode && !seen.has(c.ibgeCode) && seen.add(c.ibgeCode)).map((c) => ({ ibgeCode: c.ibgeCode, name: c.name, uf: c.uf, placeId: c.placeId })),
        );
      } catch (error) {
        console.error("[delivery/cities] Google indisponível, usando IBGE:", (error as Error).message);
      }
    }

    const results = await searchIbgeCities(q);
    return json(req, results);
  } catch (error) {
    return errorResponse(req, "city search", error);
  }
}
