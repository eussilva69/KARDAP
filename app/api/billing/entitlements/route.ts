import type { NextRequest } from "next/server";
import { PLAN_CATALOG, PLAN_ORDER } from "@/lib/billing/plans";
import { authenticate, errorResponse, json, preflight, readJson } from "@/lib/billing/http";
import { BillingError, canAccessFeature, monthlyUsage } from "@/lib/billing/server";
import { adminDb } from "@/lib/firebase-admin";
import { rateLimit } from "@/lib/sso/server";

/**
 * Direitos efetivos de um estabelecimento: plano, situação, limites, recursos, uso do mês, mesas e o que o papel
 * da pessoa permite. A mesma resposta para o painel do KARDAP e para o PDV (docs/PLANOS.md).
 * GET ?restaurantId= (Bearer) · POST { restaurantId, session? } (Bearer, ou Basic do servidor do PDV + sessão).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

async function handle(req: NextRequest, restaurantId: unknown, body: Record<string, unknown> | null) {
  const caller = await authenticate(req, body);
  rateLimit(req, "billing-entitlements", 600, 60_000, caller.uid);
  if (typeof restaurantId !== "string" || !restaurantId) throw new BillingError("invalid_restaurant", 400, "Informe o estabelecimento.");
  const pdv = await canAccessFeature(restaurantId, caller.uid, "pdvAccess");
  if (pdv.reason === "not_member") throw new BillingError("forbidden", 403, "Você não faz parte da equipe deste estabelecimento.");
  const { entitlements, member } = pdv;
  const [usage, tables] = await Promise.all([
    monthlyUsage(restaurantId, entitlements),
    adminDb().collection("restaurantes").doc(restaurantId).collection("mesas").count().get(),
  ]);
  return json(req, {
    restaurantId,
    entitlements,
    usage,
    tables: { used: tables.data().count, limit: entitlements.limits.maxTables },
    member: member ? { isOwner: member.isOwner, role: member.role || null, permissions: member.permissions || [] } : null,
    pdv: { allowed: pdv.allowed, reason: pdv.reason },
    catalog: PLAN_ORDER.map((id) => PLAN_CATALOG[id]),
  });
}

export async function GET(req: NextRequest) {
  try {
    return await handle(req, req.nextUrl.searchParams.get("restaurantId"), null);
  } catch (error) {
    return errorResponse(req, "entitlements", error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJson(req);
    return await handle(req, body.restaurantId, body);
  } catch (error) {
    return errorResponse(req, "entitlements", error);
  }
}
