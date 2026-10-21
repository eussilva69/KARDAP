/** Catálogo geográfico global, compartilhado e escrito exclusivamente pelo backend. */
import { randomUUID } from "crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { BillingError } from "@/lib/billing/server";
import { fetchIbgeDistricts, loadIbgeCities, type IbgeCity } from "./ibge";
import { neighborhoodKey } from "./match";
import { fetchOsmNeighborhoods, mergeNeighborhoods, type NeighborhoodSource, type SourcedNeighborhood } from "./osm";
import { slugifyNeighborhood } from "./types";
import { candidateTrust, decideGlobalCityImport } from "./global-cities-model";

export const GLOBAL_CITY_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const IMPORT_LEASE_MS = 45_000;
const SERVER_OSM_TIMEOUT_MS = 8_000;
const memory = new Map<string, { value: CityNeighborhoods; expiry: number }>();

export type GlobalCityStatus = "pending" | "importing" | "ready" | "failed";
export type CityNeighborhoods = {
  cityName: string;
  uf: string;
  list: SourcedNeighborhood[];
  partial: boolean;
  status: GlobalCityStatus;
  stale?: boolean;
  reused?: boolean;
};

type GlobalNeighborhood = SourcedNeighborhood & {
  normalizedName: string;
  active: boolean;
  status: "verified" | "pending";
};

const millis = (value: unknown) => value instanceof Timestamp ? value.toMillis() : typeof value === "number" ? value : 0;

export function globalNeighborhoodId(name: string): string {
  return slugifyNeighborhood(name).slice(0, 120);
}

export function toGlobalNeighborhood(item: SourcedNeighborhood, verified = item.source === "osm" || item.source === "ibge"): GlobalNeighborhood | null {
  const name = item.name.replace(/\s+/g, " ").trim().slice(0, 100);
  const normalizedName = neighborhoodKey(name);
  if (!name || !normalizedName || !globalNeighborhoodId(name)) return null;
  return { name, source: item.source, normalizedName, ...(verified ? { active: true, status: "verified" as const } : candidateTrust("manual")) };
}

async function cityByCode(ibgeCode: string): Promise<IbgeCity> {
  const city = (await loadIbgeCities()).find((item) => item.ibgeCode === ibgeCode);
  if (!city) throw new BillingError("city_not_found", 404, "Município não encontrado no IBGE.");
  return city;
}

