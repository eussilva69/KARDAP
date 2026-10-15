import type { NextRequest } from "next/server";
import { authenticate, errorResponse, json, preflight, readJson } from "@/lib/billing/http";
import { activateSelfServiceTrial } from "@/lib/billing/server";
import { rateLimit } from "@/lib/sso/server";

/**
 * Ativa o teste grátis de 30 dias do plano escolhido no cadastro (docs/PLANOS.md, "Teste grátis").
 * Corpo: { restaurantId, planId }. Chamado pelo onboarding só depois que ele termina com sucesso: quem decide
 * quando chamar é o navegador, mas a data de início e o prazo de 30 dias são sempre calculados aqui, no servidor.
 * Idempotente: repetir a chamada para o mesmo estabelecimento não estende nem reinicia o teste.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

export async function POST(req: NextRequest) {
  try {
    const body = await readJson(req);
    const caller = await authenticate(req, body);
    rateLimit(req, "billing-activate-trial", 20, 60_000, caller.uid);
    const result = await activateSelfServiceTrial(String(body.restaurantId || ""), caller.uid, body.planId);
    return json(req, result, result.activated ? 201 : 200);
  } catch (error) {
    return errorResponse(req, "activate-trial", error);
  }
}
