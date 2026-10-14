import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { CAKTO_CONFIG } from "@/lib/cakto/config";
import { getOfferIdForPlan, getPlanPriceCents, isCheckoutPlan } from "@/lib/cakto/plans";
import { createCheckoutSession, type CheckoutKind } from "@/lib/cakto/server-db";
import { PLAN_CATALOG, planRank, toDate } from "@/lib/billing/plans";
import { authenticate } from "@/lib/billing/http";
import { BillingError, requireManager } from "@/lib/billing/server";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Abre o checkout da Cakto para um plano. O tipo da contratação é decidido aqui, com a assinatura atual:
 * - nova assinatura ou reativação: qualquer plano com checkout;
 * - upgrade: liberado na hora; quando o pagamento for confirmado, a assinatura anterior é cancelada no gateway;
 * - downgrade com a assinatura em dia: é agendado em Meu Plano (POST /api/billing/change-plan); o checkout do plano
 *   menor abre a partir de 1 dia antes da data agendada.
 * O Enterprise não tem checkout (proposta comercial).
 */
export async function POST(request: NextRequest) {
  try {
    const caller = await authenticate(request);
    const body = (await request.json().catch(() => ({}))) as { planId?: unknown; restaurantId?: unknown };
    const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId : "";
    if (!restaurantId) return NextResponse.json({ error: "Identificador do estabelecimento é obrigatório." }, { status: 400 });
    if (body.planId === "enterprise") {
      return NextResponse.json({ error: "O Enterprise é contratado com o nosso time comercial. Use “Falar com vendas”.", code: "sales_only" }, { status: 400 });
    }
    if (!isCheckoutPlan(body.planId)) return NextResponse.json({ error: "Plano inválido." }, { status: 400 });
    const planId = body.planId;

    const { snap, entitlements } = await requireManager(restaurantId, caller.uid, "billing");
    const offerId = getOfferIdForPlan(planId);
    if (!offerId) {
      return NextResponse.json({ error: `A contratação online do ${PLAN_CATALOG[planId].name} ainda não está disponível. Fale com o suporte.`, code: "offer_not_configured" }, { status: 503 });
    }

    // Tipo da contratação, conforme o plano que vale agora.
    const stored = snap.get("subscription") || null;
    const paying = Boolean(stored?.planId) && entitlements.valid && !entitlements.implicitTrial && entitlements.status !== "trialing";
    let kind: CheckoutKind = "new";
    if (paying) {
      const current = entitlements.planId;
      if (current === planId) {
        // Reativação do mesmo plano só perto do fim do período pago (evita pagar duas vezes o mesmo mês).
        const until = toDate(entitlements.accessUntil);
        const canceling = entitlements.status === "canceled" || entitlements.cancelAtPeriodEnd;
        if (!canceling || (until && until.getTime() - Date.now() > DAY)) {
          return NextResponse.json({ error: "Este já é o seu plano atual.", code: "same_plan" }, { status: 409 });
        }
        kind = "renew";
      } else if (planRank(planId) > planRank(current)) {
        kind = "upgrade";
      } else {
        const scheduled = entitlements.scheduledChange;
        const effective = toDate(scheduled?.effectiveAt);
        if (!scheduled || scheduled.planId !== planId || (effective && effective.getTime() - Date.now() > DAY)) {
          return NextResponse.json(
            { error: "A mudança para um plano menor é agendada para o fim do período pago, em Meu Plano.", code: "downgrade_must_be_scheduled" },
            { status: 409 },
          );
        }
        kind = "downgrade";
      }
    }

    const sessionToken = crypto.randomUUID();
    await createCheckoutSession({
      token: sessionToken,
      restaurantId,
      userId: caller.uid,
      planId,
      cycle: "monthly",
      expectedOfferId: offerId,
      priceCents: getPlanPriceCents(planId),
      kind,
      previousPlanId: stored?.planId || null,
      previousProviderSubscriptionId: kind === "upgrade" ? stored?.caktoSubscriptionId || null : null,
      userEmail: caller.email || undefined,
    });

    const params = new URLSearchParams({ callback: sessionToken });
    if (caller.email) params.set("email", caller.email);
    const name = snap.get("name");
    if (typeof name === "string" && name) params.set("name", name);
    const checkoutUrl = `${CAKTO_CONFIG.payBaseUrl}/${encodeURIComponent(offerId)}?${params.toString()}`;

    return NextResponse.json({
      success: true,
      checkoutUrl,
      sessionToken,
      kind,
      plan: { id: planId, name: PLAN_CATALOG[planId].name, priceCents: getPlanPriceCents(planId) },
    });
  } catch (error) {
    if (error instanceof BillingError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    console.error("[Cakto Checkout] erro:", (error as Error)?.message);
    return NextResponse.json({ error: "Ocorreu um erro interno ao iniciar a contratação. Tente novamente." }, { status: 500 });
  }
}