async function readGlobal(city: IbgeCity): Promise<CityNeighborhoods | null> {
  const db = adminDb();
  const cityRef = db.collection("global_cities").doc(city.ibgeCode);
  const citySnap = await cityRef.get();
  if (!citySnap.exists) return null;
  const neighborhoodSnap = await cityRef.collection("neighborhoods").get();
  const list = neighborhoodSnap.docs
    .map((doc) => doc.data() as GlobalNeighborhood)
    .filter((item) => item.active !== false && item.status === "verified" && item.name)
    .map(({ name, source }) => ({ name, source }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const status = (citySnap.get("status") || "pending") as GlobalCityStatus;
  const stale = millis(citySnap.get("expiresAt")) <= Date.now();
  return { cityName: String(citySnap.get("name") || city.name), uf: String(citySnap.get("state") || city.uf), list, partial: citySnap.get("partial") === true, status, stale, reused: true };
}

type Claim = { owned: boolean; token: string; fresh: boolean };

async function claimImport(city: IbgeCity, force = false): Promise<Claim> {
  const db = adminDb();
  const ref = db.collection("global_cities").doc(city.ibgeCode);
  const token = randomUUID();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const decision = decideGlobalCityImport({ exists: snap.exists, status: snap.get("status"), expiresAt: millis(snap.get("expiresAt")), leaseUntil: millis(snap.get("importLeaseUntil")) }, now, force);
    if (decision === "reuse") return { owned: false, token, fresh: true };
    if (decision === "wait") return { owned: false, token, fresh: false };
    tx.set(ref, {
      name: city.name,
      state: city.uf,
      ibgeCode: city.ibgeCode,
      status: "importing",
      importToken: token,
      importLeaseUntil: Timestamp.fromMillis(now + IMPORT_LEASE_MS),
      importAttempts: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
      ...(snap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true });
    return { owned: true, token, fresh: false };
  });
}

async function persistImport(city: IbgeCity, token: string, list: SourcedNeighborhood[], partial: boolean) {
  const db = adminDb();
  const cityRef = db.collection("global_cities").doc(city.ibgeCode);
  const safe = list.map((item) => toGlobalNeighborhood(item)).filter((item): item is GlobalNeighborhood => Boolean(item));
  for (let index = 0; index < safe.length; index += 400) {
    const batch = db.batch();
    safe.slice(index, index + 400).forEach((item) => {
      batch.set(cityRef.collection("neighborhoods").doc(globalNeighborhoodId(item.name)), {
        ...item,
        sources: FieldValue.arrayUnion(item.source),
        lastSeenAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    await batch.commit();
  }
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(cityRef);
    if (snap.get("importToken") !== token) return;
    tx.set(cityRef, {
      status: "ready",
      partial,
      neighborhoodCount: safe.length,
      source: partial ? ["ibge"] : ["osm", "ibge"],
      lastSyncedAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + GLOBAL_CITY_TTL_MS),
      importLeaseUntil: FieldValue.delete(),
      importToken: FieldValue.delete(),
      lastError: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

async function markFailed(city: IbgeCity, token: string, error: unknown) {
  const ref = adminDb().collection("global_cities").doc(city.ibgeCode);
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.get("importToken") !== token) return;
    tx.set(ref, { status: "failed", lastError: error instanceof Error ? error.message.slice(0, 300) : "import_failed", importLeaseUntil: FieldValue.delete(), importToken: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }).catch(() => undefined);
}

async function migrateLegacy(city: IbgeCity): Promise<boolean> {
  const legacy = await adminDb().collection("geo_cache").doc(`bairros_${city.ibgeCode}`).get().catch(() => null);
  if (!legacy?.exists) return false;
  const list = (legacy.get("list") || []) as SourcedNeighborhood[];
  if (!list.length) return false;
  const claim = await claimImport(city, true);
  if (!claim.owned) return false;
  await persistImport(city, claim.token, list, legacy.get("partial") === true);
  return true;
}

async function importCity(city: IbgeCity, force = false): Promise<CityNeighborhoods> {
  const claim = await claimImport(city, force);
  if (claim.fresh) return (await readGlobal(city))!;
  if (!claim.owned) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500 + attempt * 250));
      const current = await readGlobal(city);
      if (current?.status === "ready") return current;
    }
    return { cityName: city.name, uf: city.uf, list: [], partial: true, status: "importing", reused: true };
  }
  try {
    const [osm, ibge] = await Promise.all([fetchOsmNeighborhoods(city.ibgeCode, SERVER_OSM_TIMEOUT_MS), fetchIbgeDistricts(city.ibgeCode).catch(() => [])]);
    const list = mergeNeighborhoods(city.name, [{ names: osm || [], source: "osm" }, { names: ibge, source: "ibge" }]);
    await persistImport(city, claim.token, list, osm === null);
    const value: CityNeighborhoods = { cityName: city.name, uf: city.uf, list, partial: osm === null, status: "ready" };
    memory.set(city.ibgeCode, { value, expiry: Date.now() + GLOBAL_CITY_TTL_MS });
    return value;
  } catch (error) {
    await markFailed(city, claim.token, error);
    throw error;
  }
}

export async function getCityNeighborhoods(ibgeCode: string): Promise<CityNeighborhoods> {
  const city = await cityByCode(ibgeCode);
  const hit = memory.get(ibgeCode);
  if (hit && hit.expiry > Date.now()) return { ...hit.value, reused: true };
  let global = await readGlobal(city);
  if (!global && await migrateLegacy(city)) global = await readGlobal(city);
  if (global?.list.length && (global.status === "ready" || global.status === "importing")) {
    memory.set(ibgeCode, { value: global, expiry: global.stale ? Date.now() + 60_000 : Date.now() + GLOBAL_CITY_TTL_MS });
    if (global.stale) void importCity(city).catch(() => undefined);
    return global;
  }
  return importCity(city);
}

/** Registra descoberta sem publicar automaticamente quando a única confirmação é Google/manual. */
export async function registerNeighborhoodCandidate(input: { ibgeCode: string; cityName: string; uf: string; name: string; source: NeighborhoodSource | "google" }) {
  if (!/^\d{7}$/.test(input.ibgeCode)) return;
  const canonicalCity = await cityByCode(input.ibgeCode).catch(() => null);
  if (!canonicalCity) return;
  const candidate = toGlobalNeighborhood({ name: input.name, source: input.source === "google" ? "manual" : input.source }, input.source === "osm" || input.source === "ibge");
  if (!candidate) return;
  const db = adminDb();
  const cityRef = db.collection("global_cities").doc(input.ibgeCode);
  const neighborhoodRef = cityRef.collection("neighborhoods").doc(globalNeighborhoodId(candidate.name));
  await db.runTransaction(async (tx) => {
    const [citySnap, neighborhoodSnap] = await Promise.all([tx.get(cityRef), tx.get(neighborhoodRef)]);
    tx.set(cityRef, {
      name: canonicalCity.name,
      state: canonicalCity.uf,
      ibgeCode: input.ibgeCode,
      ...(citySnap.exists ? {} : { status: "pending", createdAt: FieldValue.serverTimestamp() }),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.set(neighborhoodRef, {
      ...candidate,
      source: input.source,
      sources: FieldValue.arrayUnion(input.source),
      lastSeenAt: FieldValue.serverTimestamp(),
      ...(neighborhoodSnap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true });
  });
}
