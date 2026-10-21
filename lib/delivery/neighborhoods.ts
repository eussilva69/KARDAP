/**
 * Lista de bairros de um município (servidor). O Google não lista bairros de uma cidade, então a lista vem de fontes
 * abertas: OpenStreetMap (limites e lugares de bairro) + IBGE (distritos e subdistritos).
 * Lista completa fica em `geo_cache/bairros_{ibge}` por 30 dias. Sem resposta do OSM a tempo, devolve só o IBGE com
 * `partial: true` e o painel completa consultando o OSM pelo navegador.
 */
import { adminDb } from "@/lib/firebase-admin";
import { BillingError } from "@/lib/billing/server";
import { fetchIbgeDistricts, loadIbgeCities } from "./ibge";
import { fetchOsmNeighborhoods, mergeNeighborhoods, type SourcedNeighborhood } from "./osm";

const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SERVER_OSM_TIMEOUT_MS = 8000;
const memory = new Map<string, { list: SourcedNeighborhood[]; expiry: number }>();

export type CityNeighborhoods = { cityName: string; uf: string; list: SourcedNeighborhood[]; partial: boolean };

export async function getCityNeighborhoods(ibgeCode: string): Promise<CityNeighborhoods> {
  const city = (await loadIbgeCities()).find((c) => c.ibgeCode === ibgeCode);
  if (!city) throw new BillingError("city_not_found", 404, "Município não encontrado no IBGE.");
  const base = { cityName: city.name, uf: city.uf };

  const hit = memory.get(ibgeCode);
  if (hit && hit.expiry > Date.now()) return { ...base, list: hit.list, partial: false };

  const cacheRef = adminDb().collection("geo_cache").doc(`bairros_${ibgeCode}`);
  const cached = await cacheRef.get().catch(() => null);
  if (cached?.exists && Number(cached.get("expiresAt")) > Date.now()) {
    const list = (cached.get("list") || []) as SourcedNeighborhood[];
    memory.set(ibgeCode, { list, expiry: Number(cached.get("expiresAt")) });
    return { ...base, list, partial: false };
  }

  const [osm, ibge] = await Promise.all([fetchOsmNeighborhoods(ibgeCode, SERVER_OSM_TIMEOUT_MS), fetchIbgeDistricts(ibgeCode).catch(() => [] as string[])]);
  const list = mergeNeighborhoods(city.name, [
    { names: osm || [], source: "osm" },
    { names: ibge, source: "ibge" },
  ]);

  if (osm === null) return { ...base, list, partial: true };

  const expiresAt = Date.now() + TTL_MS;
  memory.set(ibgeCode, { list, expiry: expiresAt });
  await cacheRef.set({ ibgeCode, cityName: city.name, uf: city.uf, list, fetchedAt: new Date().toISOString(), expiresAt }).catch(() => {});
  return { ...base, list, partial: false };
}
