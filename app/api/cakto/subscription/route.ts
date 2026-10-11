import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { cancelCaktoSubscription, changeCaktoPaymentMethod, getCaktoSubscription } from "@/lib/cakto/client";
import { isCaktoConfigured } from "@/lib/cakto/config";
import { PLANS } from "@/lib/cakto/plans";
import { getRestaurantSubscriptionWithHistory, updateRestaurantSubscription } from "@/lib/cakto/server-db";

/**
 * Consulta a assinatura atual e o histórico de pagamentos de um restaurante.
 */
export async function GET(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    let decodedUser: { uid: string };
    try {
      decodedUser = await adminAuth().verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const restaurantId = searchParams.get("restaurantId");

    if (!restaurantId) {
      return NextResponse.json({ error: "restaurantId é obrigatório." }, { status: 400 });
    }

    // Valida permissão do usuário
    const db = adminDb();
    const restDoc = await db.collection("restaurantes").doc(restaurantId).get();
    if (!restDoc.exists) {
      return NextResponse.json({ error: "Estabelecimento não encontrado." }, { status: 404 });
    }

    const data = restDoc.data();
    const isOwner = data?.ownerId === decodedUser.uid;
    if (!isOwner) {
      const member = await db.collection("restaurantes").doc(restaurantId).collection("membros").doc(decodedUser.uid).get();
      if (!member.exists) {
        return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
      }
    }

    // Busca dados no Firestore
    const { subscription, payments } = await getRestaurantSubscriptionWithHistory(restaurantId);

    // Se houver uma assinatura na Cakto e o sistema estiver configurado, sincroniza estado se necessário
    let syncedSubscription = subscription;
    if (subscription?.caktoSubscriptionId && isCaktoConfigured()) {
      try {
        const remote = await getCaktoSubscription(subscription.caktoSubscriptionId);
        if (remote && remote.status !== subscription.status) {
          await updateRestaurantSubscription(restaurantId, {
            status: remote.status as any,
            nextPaymentDate: remote.next_payment_date || subscription.nextPaymentDate,
          });
          syncedSubscription = {
            ...subscription,
            status: remote.status as any,
            nextPaymentDate: remote.next_payment_date || subscription.nextPaymentDate,
          };
        }
      } catch (syncErr) {
        // Falha suave de sincronização em tempo real (mantém os dados locais do banco)
        console.warn("[Cakto Sync Warning] Não foi possível sincronizar com a API remota:", syncErr);
      }
    }

    return NextResponse.json({
      subscription: syncedSubscription,
      payments,
      plans: PLANS,
    });
  } catch (error: any) {
    console.error("[Cakto Subscription GET Error]:", error);
    return NextResponse.json({ error: "Falha ao consultar assinatura." }, { status: 500 });
  }
}

/**
 * Ações de gerenciamento: Cancelamento e Alteração de método de pagamento.
 */
export async function POST(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    let decodedUser: { uid: string };
    try {
      decodedUser = await adminAuth().verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
    }

    const body = await request.json();
    const { action, restaurantId, paymentMethod } = body as {
      action: "cancel" | "change_payment_method";
      restaurantId: string;
      paymentMethod?: "credit_card" | "pix" | "pix_auto";
    };

    if (!restaurantId) {
      return NextResponse.json({ error: "restaurantId é obrigatório." }, { status: 400 });
    }

    // Validação de permissão do proprietário
    const db = adminDb();
    const restDoc = await db.collection("restaurantes").doc(restaurantId).get();
    if (!restDoc.exists) {
      return NextResponse.json({ error: "Estabelecimento não encontrado." }, { status: 404 });
    }

    const restData = restDoc.data();
    if (restData?.ownerId !== decodedUser.uid) {
      return NextResponse.json({ error: "Apenas o proprietário pode alterar a assinatura." }, { status: 403 });
    }

    const subscription = restData?.subscription;
    if (!subscription) {
      return NextResponse.json({ error: "Nenhuma assinatura ativa encontrada." }, { status: 404 });
    }

    // ─── Ação: CANCELAR ASSINATURA ───
    if (action === "cancel") {
      const caktoSubId = subscription.caktoSubscriptionId;
      if (caktoSubId && isCaktoConfigured()) {
        try {
          await cancelCaktoSubscription(caktoSubId);
        } catch (apiErr: any) {
          console.error("[Cakto Cancel Error]:", apiErr);
          // Se a API retornar erro de que já está cancelada, prossegue com a atualização local
        }
      }

      const now = new Date().toISOString();
      await updateRestaurantSubscription(restaurantId, {
        status: "canceled",
        canceledAt: now,
      });

      return NextResponse.json({
        success: true,
        message: "Assinatura cancelada com sucesso. As cobranças automáticas foram interrompidas.",
      });
    }

    // ─── Ação: ALTERAR MÉTODO DE PAGAMENTO ───
    if (action === "change_payment_method") {
      if (!paymentMethod || !["credit_card", "pix", "pix_auto"].includes(paymentMethod)) {
        return NextResponse.json(
          { error: "Método de pagamento inválido. Escolha 'credit_card', 'pix' ou 'pix_auto'." },
          { status: 400 },
        );
      }

      const caktoSubId = subscription.caktoSubscriptionId;
      if (caktoSubId && isCaktoConfigured()) {
        await changeCaktoPaymentMethod(caktoSubId, paymentMethod);
      }

      await updateRestaurantSubscription(restaurantId, {
        paymentMethod,
        paymentMethodName:
          paymentMethod === "credit_card"
            ? "Cartão de Crédito"
            : paymentMethod === "pix_auto"
              ? "Pix Automático"
              : "Pix",
      });

      return NextResponse.json({
        success: true,
        message: "Método de pagamento atualizado com sucesso para as próximas cobranças.",
      });
    }

    return NextResponse.json({ error: "Ação não reconhecida." }, { status: 400 });
  } catch (error: any) {
    console.error("[Cakto Subscription Action Error]:", error);
    return NextResponse.json(
      { error: error.message || "Falha ao processar solicitação de assinatura." },
      { status: 500 },
    );
  }
}
