import { NextResponse, type NextRequest } from "next/server";
import { loadResolvedCatalog } from "@/lib/billing/catalog-server";
import { publicCatalog } from "@/lib/billing/catalog-db";
import { withCors } from "@/lib/sso/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Catálogo público (planos ativos e visíveis). Lido pelo painel público de preços e pelo onboarding. */
export async function GET(req: NextRequest) {
  const resolved = await loadResolvedCatalog();
  const items = publicCatalog(resolved);
  const res = NextResponse.json({ plans: items }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } });
  return withCors(req, res);
}

export function OPTIONS(req: NextRequest) {
  return withCors(req, new NextResponse(null, { status: 204 }));
}
