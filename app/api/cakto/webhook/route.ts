import { NextRequest, NextResponse } from "next/server";
import { CAKTO_CONFIG, isWebhookConfigured } from "@/lib/cakto/config";
import { verifyCaktoWebhookSignature } from "@/lib/cakto/client";
import {
  addPaymentRecord,
  checkAndMarkWebhookEvent,
  getCheckoutSession,
  updateRestaurantSubscription,
} from "@/lib/cakto/server-db";
import { CaktoWebhookPayload, PaymentRecord } from "@/lib/cakto/types";
import { adminDb } from "@/lib/firebase-admin";

export async function POST(request: NextRequest) {
  let rawBodyText = "";
  try {
    // 1. Obtém o corpo cru da requisição para validação estrita HMAC-SHA256
    const arrayBuffer = await request.arrayBuffer();
    const rawBuffer = Buffer.from(arrayBuffer);
    rawBodyText = rawBuffer.toString("utf-8");

    // 2. Extrai cabeçalhos de autenticação enviados pela Cakto
    const timestamp = request.headers.get("x-cakto-timestamp");
    const signature = request.headers.get("x-cakto-signature");

    let payload: CaktoWebhookPayload;
    try {
      payload = JSON.parse(rawBodyText);
    } catch {
      console.error("[Cakto Webhook] JSON inválido recebido.");
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // 3. Validação de segurança e autenticidade da requisição
    // Se CAKTO_WEBHOOK_SECRET estiver configurado, valida a assinatura HMAC
    if (isWebhookConfigured()) {
      const isValid = verifyCaktoWebhookSignature({
        rawBody: rawBuffer,
        timestamp,
        signature,
        bodySecret: payload.secret,
        secret: CAKTO_CONFIG.webhookSecret,
      });

      if (!isValid) {
        console.warn("[Cakto Webhook] Assinatura HMAC-SHA256 inválida ou segredo incorreto.");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    } else {
      console.warn(
        "[Cakto Webhook] AVISO: CAKTO_WEBHOOK_SECRET não configurado. Aceitando entrega em modo de homologação.",
      );
    }

    const { event, data } = payload;
    if (!event || !data) {
      return NextResponse.json({ error: "Missing event or data" }, { status: 400 });
    }

    // Ignora eventos que não requerem processamento transacional (ex: abandono de checkout)
    if (event === "checkout_abandonment") {
      return NextResponse.json({ received: true, ignored: "checkout_abandonment" }, { status: 200 });
    }

    // 4. Idempotência: deduplica pelo ID único do pedido ou evento
    const eventUniqueId = data.id || `${event}_${Date.now()}`;
    const isDuplicate = await checkAndMarkWebhookEvent(eventUniqueId, event, payload);

    if (isDuplicate) {
      console.info(`[Cakto Webhook] Evento ${eventUniqueId} já processado anteriormente. Ignorando.`);
      return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
    }

    // 5. Localiza o restaurante correspondente
    let restaurantId: string | null = null;
    let planIdFromSession: "essencial" | "pro" | null = null;
    let cycleFromSession: "monthly" | "annual" = "monthly";

    // Método primário: identificação via token de callback (?callback=uuid)
    if (data.callback) {
      const session = await getCheckoutSession(data.callback);
      if (session) {
        restaurantId = session.restaurantId;
        planIdFromSession = session.planId;
        cycleFromSession = session.cycle;
      }
    }

    // Método secundário: busca por e-mail do cliente caso o callback não tenha vindo
    if (!restaurantId && data.customer?.email) {
      const db = adminDb();
      const userSnap = await db
        .collection("usuarios")
        .where("email", "==", data.customer.email.toLowerCase().trim())
        .limit(1)
        .get();

      if (!userSnap.empty) {
        const userDoc = userSnap.docs[0];
        const restaurantIds = userDoc.data()?.restaurantIds as string[] | undefined;
        if (restaurantIds?.length) {
          restaurantId = restaurantIds[0];
        }
      }

      // Se ainda não encontrou, busca no restaurante pelo ownerId
      if (!restaurantId) {
        const restSnap = await db
          .collection("restaurantes")
          .where("ownerEmail", "==", data.customer.email.toLowerCase().trim())
          .limit(1)
          .get();

        if (!restSnap.empty) {
          restaurantId = restSnap.docs[0].id;
        }
      }
    }

    // Método terciário: busca por ID da assinatura já registrada previamente
    if (!restaurantId && data.subscription?.id) {
      const db = adminDb();
      const restSnap = await db
        .collection("restaurantes")
        .where("subscription.caktoSubscriptionId", "==", data.subscription.id)
        .limit(1)
        .get();

      if (!restSnap.empty) {
        restaurantId = restSnap.docs[0].id;
      }
    }

    if (!restaurantId) {
      console.warn(
        `[Cakto Webhook] Não foi possível vincular o evento ${event} (Pedido: ${data.id}) a nenhum restaurante cadastrado.`,
      );
      // Retorna 200 para evitar que a Cakto reenvie indefinidamente um evento órfão
      return NextResponse.json({ received: true, warning: "Restaurant not found" }, { status: 200 });
    }

    // 6. Roteamento e processamento por tipo de evento
    const nowIso = new Date().toISOString();
    const amountVal = typeof data.amount === "number" ? data.amount : Number(data.amount || 0);
    const amountFormatted = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(amountVal);

    switch (event) {
      // ─── Pagamento Aprovado (Primeira compra ou renovação) ───
      case "purchase_approved": {
        // Calcula término do período
        const periodDays = cycleFromSession === "annual" ? 365 : 30;
        const periodEnd = new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000).toISOString();

        await updateRestaurantSubscription(restaurantId, {
          status: "active",
          planId: planIdFromSession || "essencial",
          cycle: cycleFromSession,
          priceCents: Math.round(amountVal * 100),
          caktoSubscriptionId: data.subscription?.id || null,
          caktoOrderId: data.id || null,
          caktoOfferId: data.offer?.id || null,
          paymentMethod: data.paymentMethod || null,
          paymentMethodName: data.paymentMethodName || null,
          cardBrand: data.card?.brand || null,
          cardLastDigits: data.card?.lastDigits || null,
          currentPeriodStart: data.paidAt || nowIso,
          currentPeriodEnd: data.subscription?.next_payment_date || periodEnd,
          nextPaymentDate: data.subscription?.next_payment_date || periodEnd,
          canceledAt: null,
          lateSince: null,
        });

        // Adiciona ao histórico de pagamentos
        const paymentRecord: PaymentRecord = {
          id: data.id || `pay_${Date.now()}`,
          orderId: data.id || "",
          refId: data.refId || null,
          amount: amountVal,
          amountFormatted,
          status: "paid",
          paymentMethod: data.paymentMethod || "unknown",
          paymentMethodName: data.paymentMethodName || null,
          cardBrand: data.card?.brand || null,
          cardLastDigits: data.card?.lastDigits || null,
          paidAt: data.paidAt || nowIso,
          createdAt: data.createdAt || nowIso,
          checkoutUrl: data.checkoutUrl || null,
        };

        await addPaymentRecord(restaurantId, paymentRecord);
        console.info(`[Cakto Webhook] Assinatura ativada com sucesso para o restaurante ${restaurantId}.`);
        break;
      }

      // ─── Assinatura Criada ou Renovada ───
      case "subscription_created":
      case "subscription_renewed": {
        await updateRestaurantSubscription(restaurantId, {
          status: "active",
          caktoSubscriptionId: data.subscription?.id || null,
          nextPaymentDate: data.subscription?.next_payment_date || null,
          currentPeriodEnd: data.subscription?.next_payment_date || null,
          lateSince: null,
        });

        if (event === "subscription_renewed") {
          await addPaymentRecord(restaurantId, {
            id: data.id || `ren_${Date.now()}`,
            orderId: data.id || "",
            refId: data.refId || null,
            amount: amountVal,
            amountFormatted,
            status: "paid",
            paymentMethod: data.paymentMethod || "unknown",
            paymentMethodName: data.paymentMethodName || null,
            cardBrand: data.card?.brand || null,
            cardLastDigits: data.card?.lastDigits || null,
            paidAt: data.paidAt || nowIso,
            createdAt: nowIso,
          });
        }
        break;
      }

      // ─── Falha na Renovação Recorrente / Atraso ───
      case "subscription_renewal_refused":
      case "subscription_late": {
        await updateRestaurantSubscription(restaurantId, {
          status: "late",
          lateSince: nowIso,
        });
        console.warn(`[Cakto Webhook] Renovação falhou / atrasada para o restaurante ${restaurantId}.`);
        break;
      }

      // ─── Atraso Regularizado / Recuperado ───
      case "subscription_late_recovered":
      case "subscription_resumed": {
        await updateRestaurantSubscription(restaurantId, {
          status: "active",
          lateSince: null,
        });
        console.info(`[Cakto Webhook] Assinatura regularizada para o restaurante ${restaurantId}.`);
        break;
      }

      // ─── Assinatura Cancelada ───
      case "subscription_canceled": {
        await updateRestaurantSubscription(restaurantId, {
          status: "canceled",
          canceledAt: data.canceledAt || nowIso,
        });
        console.info(`[Cakto Webhook] Assinatura cancelada para o restaurante ${restaurantId}.`);
        break;
      }

      // ─── Reembolso ou Chargeback ───
      case "refund":
      case "chargeback": {
        if (data.id) {
          await addPaymentRecord(restaurantId, {
            id: `refund_${data.id}`,
            orderId: data.id,
            refId: data.refId || null,
            amount: amountVal,
            amountFormatted: `-${amountFormatted}`,
            status: "refunded",
            paymentMethod: data.paymentMethod || "unknown",
            paidAt: nowIso,
            createdAt: nowIso,
          });
        }
        await updateRestaurantSubscription(restaurantId, {
          status: "inactive",
        });
        break;
      }

      // ─── Pagamento Recusado ───
      case "purchase_refused": {
        if (data.id) {
          await addPaymentRecord(restaurantId, {
            id: data.id,
            orderId: data.id,
            refId: data.refId || null,
            amount: amountVal,
            amountFormatted,
            status: "refused",
            paymentMethod: data.paymentMethod || "unknown",
            createdAt: nowIso,
          });
        }
        break;
      }

      default:
        console.info(`[Cakto Webhook] Evento ${event} recebido sem ação necessária.`);
        break;
    }

    return NextResponse.json({ received: true, event }, { status: 200 });
  } catch (error: any) {
    console.error("[Cakto Webhook Processing Error]:", error);
    // Retorna 500 para acionar retentativa da Cakto em caso de falha crítica interna
    return NextResponse.json(
      { error: "Internal server error processing webhook" },
      { status: 500 },
    );
  }
}
