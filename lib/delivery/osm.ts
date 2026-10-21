/**
 * Bairros do OpenStreetMap via Overpass (dados abertos ODbL). Módulo isomórfico: o servidor tenta primeiro com prazo
 * curto (limite das funções serverless) e, se os servidores públicos estiverem lentos, o painel consulta direto do
 * navegador, que pode esperar mais. O município é localizado pela tag IBGE:GEOCODIGO.
 */
import { cityKey, neighborhoodKey } from "./match";

export type NeighborhoodSource = "osm" | "ibge" | "manual";
export type SourcedNeighborhood = { name: string; source: NeighborhoodSource };

export const OVERPASS_URLS = ["https://overpass-api.de/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];

export function overpassQuery(ibgeCode: string): string {
  const code = ibgeCode.replace(/\D/g, "");
  return `[out:json][timeout:60];
area["IBGE:GEOCODIGO"="${code}"]->.a;
(
  rel(area.a)["boundary"="administrative"]["admin_level"~"^(9|10)$"];
  nwr(area.a)["place"~"^(suburb|neighbourhood|quarter)$"];
);
out tags;`;
}

/** Consulta os servidores em paralelo e fica com a primeira resposta válida. null = nenhum respondeu a tempo. */
export async function fetchOsmNeighborhoods(ibgeCode: string, timeoutMs: number): Promise<string[] | null> {
  const body = `data=${encodeURIComponent(overpassQuery(ibgeCode))}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await new Promise<string[] | null>((resolve) => {
      let pending = OVERPASS_URLS.length;
      for (const url of OVERPASS_URLS) {
        fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, signal: controller.signal })
          .then(async (res) => {
            if (!res.ok) throw new Error(String(res.status));
            const data = (await res.json()) as { elements?: { tags?: Record<string, string> }[] };
            resolve((data.elements || []).map((e) => e.tags?.name || "").filter(Boolean));
          })
          .catch(() => {
            pending -= 1;
            if (pending === 0) resolve(null);
          });
      }
    });
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

/** Junta as fontes sem repetir grafias equivalentes ("Jd. América" = "Jardim América") e sem o nome da própria cidade. */
export function mergeNeighborhoods(cityName: string, lists: { names: string[]; source: NeighborhoodSource }[]): SourcedNeighborhood[] {
  const city = cityKey(cityName);
  const seen = new Map<string, SourcedNeighborhood>();
  for (const { names, source } of lists) {
    for (const raw of names) {
      const name = raw.replace(/\s+/g, " ").trim();
      const key = neighborhoodKey(name);
      if (!key || key === city || name.length > 100 || seen.has(key)) continue;
      seen.set(key, { name, source });
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
