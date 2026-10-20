import type { NextRequest } from "next/server";
import { json, errorResponse, preflight } from "@/lib/billing/http";
import { normalizeCity } from "@/lib/delivery/types";

type IbgeCity = { id: number; nome: string; microrregiao: { mesorregiao: { UF: { sigla: string } } } };
type CityResult = { ibgeCode: string; name: string; uf: string };

let cachedCities: CityResult[] | null = null;
let cacheExpiry = 0;
const CACHE_TTL = 24 * 60 * 60 * 1000;

async function loadCities(): Promise<CityResult[]> {
  if (cachedCities && Date.now() < cacheExpiry) return cachedCities;
  const res = await fetch(
    "https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome",
    { signal: AbortSignal.timeout(15000) },
  );
  if (!res.ok) throw new Error(`IBGE API ${res.status}`);
  const raw: IbgeCity[] = await res.json();
  cachedCities = raw
    .filter((c) => c.microrregiao?.mesorregiao?.UF?.sigla)
    .map((c) => ({
      ibgeCode: String(c.id),
      name: c.nome,
      uf: c.microrregiao.mesorregiao.UF.sigla,
    }));
  cacheExpiry = Date.now() + CACHE_TTL;
  return cachedCities;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get("q") || "").trim();
    if (!q || q.length < 2) return json(req, []);

    const cities = await loadCities();
    const norm = normalizeCity(q);
    const results = cities
      .filter((c) => normalizeCity(c.name).startsWith(norm) || normalizeCity(`${c.name} ${c.uf}`).includes(norm))
      .slice(0, 20);

    return json(req, results);
  } catch (error) {
    return errorResponse(req, "city search", error);
  }
}
