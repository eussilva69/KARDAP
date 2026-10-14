import { NextRequest, NextResponse } from "next/server";
import { cancelCaktoSubscription, changeCaktoPaymentMethod, getCaktoSubscription } from "@/lib/cakto/client";
import { isCaktoConfigured } from "@/lib/cakto/config";
import { getRestaurantSubscriptionWithHistory, updateRestaurantSubscription } from "@/lib/cakto/server-db";
import { PLAN_CATALOG, PLAN_ORDER, normalizeStatus } from "@/lib/billing/plans";
import { authenticate } from "@/lib/billing/http";
import { BillingError, memberAccess, requireManager } from "@/lib/billing/server";

const fail = (error: unknown, fallback: string) => {
  if (error instanceof BillingError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  console.error("[Cakto Subscription]", (error as Error)?.message);
  return NextResponse.json({ error: fallback }, { status: 500 });
};

/** Assinatura atual e histórico de pagamentos (equipe do estabelecimento). */
export async function GET(request: NextRequest) {
  try {
    const caller = await authenticate(request);
    const restaurantId = request.nextUrl.searchParams.get("restaurantId") || "";
    if (!restaurantId) return NextResponse.json({ error: "restaurantId é obrigatório." }, { status: 400 });
    if (!(await memberAccess(restaurantId, caller.uid))) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });

    const { subscription, payments } = await getRestaurantSubscriptionWithHistory(restaurantId);
    let synced = subscription;
    // Sincroniza a situação com o gateway quando há divergência (falha silenciosa: vale o que está no banco).
    if (subscription?.caktoSubscriptionId && isCaktoConfigured()) {
      try {
        const remote = await getCaktoSubscription(subscription.caktoSubscriptionId);
        const remoteStatus = normalizeStatus(remote?.status);
        if (remote && remoteStatus && remoteStatus !== normalizeStatus(subscription.status)) {
          await updateRestaurantSubscription(restaurantId, { status: remoteStatus, nextPaymentDate: remote.next_payment_date || subscription.nextPaymentDate }, { kind: "system" }, "Sincronização com o gateway");
          synced = { ...subscription, status: remoteStatus, nextPaymentDate: remote.next_payment_date || subscription.nextPaymentDate };
        }
      } catch (syncErr) {
        console.warn("[Cakto Sync] Não foi possível sincronizar com a API remota:", (syncErr as Error)?.message);
      }
    }
    return NextResponse.json({ subscription: synced, payments, plans: PLAN_ORDER.map((id) => PLAN_CATALOG[id]) });
  } catch (error) {
    return fail(error, "Falha ao consultar assinatura.");
  }
}

/** Cancelamento e forma de pagamento (responsável pela cobrança do estabelecimento). */
export async function POST(request: NextRequest) {
  try {
    const caller = await authenticate(request);
    const body = (await request.json().catch(() => ({}))) as { action?: string; restaurantId?: string; paymentMethod?: string };
    const restaurantId = body.restaurantId || "";
    if (!restaurantId) return NextResponse.json({ error: "restaurantId é obrigatório." }, { status: 400 });
    const { snap } = await requireManager(restaurantId, caller.uid, "billing");
    const subscription = snap.get("subscription");
    if (!subscription?.planId) return NextResponse.json({ error: "Nenhuma assinatura ativa encontrada." }, { status: 404 });
    const actor = { kind: "owner" as const, uid: caller.uid, email: caller.email };

    if (body.action === "cancel") {
      if (subscription.caktoSubscriptionId && isCaktoConfigured()) {
        try {
          await cancelCaktoSubscription(subscription.caktoSubscriptionId);
        } catch (apiErr) {
          // Já cancelada no gateway: segue com o registro local.
          console.error("[Cakto Cancel]", (apiErr as Error)?.message);
        }
      }
      await updateRestaurantSubscription(restaurantId, { status: "canceled", canceledAt: new Date().toISOString(), cancelAtPeriodEnd: true, scheduledChange: null }, actor, "Cancelamento pelo responsável");
      return NextResponse.json({ success: true, message: "Assinatura cancelada. Não haverá novas cobranças; o plano vale até o fim do período pago." });
    }

    if (body.action === "change_payment_method") {
      const method = body.paymentMethod;
      if (method !== "credit_card" && method !== "pix" && method !== "pix_auto") {
        return NextResponse.json({ error: "Método de pagamento inválido. Escolha 'credit_card', 'pix' ou 'pix_auto'." }, { status: 400 });
      }
      if (subscription.caktoSubscriptionId && isCaktoConfigured()) await changeCaktoPaymentMethod(subscription.caktoSubscriptionId, method);
      await updateRestaurantSubscription(
        restaurantId,
        { paymentMethod: method, paymentMethodName: method === "credit_card" ? "Cartão de Crédito" : method === "pix_auto" ? "Pix Automático" : "Pix" },
        actor,
        "Forma de pagamento alterada",
      );
      return NextResponse.json({ success: true, message: "Método de pagamento atualizado com sucesso para as próximas cobranças." });
    }

    return NextResponse.json({ error: "Ação não reconhecida." }, { status: 400 });
  } catch (error) {
    return fail(error, "Falha ao processar solicitação de assinatura.");
  }
}
