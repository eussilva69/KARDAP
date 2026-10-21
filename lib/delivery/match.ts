/**
 * Reconhecimento de cidade/bairro e decisão da taxa de entrega.
 * Módulo puro (sem Firebase, sem env): o servidor usa para calcular a taxa definitiva e os testes rodam direto no Node.
 *
 * Bairros chegam com grafias diferentes (Google: "Jd. América", IBGE/OSM: "Jardim América", cliente: "jardim america"),
 * por isso a comparação passa por uma chave normalizada (acentos, abreviações, numerais romanos, preposições) antes
 * de cair para semelhança de texto.
 */
import type { DeliveryConfig, DeliveryFeeResult, FeeMode, NeighborhoodEntry, NeighborhoodMatchType, ServedCity } from "./types";

const ABBREVIATIONS: Record<string, string> = {
  jd: "jardim", jdm: "jardim", jar: "jardim",
  vl: "vila", vla: "vila",
  pq: "parque", pqe: "parque", prq: "parque",
  res: "residencial", resid: "residencial",
  cj: "conjunto", cjt: "conjunto", cjto: "conjunto", conj: "conjunto",
  st: "setor", set: "setor",
  sta: "santa", sto: "santo", s: "sao",
  n: "nossa", ns: "nossa", nsa: "nossa", sra: "senhora", sr: "senhor",
  lot: "loteamento", ch: "chacara", chac: "chacaras", cond: "condominio", hab: "habitacional",
  nuc: "nucleo", rec: "recanto", cid: "cidade",
  dr: "doutor", prof: "professor", pres: "presidente", gov: "governador", eng: "engenheiro",
  gal: "general", mal: "marechal", cel: "coronel", cap: "capitao", sen: "senador", dep: "deputado",
  ten: "tenente", mons: "monsenhor", pe: "padre", alm: "almirante", cmte: "comandante",
};

const STOPWORDS = new Set(["de", "da", "do", "das", "dos", "e", "d"]);
const ROMAN: Record<string, string> = { i: "1", ii: "2", iii: "3", iv: "4", v: "5", vi: "6", vii: "7", viii: "8", ix: "9", x: "10" };
const GENERIC_PREFIXES = new Set([
  "bairro", "jardim", "vila", "parque", "residencial", "conjunto", "setor", "loteamento", "chacara", "chacaras",
  "condominio", "nucleo", "habitacional", "recanto",
]);

