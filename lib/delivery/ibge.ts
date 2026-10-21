/**
 * Municípios do IBGE (servidor): lista completa em memória por 24 h. Serve de chave estável das cidades atendidas
 * (código IBGE) e de ponte entre o nome devolvido pelo Google e o município cadastrado.
 */
import { cityKey } from "./match";

export type IbgeCity = { ibgeCode: string; name: string; uf: string };

type RawCity = { id: number; nome: string; microrregiao?: { mesorregiao?: { UF?: { sigla?: string } } }; "regiao-imediata"?: { "regiao-intermediaria"?: { UF?: { sigla?: string } } } };

const DAY = 24 * 60 * 60 * 1000;
let cities: IbgeCity[] | null = null;
let citiesExpiry = 0;
let inflight: Promise<IbgeCity[]> | null = null;

export async function loadIbgeCities(): Promise<IbgeCity[]> {
  if (cities && Date.now() < citiesExpiry) return cities;
  if (inflight) return inflight;
  inflight = (async () => {
    const res = await fetch("https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome", { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`IBGE API ${res.status}`);
    const raw: RawCity[] = await res.json();
    cities = raw
      .map((c) => ({
        ibgeCode: String(c.id),
        name: c.nome,
        uf: c.microrregiao?.mesorregiao?.UF?.sigla || c["regiao-imediata"]?.["regiao-intermediaria"]?.UF?.sigla || "",
      }))
      .filter((c) => c.uf);
    citiesExpiry = Date.now() + DAY;
    return cities;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

export async function searchIbgeCities(query: string, limit = 20): Promise<IbgeCity[]> {
  const all = await loadIbgeCities();
  const norm = cityKey(query);
  if (!norm) return [];
  return all.filter((c) => cityKey(c.name).startsWith(norm) || cityKey(`${c.name} ${c.uf}`).includes(norm)).slice(0, limit);
}

/** Município do IBGE pelo nome (como o Google devolve) e UF. */
export async function findIbgeCity(name: string, uf: string): Promise<IbgeCity | null> {
  const key = cityKey(name);
  const sigla = uf.trim().toUpperCase();
  if (!key || !sigla) return null;
  const all = await loadIbgeCities();
  return all.find((c) => c.uf === sigla && cityKey(c.name) === key) || null;
}

export const UF_BY_STATE: Record<string, string> = {
  acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE", "distrito federal": "DF",
  "espirito santo": "ES", goias: "GO", maranhao: "MA", "mato grosso": "MT", "mato grosso sul": "MS",
  "minas gerais": "MG", para: "PA", paraiba: "PB", parana: "PR", pernambuco: "PE", piaui: "PI",
  "rio janeiro": "RJ", "rio grande norte": "RN", "rio grande sul": "RS", rondonia: "RO", roraima: "RR",
  "santa catarina": "SC", "sao paulo": "SP", sergipe: "SE", tocantins: "TO",
};
const UFS = new Set(Object.values(UF_BY_STATE));

/** "SP", "São Paulo", "State of São Paulo", "Estado de São Paulo" → "SP". */
export function toUf(value: string): string {
  const raw = value.trim();
  if (UFS.has(raw.toUpperCase()) && raw.length === 2) return raw.toUpperCase();
  const key = cityKey(raw).replace(/^(estado|state of|state)\s+/, "").replace(/\s+state$/, "");
  return UF_BY_STATE[key] || "";
}

/** Distritos e subdistritos do IBGE (complemento da lista de bairros; nas capitais costumam coincidir com bairros). */
export async function fetchIbgeDistricts(ibgeCode: string): Promise<string[]> {
  const names: string[] = [];
  const results = await Promise.allSettled([
    fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/municipios/${ibgeCode}/distritos`, { signal: AbortSignal.timeout(8000) }),
    fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/municipios/${ibgeCode}/subdistritos`, { signal: AbortSignal.timeout(8000) }),
  ]);
  for (const r of results) {
    if (r.status !== "fulfilled" || !r.value.ok) continue;
    const list = (await r.value.json().catch(() => [])) as { nome?: string }[];
    for (const item of list) if (item?.nome) names.push(item.nome);
  }
  return names;
}
