import type { NextRequest } from "next/server";
import { errorResponse, json, preflight } from "@/lib/billing/http";
import { authenticateAdmin } from "@/lib/admin/server";
import { loadCatalogOverrides } from "@/lib/billing/catalog-server";
import { resolveCatalog } from "@/lib/billing/catalog-db";
import { PLAN_ORDER } from "@/lib/billing/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

/** Lista o catálogo completo (com overrides aplicados), incluindo planos ocultos/arquivados — só para admins. */
export async function GET(req: NextRequest) {
  try {
    await authenticateAdmin(req);
    const overrides = await loadCatalogOverrides();
    const resolved = resolveCatalog(overrides);
    const plans = PLAN_ORDER.map((id) => ({ ...resolved[id], hasOverride: Boolean(overrides[id]) }));
    return json(req, { plans });
  } catch (error) {
    return errorResponse(req, "admin.planos.list", error);
  }
}
