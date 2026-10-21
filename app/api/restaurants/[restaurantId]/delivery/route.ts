import type { NextRequest } from "next/server";
import { authenticate, json, errorResponse, preflight, readJson } from "@/lib/billing/http";
import { availableOnlineMethods, getDeliveryConfigForTeam, getDeliveryMapOrigin, saveDeliveryConfig } from "@/lib/delivery/server";
import { getSubscriptionEntitlements } from "@/lib/billing/server";
import { autocomplete, placeAddress } from "@/lib/delivery/geo";

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
    const originQuery = (req.nextUrl.searchParams.get("originQuery") || "").trim().slice(0, 160);
    const originPlaceId = (req.nextUrl.searchParams.get("originPlaceId") || "").trim().slice(0, 300);
    const session = (req.nextUrl.searchParams.get("session") || "").trim().slice(0, 100) || undefined;
    if (originQuery || originPlaceId) {
      await getDeliveryConfigForTeam(restaurantId, caller.uid);
      if (originPlaceId) {
        const address = await placeAddress(originPlaceId, session);
        return json(req, { address: { placeId: address.placeId, formatted: address.formatted, location: address.location } });
      }
      const suggestions = originQuery.length >= 3 ? await autocomplete({ input: originQuery, kind: "address", sessionToken: session }) : [];
      return json(req, { suggestions });
    }
    const [config, entitlements, mapOrigin] = await Promise.all([
      getDeliveryConfigForTeam(restaurantId, caller.uid),
      getSubscriptionEntitlements(restaurantId),
      getDeliveryMapOrigin(restaurantId),
    ]);
    const slug = await getRestaurantSlug(restaurantId);

    return json(req, {
      config,
      deliveryUrl: slug ? `/r/${slug}/delivery` : null,
      planAllowsDelivery: entitlements.features.deliveryManagement,
      subscriptionValid: entitlements.valid,
      mapOrigin,
      // Quais formas de pagamento online funcionam neste ambiente (o painel explica as que não aparecem para o cliente).
      onlinePaymentMethods: Array.from(availableOnlineMethods()),
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
