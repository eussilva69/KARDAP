/**
 * Planos contratáveis pela Cakto. Preços, limites e recursos vêm do catálogo único (lib/billing/plans.ts);
 * aqui fica só a ligação de cada plano com a oferta cadastrada na Cakto.
 */
import { PLAN_CATALOG, type PlanId } from "../billing/plans";
import { CAKTO_CONFIG } from "./config";

/** Planos com checkout automático. O Enterprise é contratado com o time comercial. */
export type CheckoutPlanId = Exclude<PlanId, "enterprise">;
export const CHECKOUT_PLANS: CheckoutPlanId[] = ["start", "pro", "business"];
export const isCheckoutPlan = (value: unknown): value is CheckoutPlanId => typeof value === "string" && (CHECKOUT_PLANS as string[]).indexOf(value) >= 0;

/** Oferta da Cakto do plano, ou "" quando ainda não foi configurada (o checkout fica indisponível). */
export function getOfferIdForPlan(planId: CheckoutPlanId): string {
  return CAKTO_CONFIG.offers[planId] || "";
}

/** Valor oficial do plano em centavos, validado no servidor. */
export function getPlanPriceCents(planId: CheckoutPlanId): number {
  return PLAN_CATALOG[planId].priceInCents ?? 0;
}

/**
 * Plano correspondente a uma oferta recebida no webhook. Planos atuais primeiro; depois os anteriores
 * (renovações de quem assinou o Essencial ou o Pro antigo). null = oferta desconhecida.
 */
export function planForOffer(offerId: string | null | undefined): { planId: string; legacy: boolean } | null {
  if (!offerId) return null;
  for (const id of CHECKOUT_PLANS) if (CAKTO_CONFIG.offers[id] && CAKTO_CONFIG.offers[id] === offerId) return { planId: id, legacy: false };
  if (CAKTO_CONFIG.legacyOffers.essencial.indexOf(offerId) >= 0) return { planId: "essencial", legacy: true };
  if (CAKTO_CONFIG.legacyOffers.pro.indexOf(offerId) >= 0) return { planId: "pro", legacy: true };
  return null;
}
