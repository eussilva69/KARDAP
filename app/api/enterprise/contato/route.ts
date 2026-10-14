import type { NextRequest } from "next/server";
import { errorResponse, json, readJson } from "@/lib/billing/http";
import { BillingError } from "@/lib/billing/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { rateLimit } from "@/lib/sso/server";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/**
 * Pedido de proposta do Enterprise (página de preços e Meu Plano). Fica em propostasEnterprise para o time comercial
 * (lista na administração). Nunca cria assinatura: o Enterprise só é ativado por um administrador, com registro.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    rateLimit(req, "enterprise-contact", 5, 60 * 60_000);
    const body = await readJson(req);
    // Campo invisível para pessoas: preenchido, é robô.
    if (text(body.website, 200)) return json(req, { received: true }, 202);
    const name = text(body.name, 120);
    const email = text(body.email, 160).toLowerCase();
    const company = text(body.company, 160);
    if (name.length < 2 || !EMAIL.test(email) || company.length < 2) throw new BillingError("invalid", 400, "Preencha nome, e-mail e empresa.");
    let uid: string | null = null;
    const header = req.headers.get("authorization") || "";
    if (/^Bearer\s+/i.test(header)) uid = await adminAuth().verifyIdToken(header.slice(7)).then((d) => d.uid).catch(() => null);
    const ref = await adminDb().collection("propostasEnterprise").add({
      name,
      email,
      company,
      phone: text(body.phone, 40),
      units: text(body.units, 40),
      monthlyOrders: text(body.monthlyOrders, 40),
      message: text(body.message, 2000),
      restaurantId: text(body.restaurantId, 128) || null,
      uid,
      status: "nova",
      createdAt: new Date().toISOString(),
    });
    return json(req, { received: true, id: ref.id }, 201);
  } catch (error) {
    return errorResponse(req, "enterprise", error);
  }
}
