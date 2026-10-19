import type { NextRequest } from "next/server";
import { json, errorResponse, preflight } from "@/lib/billing/http";

type IbgeDistrict = { id: number; nome: string };
type IbgeSubdistrict = { id: number; nome: string };

const cache = new Map<string, { data: { name: string }[]; expiry: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000;

async function fetchNeighborhoods(ibgeCode: string): Promise<{ name: string }[]> {
  const cached = cache.get(ibgeCode);
  if (cached && Date.now() < cached.expiry) return cached.data;

  const names = new Set<string>();

  const [distRes, subRes] = await Promise.allSettled([
    fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/municipios/${ibgeCode}/distritos`, { signal: AbortSignal.timeout(10000) }),
    fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/municipios/${ibgeCode}/subdistritos`, { signal: AbortSignal.timeout(10000) }),
  ]);

  if (distRes.status === "fulfilled" && distRes.value.ok) {
    const districts: IbgeDistrict[] = await distRes.value.json();
    for (const d of districts) names.add(d.nome);
  }

  if (subRes.status === "fulfilled" && subRes.value.ok) {
    const subs: IbgeSubdistrict[] = await subRes.value.json();
    for (const s of subs) names.add(s.nome);
  }

  const data = [...names].sort((a, b) => a.localeCompare(b, "pt-BR")).map((n) => ({ name: n }));
  cache.set(ibgeCode, { data, expiry: Date.now() + CACHE_TTL });
  return data;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export async function GET(req: NextRequest) {
  try {
    const ibgeCode = req.nextUrl.searchParams.get("ibgeCode") || "";
    if (!ibgeCode || !/^\d{6,7}$/.test(ibgeCode)) {
      return json(req, { error: "invalid_code", message: "Código IBGE inválido." }, 400);
    }

    const neighborhoods = await fetchNeighborhoods(ibgeCode);
    return json(req, neighborhoods);
  } catch (error) {
    return errorResponse(req, "neighborhood search", error);
  }
}
