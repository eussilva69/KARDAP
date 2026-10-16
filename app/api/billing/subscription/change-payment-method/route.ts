import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/billing/access";
import { caktoChangePaymentMethod, CaktoError } from "@/lib/billing/cakto";
import { getUserSubscription } from "@/lib/billing/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["credit_card", "pix", "pix_auto"]);

export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requireAuth(request.headers.get("authorization"));
  } catch (res) {
    return res as Response;
  }
  const body = await request.json().catch(() => ({}));
  const method = typeof body.paymentMethod === "string" ? body.paymentMethod : "";
  if (!ALLOWED.has(method)) {
    return NextResponse.json({ error: "Método de pagamento não suportado" }, { status: 400 });
  }
  const sub = await getUserSubscription(user.uid);
  if (!sub || !sub.caktoSubscriptionId) {
    return NextResponse.json({ error: "Nenhuma assinatura encontrada." }, { status: 404 });
  }
  try {
    const result = await caktoChangePaymentMethod(sub.caktoSubscriptionId, method);
    return NextResponse.json({ ok: true, detail: result.detail });
  } catch (err) {
    if (err instanceof CaktoError) {
      return NextResponse.json({ error: "Falha ao atualizar método de pagamento" }, { status: 502 });
    }
    return NextResponse.json({ error: "Falha ao atualizar método de pagamento" }, { status: 500 });
  }
}
