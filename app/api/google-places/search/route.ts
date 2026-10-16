import type { NextRequest } from "next/server";
import { authenticate, errorResponse, json } from "@/lib/billing/http";
import { rateLimit } from "@/lib/sso/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_KEY = process.env.GOOGLE_PLACES_API_KEY || "";

export async function GET(req: NextRequest) {
  try {
    const caller = await authenticate(req);
    rateLimit(req, "places-search", 30, 60_000, caller.uid);

    const query = req.nextUrl.searchParams.get("q")?.trim();
    if (!query || query.length < 3) {
      return json(req, { results: [] });
    }
    if (!API_KEY) {
      throw Object.assign(new Error("Google Places não configurado."), { status: 503, code: "places_not_configured" });
    }

    const body: Record<string, unknown> = {
      textQuery: query,
      languageCode: "pt-BR",
      maxResultCount: 8,
      includedType: "restaurant",
    };

    const city = req.nextUrl.searchParams.get("city");
    if (city) {
      body.locationBias = {
        rectangle: undefined,
      };
    }

    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": API_KEY,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.addressComponents,places.types,places.googleMapsUri",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[google-places/search] Google API error:", res.status, text);
      throw Object.assign(new Error("Não foi possível pesquisar no Google Maps agora."), { status: 502, code: "google_error" });
    }

    const data = await res.json();
    const results = (data.places || []).map((p: any) => {
      const city = p.addressComponents?.find((c: any) => c.types?.includes("administrative_area_level_2"))?.longText;
      const state = p.addressComponents?.find((c: any) => c.types?.includes("administrative_area_level_1"))?.shortText;
      return {
        placeId: p.id,
        name: p.displayName?.text || "",
        address: p.formattedAddress || "",
        city: city || "",
        state: state || "",
        mapsUrl: p.googleMapsUri || "",
      };
    });

    return json(req, { results });
  } catch (error) {
    return errorResponse(req, "places-search", error);
  }
}
