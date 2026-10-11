import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { CAKTO_CONFIG } from "@/lib/cakto/config";
import { getOfferIdForPlan, getPlanPriceCents, PLANS } from "@/lib/cakto/plans";
import { createCheckoutSession } from "@/lib/cakto/server-db";
import { BillingCycle, PlanId } from "@/lib/cakto/types";

export async function POST(request: NextRequest) {
  // 1. Autenticação do usuário autenticado no Firebase
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");

  if (!token) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    let decodedUser: { uid: string; email?: string; name?: string };
    try {
      decodedUser = await adminAuth().verifyIdToken(token);
    } catch {
      return NextResponse.json(
        { error: "Sessão inválida ou expirada. Faça login novamente." },
        { status: 401 },
      );
    }

    // 2. Leitura e validação dos parâmetros da requisição
    const body = await request.json();
    const { planId, cycle, restaurantId } = body as {
      planId?: PlanId;
      cycle?: BillingCycle;
      restaurantId?: string;
    };

    if (!restaurantId || typeof restaurantId !== "string") {
      return NextResponse.json(
        { error: "Identificador do estabelecimento é obrigatório." },
        { status: 400 },
      );
    }

    if (planId !== "essencial" && planId !== "pro") {
      return NextResponse.json(
        { error: "Plano inválido. Escolha 'essencial' ou 'pro'." },
        { status: 400 },
      );
    }

    const billingCycle: BillingCycle = cycle === "annual" ? "annual" : "monthly";

    // 3. Validação de permissão do usuário no restaurante
    const db = adminDb();
    const restaurantDoc = await db.collection("restaurantes").doc(restaurantId).get();

    if (!restaurantDoc.exists) {
      return NextResponse.json({ error: "Estabelecimento não encontrado." }, { status: 404 });
    }

    const restaurantData = restaurantDoc.data();
    const isOwner = restaurantData?.ownerId === decodedUser.uid;

    if (!isOwner) {
      // Verifica na subcoleção de membros
      const memberDoc = await db
        .collection("restaurantes")
        .doc(restaurantId)
        .collection("membros")
        .doc(decodedUser.uid)
        .get();

      if (!memberDoc.exists) {
        return NextResponse.json(
          { error: "Você não tem permissão para gerenciar a assinatura deste restaurante." },
          { status: 403 },
        );
      }
    }

    // 4. Determina o valor do plano e o ID da oferta correspondente na Cakto
    const priceCents = getPlanPriceCents(planId, billingCycle);
    const offerId = getOfferIdForPlan(planId, billingCycle);
    const planConfig = PLANS[planId];

    // 5. Gera um token opaco único para correlacionar o comprador (callback pós-pagamento)
    // O token é transmitido na URL como ?callback=<token>
    const sessionToken = crypto.randomUUID();

    await createCheckoutSession({
      token: sessionToken,
      restaurantId,
      userId: decodedUser.uid,
      planId,
      cycle: billingCycle,
      userEmail: decodedUser.email,
    });

    // 6. Monta a URL de contratação do checkout oficial da Cakto
    const checkoutParams = new URLSearchParams();
    checkoutParams.set("callback", sessionToken);

    if (decodedUser.email) {
      checkoutParams.set("email", decodedUser.email);
    }
    if (decodedUser.name || restaurantData?.name) {
      checkoutParams.set("name", decodedUser.name || restaurantData?.name || "");
    }

    const checkoutUrl = `${CAKTO_CONFIG.payBaseUrl}/${encodeURIComponent(offerId)}?${checkoutParams.toString()}`;

    return NextResponse.json({
      success: true,
      checkoutUrl,
      sessionToken,
      plan: {
        id: planId,
        name: planConfig.name,
        cycle: billingCycle,
        priceCents,
        displayPrice: billingCycle === "annual" ? planConfig.prices.annual.display : planConfig.prices.monthly.display,
      },
    });
  } catch (error: any) {
    console.error("[Cakto Checkout Initiation Error]:", error);
    return NextResponse.json(
      { error: "Ocorreu um erro interno ao iniciar a contratação. Tente novamente." },
      { status: 500 },
    );
  }
}
