/**
 * Google Maps Platform (somente servidor): Places API (New) para autocomplete e detalhes, Geocoding API para CEP e
 * bairro por coordenada. A chave fica em GOOGLE_MAPS_API_KEY (ou GOOGLE_PLACES_API_KEY) e nunca vai ao navegador.
 *
 * Cache: só em memória e por pouco tempo (autocomplete 10 min, endereços 1 h, centro de cidade 24 h), dentro do
 * permitido pelos termos do Google. O único dado do Google persistido é o Place ID, que pode ser guardado sem prazo.
 */
import { BillingError } from "@/lib/billing/server";
import { findIbgeCity, toUf } from "./ibge";

const API_KEY = () => process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY || "";

export const isGoogleConfigured = () => Boolean(API_KEY());

const geoError = (message: string, status: number, code: string) => new BillingError(code, status, message);

// ───────────────────────── Cache em memória com prazo ─────────────────────────

class TtlCache<T> {
  private map = new Map<string, { value: T; expiry: number }>();
  constructor(private ttlMs: number, private max = 2000) {}
  get(key: string): T | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expiry < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.value;
  }
  set(key: string, value: T) {
    if (this.map.size >= this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { value, expiry: Date.now() + this.ttlMs });
  }
}

const MIN = 60 * 1000;
const suggestionCache = new TtlCache<PlaceSuggestion[]>(10 * MIN);
const addressCache = new TtlCache<ParsedAddress>(60 * MIN);
const centerCache = new TtlCache<{ lat: number; lng: number }>(24 * 60 * MIN, 500);

// ───────────────────────── Tipos ─────────────────────────

export type PlaceSuggestion = { placeId: string; main: string; secondary: string; text: string };

export type ParsedAddress = {
  placeId?: string;
  street: string;
  number: string;
  district: string;
  city: string;
  uf: string;
  cep: string;
  ibgeCode?: string;
  formatted: string;
  /** Coordenada só para cálculo imediato (nunca persistida). */
  location?: { lat: number; lng: number };
};

type Component = { long: string; short: string; types: string[] };

// ───────────────────────── Places API (New) ─────────────────────────

const CITY_TYPES = ["(cities)"];
const ADDRESS_TYPES = ["street_address", "route", "premise", "subpremise", "postal_code"];

export async function autocomplete(opts: {
  input: string;
  kind: "city" | "address";
  sessionToken?: string;
  bias?: { lat: number; lng: number; radiusM: number } | null;
}): Promise<PlaceSuggestion[]> {
  const key = API_KEY();
  if (!key) throw geoError("Busca de endereços indisponível no momento.", 503, "places_not_configured");
  const input = opts.input.trim().slice(0, 200);
  const cacheKey = `${opts.kind}|${opts.bias ? `${opts.bias.lat.toFixed(2)},${opts.bias.lng.toFixed(2)}` : ""}|${input.toLowerCase()}`;
  const cached = suggestionCache.get(cacheKey);
  if (cached) return cached;

  const body: Record<string, unknown> = {
    input,
    languageCode: "pt-BR",
    regionCode: "br",
    includedRegionCodes: ["br"],
    includedPrimaryTypes: opts.kind === "city" ? CITY_TYPES : ADDRESS_TYPES,
  };
  if (opts.sessionToken) body.sessionToken = opts.sessionToken;
  if (opts.bias) body.locationBias = { circle: { center: { latitude: opts.bias.lat, longitude: opts.bias.lng }, radius: opts.bias.radiusM } };

  const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) {
    console.error("[geo/autocomplete] Google", res.status, await res.text().catch(() => ""));
    throw geoError("Não foi possível buscar sugestões agora. Digite o endereço manualmente.", 502, "google_error");
  }
  const data = (await res.json()) as { suggestions?: { placePrediction?: { placeId: string; text?: { text?: string }; structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } } } }[] };
  const list: PlaceSuggestion[] = (data.suggestions || [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => Boolean(p?.placeId))
    .map((p) => ({
      placeId: p.placeId,
      main: p.structuredFormat?.mainText?.text || p.text?.text || "",
      secondary: p.structuredFormat?.secondaryText?.text || "",
      text: p.text?.text || "",
    }));
  suggestionCache.set(cacheKey, list);
  return list;
}

