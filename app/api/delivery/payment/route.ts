import type { NextRequest } from "next/server";
import { json, errorResponse, preflight, readJson } from "@/lib/billing/http";
import { BillingError } from "@/lib/billing/server";
import { adminDb } from "@/lib/firebase-admin";
import { rateLimit } from "@/lib/sso/server";

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
    const slug = String(body.slug || "");

    if (!restaurantId || !orderId || !paymentMethod) {
      throw new BillingError("invalid_params", 400, "Parâmetros obrigatórios ausentes.");
    }

    const orderRef = adminDb().collection("restaurantes").doc(restaurantId).collection("pedidos").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists || orderSnap.get("origin.source") !== "kardap_delivery") {
      throw new BillingError("not_found", 404, "Pedido não encontrado.");
    }
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
      "X-Idempotency-Key": `kardap_del_${orderId}_${paymentMethod}`,
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
        payment: { provider: "mercado_pago", paymentId: String(payment.id), status: "pending", method: "pix_online" },
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      return json(req, { type: "pix", paymentId: String(payment.id), qrCode, qrCodeBase64, expiresAt: payment.date_of_expiration });
    }

    if (paymentMethod === "cartao_online") {
      const origin = req.headers.get("origin") || `https://kardapp.online`;
      const base = `${origin}/r/${encodeURIComponent(slug)}/delivery`;
      const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
        method: "POST",
        headers,
        body: JSON.stringify({
          items: [{ title: description, quantity: 1, unit_price: totalBrl, currency_id: "BRL" }],
          metadata: { restaurant_id: restaurantId, order_id: orderId, origin: "kardap_delivery" },
          back_urls: {
            success: `${base}?pedido=${orderId}&pago=ok`,
            failure: `${base}?pedido=${orderId}&pago=erro`,
            pending: `${base}?pedido=${orderId}&pago=pendente`,
          },
          auto_return: "approved",
          notification_url: `${origin}/api/financial/webhook`,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as Record<string, unknown>;
        throw new BillingError("gateway_error", 502, String(err.message || "Não foi possível iniciar o pagamento."));
      }
      const preference = await res.json() as { id: string; init_point: string };

      await orderRef.set({
        payment: { provider: "mercado_pago", preferenceId: preference.id, status: "pending", method: "cartao_online" },
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      return json(req, { type: "checkout_pro", url: preference.init_point, preferenceId: preference.id });
    }

    throw new BillingError("invalid_payment_method", 400, "Método de pagamento online não suportado.");
  } catch (error) {
    return errorResponse(req, "delivery payment", error);
  }
}
