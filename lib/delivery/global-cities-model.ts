import { neighborhoodKey } from "./match.ts";
import { slugifyNeighborhood, type NeighborhoodEntry } from "./types.ts";

export type ImportState = { exists: boolean; status?: "pending" | "importing" | "ready" | "failed"; expiresAt?: number; leaseUntil?: number };
export type ImportDecision = "reuse" | "wait" | "import";

export function decideGlobalCityImport(state: ImportState, now: number, force = false): ImportDecision {
  if (!force && state.exists && state.status === "ready" && (state.expiresAt || 0) > now) return "reuse";
  if (state.exists && state.status === "importing" && (state.leaseUntil || 0) > now) return "wait";
  return "import";
}
export function candidateTrust(source: "osm" | "ibge" | "manual" | "google") {
  const verified = source === "osm" || source === "ibge";
  return { active: verified, status: verified ? "verified" as const : "pending" as const };
}

/** Acrescenta catálogo global sem alterar taxa/estado local e deixa novidades desativadas. */
export function mergeGlobalIntoRestaurant(rows: Record<string, NeighborhoodEntry>, names: string[]) {
  const keys = new Set(Object.values(rows).map((item) => neighborhoodKey(item.name)));
  const next = { ...rows };
  let added = 0;
  for (const raw of names) {
    const name = raw.replace(/\s+/g, " ").trim().slice(0, 100);
    const normalized = neighborhoodKey(name);
    const slug = slugifyNeighborhood(name);
    if (!normalized || !slug || keys.has(normalized) || next[slug]) continue;
    keys.add(normalized);
    next[slug] = { name, feeCents: null, enabled: false };
    added += 1;
  }
  return { rows: next, added };
}
