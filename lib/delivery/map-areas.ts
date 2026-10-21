import type { DeliveryDistanceBand, DeliveryFeeResult, DeliveryMapArea, DeliveryMapConfig, GeoPoint } from "./types.ts";

const EARTH_RADIUS_KM = 6371.0088;
const radians = (degrees: number) => degrees * Math.PI / 180;

export function isGeoPoint(value: unknown): value is GeoPoint {
  if (!value || typeof value !== "object") return false;
  const point = value as Partial<GeoPoint>;
  return typeof point.lat === "number" && Number.isFinite(point.lat) && point.lat >= -90 && point.lat <= 90
    && typeof point.lng === "number" && Number.isFinite(point.lng) && point.lng >= -180 && point.lng <= 180;
}

export function haversineKm(from: GeoPoint, to: GeoPoint): number {
  const dLat = radians(to.lat - from.lat);
  const dLng = radians(to.lng - from.lng);
  const lat1 = radians(from.lat);
  const lat2 = radians(to.lat);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

type Candidate = { id: string; name: string; feeCents: number; distanceKm: number };

export function resolveMapDeliveryFee(config: DeliveryMapConfig, destination: GeoPoint, cityName = ""): DeliveryFeeResult {
  const candidates: Candidate[] = [];
  if (config.storeLocation && isGeoPoint(config.storeLocation)) {
    const distanceKm = haversineKm(config.storeLocation, destination);
    const band = config.distanceBands
      .filter((item) => item.enabled !== false)
      .slice()
      .sort((a, b) => a.maxDistanceKm - b.maxDistanceKm)
      .find((item) => distanceKm <= item.maxDistanceKm + 1e-9);
    if (band) candidates.push({ id: band.id, name: band.name, feeCents: band.feeCents, distanceKm });
  }
  for (const area of config.customAreas.filter((item) => item.enabled !== false)) {
    if (!isGeoPoint(area.center)) continue;
    const distanceKm = haversineKm(area.center, destination);
    if (distanceKm <= area.radiusKm + 1e-9) candidates.push({ id: area.id, name: area.name, feeCents: area.feeCents, distanceKm });
  }
  candidates.sort((a, b) => a.feeCents - b.feeCents || a.distanceKm - b.distanceKm || a.id.localeCompare(b.id));
  const selected = candidates[0];
  if (!selected) return { feeCents: 0, feeMode: "area_mapa", cityName, neighborhoodName: null, matched: false, reason: "Este endereço está fora da área de entrega do restaurante." };
  return { feeCents: selected.feeCents, feeMode: "area_mapa", cityName, neighborhoodName: null, matched: true, distanceKm: selected.distanceKm, mapAreaId: selected.id, mapAreaName: selected.name };
}

export function sanitizeMapConfig(input: unknown): DeliveryMapConfig {
  const raw = input && typeof input === "object" ? input as Partial<DeliveryMapConfig> : {};
  const point = isGeoPoint(raw.storeLocation) ? { lat: raw.storeLocation.lat, lng: raw.storeLocation.lng } : null;
  const bands = Array.isArray(raw.distanceBands) ? raw.distanceBands : [];
  const custom = Array.isArray(raw.customAreas) ? raw.customAreas : [];
  const ids = new Set<string>();
  const distanceBands: DeliveryDistanceBand[] = bands.slice(0, 20).flatMap((item) => {
    const id = typeof item?.id === "string" ? item.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 50) : "";
    const maxDistanceKm = Number(item?.maxDistanceKm);
    const feeCents = Number(item?.feeCents);
    if (!id || ids.has(id) || !Number.isFinite(maxDistanceKm) || maxDistanceKm <= 0 || maxDistanceKm > 200 || !Number.isSafeInteger(feeCents) || feeCents < 0 || feeCents > 10_000_000) return [];
    ids.add(id);
    return [{ id, name: String(item?.name || `Até ${maxDistanceKm} km`).trim().slice(0, 80), maxDistanceKm, feeCents, enabled: item?.enabled !== false }];
  }).sort((a, b) => a.maxDistanceKm - b.maxDistanceKm);
  const customAreas: DeliveryMapArea[] = custom.slice(0, 50).flatMap((item) => {
    const id = typeof item?.id === "string" ? item.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 50) : "";
    const radiusKm = Number(item?.radiusKm);
    const feeCents = Number(item?.feeCents);
    if (!id || ids.has(id) || !isGeoPoint(item?.center) || !Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 200 || !Number.isSafeInteger(feeCents) || feeCents < 0 || feeCents > 10_000_000) return [];
    ids.add(id);
    const color = /^#[0-9a-f]{6}$/i.test(String(item?.color || "")) ? String(item.color) : "#2563eb";
    return [{ id, name: String(item?.name || "Área personalizada").trim().slice(0, 80), center: { lat: item.center.lat, lng: item.center.lng }, radiusKm, feeCents, enabled: item?.enabled !== false, color }];
  });
  return { storeLocation: point, storePlaceId: typeof raw.storePlaceId === "string" ? raw.storePlaceId.slice(0, 300) : undefined, distanceBands, customAreas };
}
