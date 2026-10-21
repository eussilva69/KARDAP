/** Webhook Mercado Pago exclusivo para pagamentos online de delivery. */
import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { json, errorResponse, preflight } from "@/lib/billing/http";
import { BillingError } from "@/lib/billing/server";
import { adminDb } from "@/lib/firebase-admin";
import { processPaymentWebhook, settleTransaction } from "@/lib/financial/server";
import { activateDeliveryOrder } from "@/lib/delivery/server";
import { mercadoPagoStatus } from "@/lib/delivery/checkout-lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

type MercadoPagoPayment = { status?: string; status_detail?: string; transaction_amount?: number; date_approved?: string; date_created?: string; metadata?: Record<string, unknown>; fee_details?: Array<{ amount?: number }> };

function signatureParts(header: string) {
  const parts: Record<string, string> = {};
  for (const entry of header.split(",")) {
    const [key, value] = entry.trim().split("=", 2);
    if (key && value) parts[key] = value;
  }
  return parts;
}

/** Formato oficial: id:[data.id];request-id:[...];ts:[...]; */
function validMercadoPagoSignature(req: NextRequest, paymentId: string, secret: string): boolean {
  const signature = signatureParts(req.headers.get("x-signature") || "");
  const requestId = req.headers.get("x-request-id") || "";
  if (!secret || !signature.ts || !signature.v1 || !requestId || !paymentId) return false;
  const manifest = `id:${paymentId.toLowerCase()};request-id:${requestId};ts:${signature.ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  if (expected.length !== signature.v1.length) return false;
  return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(signature.v1, "utf8"));
}

function paymentIdFrom(req: NextRequest, body: Record<string, unknown>) {
  const queryId = new URL(req.url).searchParams.get("data.id");
  const data = body.data && typeof body.data === "object" ? (body.data as Record<string, unknown>) : {};
  const id = queryId || data.id || body.payment_id;
  return typeof id === "string" || typeof id === "number" ? String(id) : "";
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) throw new BillingError("invalid_webhook", 400, "Payload inválido.");
    if (body.type !== "payment") return json(req, { ok: true, ignored: "unsupported_topic" });

    const paymentId = paymentIdFrom(req, body);
    if (!validMercadoPagoSignature(req, paymentId, process.env.MERCADO_PAGO_WEBHOOK_SECRET || "")) {
      throw new BillingError("invalid_signature", 401, "Assinatura do Mercado Pago inválida.");
    }
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!accessToken) throw new BillingError("gateway_not_configured", 503, "Gateway de pagamentos não configurado.");
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    if (!response.ok) throw new BillingError("gateway_lookup_failed", 502, "Não foi possível confirmar o pagamento no Mercado Pago.");
    const payment = (await response.json()) as MercadoPagoPayment;
    const metadata = payment.metadata && typeof payment.metadata === "object" ? payment.metadata : {};
    const restaurantId = typeof metadata.restaurant_id === "string" ? metadata.restaurant_id : "";
    const orderId = typeof metadata.order_id === "string" ? metadata.order_id : "";
    if (!restaurantId || !orderId || metadata.origin !== "kardap_delivery") return json(req, { ok: true, ignored: "not_delivery_payment" });

    const orderRef = adminDb().collection("restaurantes").doc(restaurantId).collection("pedidos").doc(orderId);
    const order = await orderRef.get();
    if (!order.exists || order.get("origin.source") !== "kardap_delivery") return json(req, { ok: true, ignored: "unknown_delivery_order" });
    const receivedCents = Math.round(Number(payment.transaction_amount || 0) * 100);
    if (!Number.isSafeInteger(receivedCents) || receivedCents <= 0 || receivedCents !== Number(order.get("totalCents"))) {
      throw new BillingError("payment_amount_mismatch", 409, "O valor confirmado pelo gateway não corresponde ao pedido.");
    }

    const action = typeof body.action === "string" ? body.action : "payment.updated";
    const signature = signatureParts(req.headers.get("x-signature") || "");
    const eventId = `mp_${paymentId}_${(signature.ts || "event").replace(/[^a-zA-Z0-9_-]/g, "")}_${action.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    const eventRef = adminDb().collection("webhook_events").doc(eventId);
    if ((await eventRef.get()).exists) return json(req, { ok: true, duplicate: true });

    const status = mercadoPagoStatus(payment.status);
    const result = await processPaymentWebhook({ event: action, payment_id: paymentId, order_id: orderId, restaurant_id: restaurantId, gateway: "mercado_pago", gross_amount_cents: receivedCents, gateway_fee_cents: payment.fee_details?.reduce((sum, fee) => sum + Math.round(Number(fee.amount || 0) * 100), 0), status, timestamp: String(payment.date_approved || payment.date_created || new Date().toISOString()) });
    if (status === "aprovado" && result.transaction_id) await settleTransaction(result.transaction_id);
    const paymentStatus = status === "aprovado" ? "pago" : status === "recusado" ? "recusado" : status === "cancelado" ? "cancelado" : status === "estornado" || status === "chargeback" ? "estornado" : "pendente";
    await orderRef.set({ paymentStatus, payment: { provider: "mercado_pago", paymentId, status: String(payment.status || "pending"), statusDetail: payment.status_detail || null, amountCents: receivedCents, updatedAt: new Date().toISOString() }, updatedAt: new Date().toISOString() }, { merge: true });
    if (status === "aprovado") await activateDeliveryOrder(restaurantId, orderId);
    await eventRef.set({ provider: "mercado_pago", payment_id: paymentId, restaurant_id: restaurantId, order_id: orderId, action, processed_at: new Date().toISOString() });
    return json(req, { ok: true, ...result });
  } catch (error) {
    return errorResponse(req, "mercado pago delivery webhook", error);
  }
}
