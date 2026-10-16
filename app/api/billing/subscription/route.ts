import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/billing/access";
import { findPlan } from "@/lib/billing/plans";
import { getUserSubscription, hasPaidAccess, listPayments } from "@/lib/billing/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let user;
  try {
    user = await requireAuth(request.headers.get("authorization"));
  } catch (res) {
    return res as Response;
  }
  const sub = await getUserSubscription(user.uid);
  const payments = sub ? await listPayments(user.uid, 20) : [];
  const plan = sub ? findPlan(sub.planId) : null;
  return NextResponse.json({
    subscription: sub,
    plan: plan ? { id: plan.id, name: plan.name, tagline: plan.tagline, features: plan.features } : null,
    payments,
    hasPaidAccess: hasPaidAccess(sub),
  });
}