function baseTokens(value: string): string[] {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/** Chave canônica de bairro: "Jd. N. Sra. Aparecida II" → "jardim nossa senhora aparecida 2". */
export function neighborhoodKey(name: string): string {
  const tokens = baseTokens(name).map((t) => ABBREVIATIONS[t] || t);
  if (tokens.length > 1 && tokens[0] === "bairro") tokens.shift();
  const last = tokens.length - 1;
  if (last > 0 && ROMAN[tokens[last]]) tokens[last] = ROMAN[tokens[last]];
  return tokens.filter((t) => !STOPWORDS.has(t)).join(" ");
}

/** Chave sem o tipo de loteamento ("jardim", "vila"…): "Jardim Bela Vista" e "Parque Bela Vista" → "bela vista". */
export function neighborhoodCore(name: string): string {
  const tokens = neighborhoodKey(name).split(" ").filter(Boolean);
  while (tokens.length > 1 && GENERIC_PREFIXES.has(tokens[0])) tokens.shift();
  return tokens.join(" ");
}

export function cityKey(name: string): string {
  return baseTokens(name).filter((t) => !STOPWORDS.has(t)).join(" ");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  return max ? 1 - levenshtein(a, b) / max : 1;
}

const SIMILARITY_MIN = 0.85;

export type NeighborhoodMatch = { slug: string; entry: NeighborhoodEntry; matchType: NeighborhoodMatchType };

/** Encontra o bairro cadastrado que corresponde ao digitado/retornado pelo Google. Ambíguo = sem correspondência. */
export function matchNeighborhood(neighborhoods: Record<string, NeighborhoodEntry>, district: string, slugOf: (name: string) => string): NeighborhoodMatch | null {
  const input = district.trim();
  if (!input) return null;
  const entries = Object.entries(neighborhoods).filter(([, e]) => e && typeof e.name === "string");
  if (!entries.length) return null;

  const slug = slugOf(input);
  const direct = neighborhoods[slug];
  if (direct && typeof direct.name === "string") return { slug, entry: direct, matchType: "exact" };

  const key = neighborhoodKey(input);
  if (!key) return null;
  const byKey = entries.find(([, e]) => neighborhoodKey(e.name) === key);
  if (byKey) return { slug: byKey[0], entry: byKey[1], matchType: "normalized" };

  const core = neighborhoodCore(input);
  if (core.length >= 3) {
    const byCore = entries.filter(([, e]) => neighborhoodCore(e.name) === core);
    if (byCore.length === 1) return { slug: byCore[0][0], entry: byCore[0][1], matchType: "core" };
  }

  if (key.length >= 5) {
    let best: { score: number; item: [string, NeighborhoodEntry] } | null = null;
    let second = 0;
    for (const item of entries) {
      const score = similarity(key, neighborhoodKey(item[1].name));
      if (!best || score > best.score) {
        second = best?.score ?? 0;
        best = { score, item };
      } else if (score > second) second = score;
    }
    if (best && best.score >= SIMILARITY_MIN && best.score - second >= 0.04) {
      return { slug: best.item[0], entry: best.item[1], matchType: "similar" };
    }
  }
  return null;
}

/** Cidade atendida para o endereço: pelo código IBGE quando conhecido; senão pelo nome normalizado + UF. */
export function findServedCity(cities: ServedCity[], address: { city: string; uf?: string; ibgeCode?: string }): ServedCity | undefined {
  if (address.ibgeCode) {
    const byCode = cities.find((c) => c.ibgeCode === address.ibgeCode);
    if (byCode) return byCode;
  }
  const key = cityKey(address.city);
  if (!key) return undefined;
  const uf = (address.uf || "").trim().toUpperCase();
  const sameName = cities.filter((c) => cityKey(c.name) === key);
  if (uf) return sameName.find((c) => c.uf.toUpperCase() === uf);
  return sameName[0];
}

export type FeeAddress = { city: string; district: string; uf?: string; ibgeCode?: string };

/**
 * Decisão da taxa (fonte da verdade do servidor). `area` = bairros da cidade encontrada (null se ainda não há lista).
 * O chamador lê a cidade com `findServedCity` antes, para buscar só o documento de bairros necessário.
 */
export function resolveDeliveryFee(
  config: Pick<DeliveryConfig, "deliveryFeeCents" | "feeMode" | "servedCities" | "defaultNeighborhoodFeeCents" | "serveUnlistedNeighborhoods">,
  address: FeeAddress,
  area: { neighborhoods: Record<string, NeighborhoodEntry> } | null,
  slugOf: (name: string) => string,
): DeliveryFeeResult {
  const feeMode: FeeMode = config.feeMode || "taxa_fixa";
  const cities = config.servedCities || [];
  const flat = Math.max(0, Math.round(config.deliveryFeeCents || 0));

  if (!cities.length) {
    return { feeCents: flat, feeMode: "taxa_fixa", cityName: address.city, neighborhoodName: null, matched: true };
  }

  const city = findServedCity(cities, address);
  if (!city) {
    return { feeCents: 0, feeMode, cityName: address.city, neighborhoodName: null, matched: false, reason: "Infelizmente, este restaurante ainda não realiza entregas na sua cidade." };
  }
  const base = { feeMode, cityName: city.name, cityIbgeCode: city.ibgeCode };
  if (city.enabled === false) {
    return { ...base, feeCents: 0, neighborhoodName: null, matched: false, reason: `As entregas para ${city.name} estão pausadas no momento.` };
  }

  const district = address.district.trim();
  const neighborhoods = area?.neighborhoods || {};
  const match = district ? matchNeighborhood(neighborhoods, district, slugOf) : null;

  if (match && !match.entry.enabled) {
    return { ...base, feeCents: 0, neighborhoodName: match.entry.name, matchType: match.matchType, matched: false, reason: `Infelizmente, este restaurante não realiza entregas no bairro ${match.entry.name}.` };
  }

  if (feeMode === "taxa_fixa") {
    return { ...base, feeCents: flat, neighborhoodName: match?.entry.name ?? null, matchType: match?.matchType, matched: true };
  }

  if (!district) {
    return { ...base, feeCents: 0, neighborhoodName: null, matched: false, reason: "Informe o bairro para calcular a taxa de entrega." };
  }

  const fallback = typeof config.defaultNeighborhoodFeeCents === "number" && config.defaultNeighborhoodFeeCents >= 0 ? Math.round(config.defaultNeighborhoodFeeCents) : null;

  if (match) {
    const own = typeof match.entry.feeCents === "number" ? match.entry.feeCents : null;
    const fee = own ?? fallback;
    if (fee === null) {
      return { ...base, feeCents: 0, neighborhoodName: match.entry.name, matchType: match.matchType, matched: false, reason: `A taxa de entrega para o bairro ${match.entry.name} ainda não foi definida pelo restaurante.` };
    }
    return { ...base, feeCents: fee, neighborhoodName: match.entry.name, matchType: match.matchType, usedDefaultFee: own === null, matched: true };
  }

  if (config.serveUnlistedNeighborhoods && fallback !== null) {
    return { ...base, feeCents: fallback, neighborhoodName: district, usedDefaultFee: true, matched: true };
  }

  return { ...base, feeCents: 0, neighborhoodName: district, matched: false, reason: "Infelizmente, este restaurante ainda não realiza entregas no bairro informado." };
}
