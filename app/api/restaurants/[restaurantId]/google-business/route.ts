import type { NextRequest } from "next/server";
import { authenticate, errorResponse, json, readJson } from "@/lib/billing/http";
import { requireManager } from "@/lib/billing/server";
import { adminDb } from "@/lib/firebase-admin";
import { rateLimit } from "@/lib/sso/server";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function restaurantRef(restaurantId: string) {
  return adminDb().collection("restaurantes").doc(restaurantId);
}

export async function GET(req: NextRequest, { params }: { params: { restaurantId: string } }) {
  try {
    const caller = await authenticate(req);
    await requireManager(params.restaurantId, caller.uid, "settings");
    const snap = await restaurantRef(params.restaurantId).get();
    const data = snap.data();
    return json(req, { googleBusiness: data?.googleBusiness || null });
  } catch (error) {
    return errorResponse(req, "google-business", error);
  }
}

export async function POST(req: NextRequest, { params }: { params: { restaurantId: string } }) {
  try {
    const body = await readJson(req);
    const caller = await authenticate(req, body);
    rateLimit(req, "google-biz-save", 10, 60_000, caller.uid);
    await requireManager(params.restaurantId, caller.uid, "settings");

    const placeId = typeof body.placeId === "string" ? body.placeId.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
    const address = typeof body.address === "string" ? body.address.trim().slice(0, 500) : "";
    const reviewUrl = typeof body.reviewUrl === "string" ? body.reviewUrl.trim().slice(0, 2000) : "";
    const source = typeof body.source === "string" && ["google_places", "manual"].includes(body.source) ? body.source : "manual";

    if (reviewUrl) {
      try {
        const parsed = new URL(reviewUrl);
        if (!/^https?:$/.test(parsed.protocol)) throw new Error();
        const ALLOWED_REVIEW_DOMAINS = /^(www\.)?(google\.(com|com\.br)|g\.page|goo\.gl|maps\.google\.(com|com\.br)|search\.google\.(com|com\.br))$/i;
        if (!ALLOWED_REVIEW_DOMAINS.test(parsed.hostname)) {
          throw Object.assign(new Error("O link de avaliação deve ser do Google (google.com, g.page ou maps.google.com)."), { status: 400, code: "invalid_domain" });
        }
      } catch (e) {
        if ((e as { code?: string }).code === "invalid_domain") throw e;
        throw Object.assign(new Error("URL de avaliação inválida."), { status: 400, code: "invalid_url" });
      }
    }

    const now = FieldValue.serverTimestamp();
    const googleBusiness: Record<string, unknown> = {
      placeId,
      name,
      address,
      reviewUrl,
      enabled: true,
      source,
      updatedAt: now,
    };

    const snap = await restaurantRef(params.restaurantId).get();
    const existing = snap.data()?.googleBusiness;
    if (!existing?.linkedAt) {
      googleBusiness.linkedAt = now;
    }

    await restaurantRef(params.restaurantId).set(
      {
        googleBusiness,
        settings: { googleReviewUrl: reviewUrl || FieldValue.delete(), google: !!reviewUrl },
      },
      { merge: true },
    );

    return json(req, { saved: true }, 200);
  } catch (error) {
    return errorResponse(req, "google-business", error);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { restaurantId: string } }) {
  try {
    const caller = await authenticate(req);
    rateLimit(req, "google-biz-del", 10, 60_000, caller.uid);
    await requireManager(params.restaurantId, caller.uid, "settings");

    await restaurantRef(params.restaurantId).set(
      {
        googleBusiness: FieldValue.delete(),
        settings: { googleReviewUrl: FieldValue.delete(), google: false },
      },
      { merge: true },
    );

    return json(req, { deleted: true });
  } catch (error) {
    return errorResponse(req, "google-business", error);
  }
}
