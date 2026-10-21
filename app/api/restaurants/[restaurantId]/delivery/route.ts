import type { NextRequest } from "next/server";
import { authenticate, json, errorResponse, preflight, readJson } from "@/lib/billing/http";
import { getDeliveryConfigForTeam, getDeliveryMapOrigin, saveDeliveryConfig } from "@/lib/delivery/server";
import { monthlyUsage, getSubscriptionEntitlements } from "@/lib/billing/server";

/**
 * GET  /api/restaurants/{id}/delivery — Configuração do delivery + uso do mês (autenticado)
 * POST /api/restaurants/{id}/delivery — Salva configuração do delivery (autenticado, owner/manager)
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export async function GET(req: NextRequest, { params }: { params: { restaurantId: string } }) {
  try {
    const caller = await authenticate(req);
    const { restaurantId } = params;
    const [config, entitlements, mapOrigin] = await Promise.all([
      getDeliveryConfigForTeam(restaurantId, caller.uid),
      getSubscriptionEntitlements(restaurantId),
      getDeliveryMapOrigin(restaurantId),
    ]);
    const usage = await monthlyUsage(restaurantId, entitlements);
    const slug = await getRestaurantSlug(restaurantId);

    return json(req, {
      config,
      usage: {
        periodId: usage.periodId,
        used: usage.nativeOrdersUsed,
        limit: usage.nativeOrdersLimit,
        remaining: usage.remaining,
        level: usage.level,
        blocked: usage.blocked,
      },
      deliveryUrl: slug ? `/r/${slug}/delivery` : null,
      planAllowsDelivery: entitlements.features.deliveryManagement,
      subscriptionValid: entitlements.valid,
      mapOrigin,
    });
  } catch (error) {
    return errorResponse(req, "delivery config", error);
  }
}

export async function POST(req: NextRequest, { params }: { params: { restaurantId: string } }) {
  try {
    const caller = await authenticate(req);
    const body = await readJson(req);
    const config = await saveDeliveryConfig(params.restaurantId, caller.uid, body as any);
    return json(req, { config });
  } catch (error) {
    return errorResponse(req, "delivery config", error);
  }
}

async function getRestaurantSlug(restaurantId: string): Promise<string> {
  const { adminDb } = await import("@/lib/firebase-admin");
  const snap = await adminDb().collection("restaurantes").doc(restaurantId).get();
  return (snap.get("slug") as string) || "";
}
