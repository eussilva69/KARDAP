import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/billing/access";
import { caktoCancelSubscription, CaktoError } from "@/lib/billing/cakto";
import { getUserSubscription, updateSubscription } from "@/lib/billing/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/billing/subscription/cancel
 *
 * Chama o endpoint oficial da Cakto para cancelar e reflete o estado no
 * banco. O webhook `subscription_canceled` confirma a mudança depois.
 */
export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requireAuth(request.headers.get("authorization"));
  } catch (res) {
    return res as Response;
  }

  const sub = await getUserSubscription(user.uid);
  if (!sub || !sub.caktoSubscriptionId) {
    return NextResponse.json({ error: "Nenhuma assinatura ativa encontrada." }, { status: 404 });
  }
  if (sub.status === "canceled" || sub.status === "expired") {
    return NextResponse.json({ error: "Assinatura já cancelada." }, { status: 409 });
  }

  try {
    const result = await caktoCancelSubscription(sub.caktoSubscriptionId);
    await updateSubscription(user.uid, {
      status: "canceled",
      canceledAt: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, detail: result.detail, status: result.status });
  } catch (err) {
    if (err instanceof CaktoError) {
      console.error("[billing] cancel failed", err.status, err.payload);
      return NextResponse.json({ error: "Falha ao cancelar na Cakto" }, { status: err.status === 404 ? 404 : 502 });
    }
    console.error("[billing] cancel error", err);
    return NextResponse.json({ error: "Falha ao cancelar" }, { status: 500 });
  }
}
