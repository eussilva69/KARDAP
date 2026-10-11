import { CAKTO_CONFIG } from "./config";
import { BillingCycle, PlanConfig, PlanId } from "./types";

export const PLANS: Record<PlanId, PlanConfig> = {
  essencial: {
    id: "essencial",
    name: "Essencial",
    tagline: "Para quem quer modernizar o atendimento e vender mais",
    description: "Cardápio digital completo com fotos, vídeos e chamados das mesas em tempo real.",
    popular: false,
    maxTables: 30,
    prices: {
      monthly: {
        cents: 4900, // R$ 49,00
        display: "R$ 49,00",
        periodLabel: "/mês",
        offerIdEnvKey: "CAKTO_OFFER_ESSENCIAL_MONTHLY",
      },
      annual: {
        cents: 47000, // R$ 470,00 (~R$ 39,16/mês)
        display: "R$ 470,00",
        equivalentMonthlyDisplay: "R$ 39,16",
        periodLabel: "/ano",
        discountPercent: 20,
        offerIdEnvKey: "CAKTO_OFFER_ESSENCIAL_ANNUAL",
      },
    },
    features: [
      "Cardápio digital interativo responsivo",
      "Vídeos curtos e fotos nos produtos",
      "QR Codes individuais por mesa",
      "Chamados das mesas em tempo real com alerta sonoro",
      "Avaliações no Google integradas ao cardápio",
      "Até 30 mesas cadastradas",
      "Impressão dos displays em folha A4",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "A experiência gastronômica completa para o seu salão",
    description: "Tudo do plano Essencial mais pedido de conta à mesa, relatórios avançados e marca própria.",
    popular: true,
    maxTables: null, // Ilimitado
    prices: {
      monthly: {
        cents: 9900, // R$ 99,00
        display: "R$ 99,00",
        periodLabel: "/mês",
        offerIdEnvKey: "CAKTO_OFFER_PRO_MONTHLY",
      },
      annual: {
        cents: 95000, // R$ 950,00 (~R$ 79,16/mês)
        display: "R$ 950,00",
        equivalentMonthlyDisplay: "R$ 79,16",
        periodLabel: "/ano",
        discountPercent: 20,
        offerIdEnvKey: "CAKTO_OFFER_PRO_ANNUAL",
      },
    },
    features: [
      "Tudo incluído no plano Essencial",
      "Mesas e produtos ilimitados",
      "Opção de pedir a conta diretamente pelo cardápio",
      "Relatórios de chamados, horários de pico e motivos",
      "Personalização avançada (logo e capa exclusiva)",
      "Suporte prioritário via WhatsApp",
    ],
  },
};

/**
 * Retorna o ID da oferta cadastrada na Cakto para o plano e ciclo especificados.
 */
export function getOfferIdForPlan(planId: PlanId, cycle: BillingCycle): string {
  if (planId === "essencial") {
    return cycle === "annual"
      ? CAKTO_CONFIG.offers.essencialAnnual
      : CAKTO_CONFIG.offers.essencialMonthly;
  }
  return cycle === "annual"
    ? CAKTO_CONFIG.offers.proAnnual
    : CAKTO_CONFIG.offers.proMonthly;
}

/**
 * Retorna o valor oficial do plano em centavos, validado pelo backend.
 */
export function getPlanPriceCents(planId: PlanId, cycle: BillingCycle): number {
  const plan = PLANS[planId] || PLANS.essencial;
  return cycle === "annual" ? plan.prices.annual.cents : plan.prices.monthly.cents;
}

/**
 * Verifica se um recurso é permitido pela assinatura atual do estabelecimento.
 * A regra fica em ./access.ts, que também roda no navegador (cardápio público e painel).
 */
export { canAccessFeature } from "./access";

/** Comparativo dos planos para a página pública de planos. Mantenha alinhado com PLANS acima. */
export const PLAN_COMPARISON: { label: string; essencial: string | boolean; pro: string | boolean }[] = [
  { label: "Cardápio digital com fotos e vídeos curtos", essencial: true, pro: true },
  { label: "QR Code individual por mesa", essencial: true, pro: true },
  { label: "Chamar garçom pelo cardápio", essencial: true, pro: true },
  { label: "Botão de avaliação no Google", essencial: true, pro: true },
  { label: "Mesas cadastradas", essencial: "Até 30", pro: "Ilimitadas" },
  { label: "Pedir a conta pelo cardápio", essencial: false, pro: true },
  { label: "Relatórios de chamados", essencial: false, pro: true },
  { label: "Suporte prioritário via WhatsApp", essencial: false, pro: true },
];
