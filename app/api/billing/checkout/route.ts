import { NextRequest, NextResponse } from "next/server";
import { buildHostedCheckoutUrl } from "@/lib/billing/cakto";
import { findOffer, type PlanId, type PlanPeriod } from "@/lib/billing/plans";
import { requireAuth } from "@/lib/billing/access";
import { getUserSubscription, upsertPendingSubscription } from "@/lib/billing/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/billing/checkout
 * Body: { planId, period, successUrl?, cancelUrl? }
 *
 * O preço nunca é lido do body — usamos o `offerId` configurado no catálogo
 * (lib/billing/plans.ts) e redirecionamos ao checkout hospedado da Cakto.
 */
export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requireAuth(request.headers.get("authorization"));
  } catch (res) {
    return res as Response;
  }

  const body = await request.json().catch(() => ({}));
  const planId = typeof body.planId === "string" ? body.planId : "";
  const period: PlanPeriod = body.period === "yearly" ? "yearly" : "monthly";

  const offer = findOffer(planId, period);
  if (!offer) {
    return NextResponse.json({ error: "Plano ou periodicidade inválidos" }, { status: 400 });
  }

  // Bloqueia nova contratação se já houver assinatura vigente.
  const existing = await getUserSubscription(user.uid);
  if (existing && (existing.status === "active" || existing.status === "trial")) {
    return NextResponse.json({ error: "Você já possui uma assinatura ativa." }, { status: 409 });
  }

  try {
    await upsertPendingSubscription({
      uid: user.uid,
      email: user.email,
      planId: planId as PlanId,
      period,
      caktoOfferId: offer.offerId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "already_active") {
      return NextResponse.json({ error: "Você já possui uma assinatura ativa." }, { status: 409 });
    }
    console.error("[billing] upsert pending failed", err);
    return NextResponse.json({ error: "Falha ao iniciar contratação" }, { status: 500 });
  }

  // Query params aceitos variam entre instalações; `email`, `name` e `ref`
  // costumam funcionar como pré-preenchimento no checkout da Cakto.
  const checkoutUrl = buildHostedCheckoutUrl(offer.offerId, {
    email: user.email || undefined,
    ref: user.uid,
  });

  return NextResponse.json({ checkoutUrl, planId, period, priceCents: offer.priceCents });
}
