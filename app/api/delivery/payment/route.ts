import type { NextRequest } from "next/server";
import { json, errorResponse, preflight, readJson } from "@/lib/billing/http";
import { BillingError } from "@/lib/billing/server";
import { adminDb } from "@/lib/firebase-admin";
import { rateLimit } from "@/lib/sso/server";
import { activateDeliveryOrder } from "@/lib/delivery/server";
import { mercadoPagoIdempotencyKey } from "@/lib/delivery/checkout-lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * POST /api/delivery/payment
 * Cria um pagamento Mercado Pago para um pedido de delivery já criado.
 * - pix_online  → retorna QR code para exibir na tela
 * - cartao_online → cria preference do Checkout Pro e retorna URL de redirect
 */
export async function POST(req: NextRequest) {
  try {
    const body = await readJson(req);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    rateLimit(req, "delivery-payment", 10, 60_000, ip);

    const restaurantId = String(body.restaurantId || "");
    const orderId = String(body.orderId || "");
    const paymentMethod = String(body.paymentMethod || "");

    if (!restaurantId || !orderId || !paymentMethod) {
      throw new BillingError("invalid_params", 400, "Parâmetros obrigatórios ausentes.");
    }

    const orderRef = adminDb().collection("restaurantes").doc(restaurantId).collection("pedidos").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists || orderSnap.get("origin.source") !== "kardap_delivery") {
      throw new BillingError("not_found", 404, "Pedido não encontrado.");
    }
    if (orderSnap.get("paymentMethod") !== paymentMethod) throw new BillingError("payment_method_mismatch", 409, "A forma de pagamento não corresponde ao checkout confirmado.");
    if (orderSnap.get("paymentStatus") === "pago") {
      return json(req, { alreadyPaid: true });
    }

    const totalCents = Number(orderSnap.get("totalCents") || 0);
    if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
      throw new BillingError("invalid_order", 400, "Valor do pedido inválido.");
    }
    const totalBrl = totalCents / 100;
    const orderNumber = Number(orderSnap.get("orderNumber") || 0);
    const restaurantName = String(body.restaurantName || "Restaurante");
    const description = `Pedido #${String(orderNumber).padStart(3, "0")} · ${restaurantName}`;

    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!accessToken) throw new BillingError("gateway_not_configured", 503, "Gateway de pagamentos não configurado.");

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": mercadoPagoIdempotencyKey(orderId, paymentMethod),
    };

    if (paymentMethod === "pix_online") {
      const customerName = String(orderSnap.get("customer.name") || "Cliente");
      const [firstName, ...rest] = customerName.split(" ");
      const res = await fetch("https://api.mercadopago.com/v1/payments", {
        method: "POST",
        headers,
        body: JSON.stringify({
          transaction_amount: totalBrl,
          payment_method_id: "pix",
          payer: { email: "cliente@kardap.delivery", first_name: firstName, last_name: rest.join(" ") || "KARDAP" },
          description,
          date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          metadata: { restaurant_id: restaurantId, order_id: orderId, origin: "kardap_delivery" },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as Record<string, unknown>;
        throw new BillingError("gateway_error", 502, String(err.message || "Não foi possível gerar o PIX."));
      }
      const payment = await res.json() as {
        id: number;
        point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string } };
        date_of_expiration?: string;
      };
      const qrCode = payment.point_of_interaction?.transaction_data?.qr_code || "";
      const qrCodeBase64 = payment.point_of_interaction?.transaction_data?.qr_code_base64 || "";
      if (!qrCode) throw new BillingError("gateway_error", 502, "QR code PIX não retornado pelo gateway.");

      await orderRef.set({
        paymentStatus: "pendente",
        payment: { provider: "mercado_pago", paymentId: String(payment.id), status: "pending", method: "pix_online", qrCode, qrCodeBase64, expiresAt: payment.date_of_expiration || null },
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      return json(req, { type: "pix", paymentId: String(payment.id), qrCode, qrCodeBase64, expiresAt: payment.date_of_expiration });
    }

    if (paymentMethod === "cartao_online") {
      const card = body.card && typeof body.card === "object" ? body.card as Record<string, unknown> : {};
      const token = typeof card.token === "string" ? card.token : "";
      const paymentMethodId = typeof card.payment_method_id === "string" ? card.payment_method_id : "";
      const installments = Math.max(1, Math.min(24, Math.floor(Number(card.installments) || 1)));
      const payer = card.payer && typeof card.payer === "object" ? card.payer as Record<string, unknown> : {};
      const email = typeof payer.email === "string" ? payer.email.trim().slice(0, 200) : "";
      if (!token || !paymentMethodId || !email) throw new BillingError("invalid_card_data", 400, "Dados do cartão incompletos.");
      const cardResponse = await fetch("https://api.mercadopago.com/v1/payments", {
        method: "POST",
        headers,
        body: JSON.stringify({ transaction_amount: totalBrl, token, description, installments, payment_method_id: paymentMethodId, issuer_id: card.issuer_id ? String(card.issuer_id) : undefined, payer: { email, identification: payer.identification && typeof payer.identification === "object" ? payer.identification : undefined }, metadata: { restaurant_id: restaurantId, order_id: orderId, origin: "kardap_delivery" } }),
      });
      if (!cardResponse.ok) {
        const err = await cardResponse.json().catch(() => ({})) as Record<string, unknown>;
        throw new BillingError("gateway_error", 502, String(err.message || "Não foi possível processar o cartão."));
      }
      const cardPayment = await cardResponse.json() as { id: number; status?: string; status_detail?: string };
      const approved = cardPayment.status === "approved";
      const rejected = cardPayment.status === "rejected";
      await orderRef.set({ paymentStatus: approved ? "pago" : rejected ? "recusado" : "pendente", payment: { provider: "mercado_pago", paymentId: String(cardPayment.id), status: cardPayment.status || "pending", statusDetail: cardPayment.status_detail || null, method: "cartao_online" }, updatedAt: new Date().toISOString() }, { merge: true });
      if (approved) await activateDeliveryOrder(restaurantId, orderId, "payment_api");
      return json(req, { type: "card", paymentId: String(cardPayment.id), status: cardPayment.status || "pending", statusDetail: cardPayment.status_detail || null });
    }

    throw new BillingError("invalid_payment_method", 400, "Método de pagamento online não suportado.");
  } catch (error) {
    return errorResponse(req, "delivery payment", error);
  }
}
