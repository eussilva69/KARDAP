import type { NextRequest } from "next/server";
import { json, errorResponse, preflight } from "@/lib/billing/http";
import { rateLimit } from "@/lib/sso/server";
import { getDeliveryConfig } from "@/lib/delivery/server";
import { autocomplete, cityCenter, geocodeCep, isGoogleConfigured, placeAddress, type ParsedAddress } from "@/lib/delivery/geo";

/**
 * Endereço no checkout do delivery (público). A chave do Google fica no servidor; o navegador só vê o resultado.
 *   ?restaurantId=…&q=rua…&session=…        sugestões do Google (Brasil, viés para a cidade do restaurante)
 *   ?restaurantId=…&placeId=…&session=…     endereço da sugestão escolhida (rua, número, bairro, cidade, UF, CEP)
 *   ?restaurantId=…&cep=00000000            endereço do CEP (ViaCEP; Google completa o bairro quando falta)
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

type RestaurantGeo = { enabled: boolean; bias: { lat: number; lng: number; radiusM: number } | null; expiry: number };
const restaurants = new Map<string, RestaurantGeo>();

async function restaurantGeo(restaurantId: string): Promise<RestaurantGeo> {
  const hit = restaurants.get(restaurantId);
  if (hit && hit.expiry > Date.now()) return hit;
  const config = await getDeliveryConfig(restaurantId);
  const city = (config.servedCities || []).find((c) => c.enabled !== false);
  const center = config.enabled && city && isGoogleConfigured() ? await cityCenter(city.name, city.uf, city.placeId).catch(() => null) : null;
  const value: RestaurantGeo = { enabled: config.enabled, bias: center ? { ...center, radiusM: 30000 } : null, expiry: Date.now() + 5 * 60 * 1000 };
  if (restaurants.size > 1000) restaurants.clear();
  restaurants.set(restaurantId, value);
  return value;
}

const publicAddress = ({ location: _location, ...rest }: ParsedAddress) => rest;

async function viaCep(digits: string): Promise<ParsedAddress | null> {
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.erro || !data.localidade) return null;
    return {
      street: data.logradouro || "",
      number: "",
      district: data.bairro || "",
      city: data.localidade || "",
      uf: data.uf || "",
      cep: `${digits.slice(0, 5)}-${digits.slice(5)}`,
      ibgeCode: /^\d{7}$/.test(String(data.ibge || "")) ? String(data.ibge) : undefined,
      formatted: "",
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    rateLimit(req, "delivery-address", 120, 60_000);
    const params = req.nextUrl.searchParams;
    const restaurantId = (params.get("restaurantId") || "").slice(0, 128);
    if (!restaurantId) return json(req, { error: "missing_restaurant", message: "Informe o restaurante." }, 400);
    const geo = await restaurantGeo(restaurantId);
    if (!geo.enabled) return json(req, { error: "delivery_disabled", message: "Este restaurante não está aceitando pedidos de delivery." }, 403);
    const session = (params.get("session") || "").slice(0, 100) || undefined;

    const cep = (params.get("cep") || "").replace(/\D/g, "");
    if (cep) {
      if (cep.length !== 8) return json(req, { error: "invalid_cep", message: "CEP inválido." }, 400);
      let address = await viaCep(cep);
      if ((!address || !address.district) && isGoogleConfigured()) {
        const google = await geocodeCep(cep).catch(() => null);
        if (google) address = address ? { ...address, district: address.district || google.district, street: address.street || google.street } : google;
      }
      if (!address) return json(req, { error: "cep_not_found", message: "CEP não encontrado. Confira os números ou preencha o endereço." }, 404);
      return json(req, publicAddress(address));
    }

    if (!isGoogleConfigured()) return json(req, { error: "places_not_configured", message: "Busca de endereço indisponível. Preencha pelo CEP." }, 503);

    const placeId = (params.get("placeId") || "").trim();
    if (placeId) {
      if (placeId.length > 300) return json(req, { error: "invalid_place", message: "Endereço inválido." }, 400);
      return json(req, publicAddress(await placeAddress(placeId, session)));
    }

    const q = (params.get("q") || "").trim().slice(0, 160);
    if (q.length < 3) return json(req, { suggestions: [] });
    const suggestions = await autocomplete({ input: q, kind: "address", sessionToken: session, bias: geo.bias });
    return json(req, { suggestions });
  } catch (error) {
    return errorResponse(req, "delivery address", error);
  }
}
