/**
 * Leitura server-side dos overrides do catálogo (coleção `catalogoPlanos`). Cache em memória por 30 segundos para
 * reduzir leituras repetidas durante uma mesma requisição; invalidado pelo admin quando grava uma mudança.
 */
import { adminDb } from "@/lib/firebase-admin";
import { PLAN_ORDER, type PlanId } from "./plans";
import { resolveCatalog, sanitizeOverride, type PlanOverride, type ResolvedCatalog } from "./catalog-db";

const CACHE_MS = 30_000;
let cache: { until: number; data: Partial<Record<PlanId, PlanOverride>> } | null = null;

export function invalidateCatalogCache() {
  cache = null;
}

/** Lê os overrides do catálogo. Em caso de falha, devolve `{}` (o `PLAN_CATALOG` cobre) e segue — a página pública nunca cai por causa do admin. */
export async function loadCatalogOverrides(): Promise<Partial<Record<PlanId, PlanOverride>>> {
  if (cache && cache.until > Date.now()) return cache.data;
  try {
    const snap = await adminDb().collection("catalogoPlanos").get();
    const map: Partial<Record<PlanId, PlanOverride>> = {};
    for (const doc of snap.docs) {
      const id = doc.id as PlanId;
      if (PLAN_ORDER.indexOf(id) < 0) continue;
      map[id] = sanitizeOverride(doc.data());
    }
    cache = { until: Date.now() + CACHE_MS, data: map };
    return map;
  } catch (error) {
    console.error("[catalog] falha ao ler catalogoPlanos:", (error as { message?: string })?.message || error);
    return {};
  }
}

export async function loadResolvedCatalog(): Promise<ResolvedCatalog> {
  const overrides = await loadCatalogOverrides();
  return resolveCatalog(overrides);
}