function fromPlaces(components: { longText?: string; shortText?: string; types?: string[] }[] = []): Component[] {
  return components.map((c) => ({ long: c.longText || "", short: c.shortText || "", types: c.types || [] }));
}

function fromGeocoding(components: { long_name?: string; short_name?: string; types?: string[] }[] = []): Component[] {
  return components.map((c) => ({ long: c.long_name || "", short: c.short_name || "", types: c.types || [] }));
}

const pick = (components: Component[], ...types: string[]) => {
  for (const type of types) {
    const found = components.find((c) => c.types.includes(type));
    if (found) return found;
  }
  return undefined;
};

function parseComponents(components: Component[]): Omit<ParsedAddress, "formatted" | "placeId"> {
  const cepRaw = pick(components, "postal_code")?.long || "";
  const cepDigits = cepRaw.replace(/\D/g, "");
  return {
    street: pick(components, "route")?.long || "",
    number: pick(components, "street_number")?.long || "",
    district: pick(components, "sublocality_level_1", "sublocality", "neighborhood", "administrative_area_level_4")?.long || "",
    city: pick(components, "administrative_area_level_2", "locality")?.long || "",
    uf: toUf(pick(components, "administrative_area_level_1")?.short || pick(components, "administrative_area_level_1")?.long || ""),
    cep: cepDigits.length === 8 ? `${cepDigits.slice(0, 5)}-${cepDigits.slice(5)}` : "",
  };
}

async function withIbge(address: ParsedAddress): Promise<ParsedAddress> {
  if (!address.city || !address.uf) return address;
  const ibge = await findIbgeCity(address.city, address.uf).catch(() => null);
  return ibge ? { ...address, city: ibge.name, ibgeCode: ibge.ibgeCode } : address;
}

/** Endereço completo de um Place ID (encerra a sessão de autocomplete quando o token é enviado). */
export async function placeAddress(placeId: string, sessionToken?: string): Promise<ParsedAddress> {
  const key = API_KEY();
  if (!key) throw geoError("Busca de endereços indisponível no momento.", 503, "places_not_configured");
  const cached = addressCache.get(placeId);
  if (cached) return cached;

  const params = new URLSearchParams({ languageCode: "pt-BR", regionCode: "br" });
  if (sessionToken) params.set("sessionToken", sessionToken);
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?${params}`, {
    headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "id,formattedAddress,addressComponents,location" },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) {
    console.error("[geo/place] Google", res.status, await res.text().catch(() => ""));
    throw geoError("Não foi possível carregar este endereço. Tente outra sugestão.", 502, "google_error");
  }
  const place = (await res.json()) as { id: string; formattedAddress?: string; addressComponents?: { longText?: string; shortText?: string; types?: string[] }[]; location?: { latitude: number; longitude: number } };
  let address: ParsedAddress = {
    placeId: place.id,
    formatted: place.formattedAddress || "",
    ...parseComponents(fromPlaces(place.addressComponents)),
    location: place.location ? { lat: place.location.latitude, lng: place.location.longitude } : undefined,
  };

  // Ruas longas às vezes vêm sem bairro: a coordenada resolve pelo Geocoding (bairro mais próximo do ponto).
  if ((!address.district || !address.cep) && address.location) {
    const reverse = await reverseGeocode(address.location.lat, address.location.lng).catch(() => null);
    if (reverse) address = { ...address, district: address.district || reverse.district, cep: address.cep || reverse.cep };
  }
  address = await withIbge(address);
  addressCache.set(placeId, address);
  return address;
}

// ───────────────────────── Geocoding API ─────────────────────────

async function geocodeRequest(params: Record<string, string>): Promise<{ components: Component[]; formatted: string; location?: { lat: number; lng: number }; placeId?: string } | null> {
  const key = API_KEY();
  if (!key) return null;
  const search = new URLSearchParams({ ...params, language: "pt-BR", region: "br", key });
  const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${search}`, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) return null;
  const data = (await res.json()) as { status: string; error_message?: string; results?: { address_components?: { long_name?: string; short_name?: string; types?: string[] }[]; formatted_address?: string; place_id?: string; geometry?: { location?: { lat: number; lng: number } } }[] };
  if (data.status !== "OK" || !data.results?.length) {
    if (data.status !== "ZERO_RESULTS") console.error("[geo/geocode]", data.status, data.error_message || "");
    return null;
  }
  const first = data.results[0];
  return { components: fromGeocoding(first.address_components), formatted: first.formatted_address || "", location: first.geometry?.location, placeId: first.place_id };
}

