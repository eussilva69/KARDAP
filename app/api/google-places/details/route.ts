import type { NextRequest } from "next/server";
import { authenticate, errorResponse, json } from "@/lib/billing/http";
import { rateLimit } from "@/lib/sso/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_KEY = process.env.GOOGLE_PLACES_API_KEY || "";

export async function GET(req: NextRequest) {
  try {
    const caller = await authenticate(req);
    rateLimit(req, "places-details", 20, 60_000, caller.uid);

    const placeId = req.nextUrl.searchParams.get("placeId")?.trim();
    if (!placeId || placeId.length > 300) {
      throw Object.assign(new Error("Place ID inválido."), { status: 400, code: "invalid_place_id" });
    }
    if (!API_KEY) {
      throw Object.assign(new Error("Google Places não configurado."), { status: 503, code: "places_not_configured" });
    }

    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: {
        "X-Goog-Api-Key": API_KEY,
        "X-Goog-FieldMask": "id,displayName,formattedAddress,googleMapsUri,googleMapsLinks",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[google-places/details] Google API error:", res.status, text);
      throw Object.assign(new Error("Não foi possível obter os detalhes do estabelecimento."), { status: 502, code: "google_error" });
    }

    const place = await res.json();
    const reviewUrl = place.googleMapsLinks?.writeAReviewUri || place.googleMapsLinks?.reviewsUri || "";

    return json(req, {
      placeId: place.id,
      name: place.displayName?.text || "",
      address: place.formattedAddress || "",
      mapsUrl: place.googleMapsUri || "",
      reviewUrl,
    });
  } catch (error) {
    return errorResponse(req, "places-details", error);
  }
}
