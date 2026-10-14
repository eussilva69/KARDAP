import type { NextRequest } from "next/server";
import { cancelCaktoSubscription } from "@/lib/cakto/client";
import { isCaktoConfigured } from "@/lib/cakto/config";
import { updateRestaurantSubscription } from "@/lib/cakto/server-db";
import { isPlanId, planRank, PLAN_CATALOG, toDate } from "@/lib/billing/plans";
import { authenticate, errorResponse, json, readJson } from "@/lib/billing/http";
import { BillingError, requireManager } from "@/lib/billing/server";

/**
 * Mudança para um plano MENOR (downgrade), agendada para o fim do período pago. Upgrade não passa por aqui: é um
 * checkout novo (POST /api/cakto/checkout), liberado na hora.
 * Ao agendar: a assinatura atual deixa de renovar no gateway (nenhuma cobrança no valor antigo) e o plano atual vale
 * até o fim do período. A partir de 1 dia antes da data, Meu Plano oferece o checkout do plano escolhido.
 * Nada é excluído: mesas, produtos, pedidos e relatórios continuam; só novas criações acima do novo limite param.
 * Corpo: { restaurantId, planId }.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await readJson(req);
    const caller = await authenticate(req, body);
    const restaurantId = String(body.restaurantId || "");
    const { snap, entitlements } = await requireManager(restaurantId, caller.uid, "billing");
    const target = body.planId;
    if (!isPlanId(target) || target === "enterprise") throw new BillingError("invalid_plan", 400, "Plano inválido.");
    const stored = snap.get("subscription");
    const paying = Boolean(stored?.planId) && entitlements.valid && entitlements.status === "active" && !entitlements.cancelAtPeriodEnd;
    if (!paying) throw new BillingError("not_paying", 409, "Sem assinatura ativa para agendar mudança. Escolha o plano e assine em Meu Plano.");
    if (planRank(target) >= planRank(entitlements.planId)) {
      throw new BillingError("not_downgrade", 409, planRank(target) === planRank(entitlements.planId) ? "Este já é o seu plano atual." : "Para um plano maior, use “Fazer upgrade”: a mudança vale na hora.");
    }
    const effectiveAt = toDate(stored.nextPaymentDate || stored.currentPeriodEnd)?.toISOString() || null;
    if (stored.caktoSubscriptionId && isCaktoConfigured()) {
      try {
        await cancelCaktoSubscription(stored.caktoSubscriptionId);
      } catch {
        throw new BillingError("gateway_unavailable", 502, "Não foi possível agendar agora: a cobrança atual não pôde ser interrompida. Tente de novo em instantes.");
      }
    }
    const requestedAt = new Date().toISOString();
    await updateRestaurantSubscription(
      restaurantId,
      { cancelAtPeriodEnd: true, scheduledChange: { planId: target, effectiveAt, requestedAt } },
      { kind: "owner", uid: caller.uid, email: caller.email },
      `Mudança agendada: ${PLAN_CATALOG[entitlements.planId].name} → ${PLAN_CATALOG[target].name}`,
    );
    return json(req, { scheduled: { planId: target, effectiveAt, requestedAt } });
  } catch (error) {
    return errorResponse(req, "change-plan", error);
  }
}