export async function reverseGeocode(lat: number, lng: number): Promise<ParsedAddress | null> {
  const result = await geocodeRequest({ latlng: `${lat},${lng}`, result_type: "sublocality|neighborhood|street_address|route" });
  if (!result) return null;
  return { formatted: result.formatted, ...parseComponents(result.components) };
}

/** CEP pelo Geocoding do Google (usado quando o ViaCEP não tem o CEP ou não informa o bairro). */
export async function geocodeCep(cep: string): Promise<ParsedAddress | null> {
  const digits = cep.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  const cacheKey = `cep:${digits}`;
  const cached = addressCache.get(cacheKey);
  if (cached) return cached;
  const result = await geocodeRequest({ components: `country:BR|postal_code:${digits.slice(0, 5)}-${digits.slice(5)}` });
  if (!result) return null;
  let address: ParsedAddress = { formatted: result.formatted, ...parseComponents(result.components), cep: `${digits.slice(0, 5)}-${digits.slice(5)}`, location: result.location };
  if (!address.district && result.location) {
    const reverse = await reverseGeocode(result.location.lat, result.location.lng).catch(() => null);
    if (reverse?.district) address = { ...address, district: reverse.district };
  }
  address = await withIbge(address);
  addressCache.set(cacheKey, address);
  return address;
}

/** Geocodifica um endereço completo no servidor. O resultado fica apenas no cache curto em memória. */
export async function geocodeAddress(address: string): Promise<ParsedAddress | null> {
  const normalized = address.replace(/\s+/g, " ").trim().slice(0, 500);
  if (normalized.length < 6) return null;
  const cacheKey = `address:${normalized.toLowerCase()}`;
  const cached = addressCache.get(cacheKey);
  if (cached) return cached;
  const result = await geocodeRequest({ address: normalized, components: "country:BR" });
  if (!result?.location) return null;
  const parsed = await withIbge({ formatted: result.formatted, ...parseComponents(result.components), location: result.location, placeId: result.placeId });
  addressCache.set(cacheKey, parsed);
  return parsed;
}

/** Centro aproximado da cidade (viés das sugestões de endereço para a região do restaurante). */
export async function cityCenter(name: string, uf: string, placeId?: string): Promise<{ lat: number; lng: number } | null> {
  const cacheKey = `${name}|${uf}`.toLowerCase();
  const cached = centerCache.get(cacheKey);
  if (cached !== undefined) return cached;
  let center = placeId ? (await placeAddress(placeId).catch(() => null))?.location || null : null;
  if (!center) center = (await geocodeRequest({ address: `${name}, ${uf}, Brasil`, components: "country:BR" }).catch(() => null))?.location || null;
  // Falha (API recusou ou fora do ar) não entra no cache: a próxima busca tenta de novo.
  if (center) centerCache.set(cacheKey, center);
  return center;
}

// ───────────────────────── Cidades (painel) ─────────────────────────

export type CitySuggestion = { placeId: string; name: string; uf: string; ibgeCode: string | null };

/** Sugestões de cidade do Google já ligadas ao município do IBGE (UF lida do texto secundário: "SP, Brasil"). */
export async function citySuggestions(input: string, sessionToken?: string): Promise<CitySuggestion[]> {
  const list = await autocomplete({ input, kind: "city", sessionToken });
  const resolved = await Promise.all(
    list.map(async (s) => {
      const parts = s.secondary.split(",").map((p) => p.trim()).filter(Boolean);
      const uf = parts.map(toUf).find(Boolean) || "";
      const ibge = uf ? await findIbgeCity(s.main, uf).catch(() => null) : null;
      return { placeId: s.placeId, name: ibge?.name || s.main, uf, ibgeCode: ibge?.ibgeCode || null };
    }),
  );
  return resolved;
}

/** Cidade de um Place ID (quando o texto da sugestão não bastou para achar o município). */
export async function cityFromPlace(placeId: string, sessionToken?: string): Promise<CitySuggestion | null> {
  const address = await placeAddress(placeId, sessionToken);
  if (!address.city || !address.uf) return null;
  return { placeId, name: address.city, uf: address.uf, ibgeCode: address.ibgeCode || null };
}
