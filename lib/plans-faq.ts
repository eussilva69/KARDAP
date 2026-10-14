import { TRIAL_DAYS } from "@/lib/cakto/access";

/**
 * Dúvidas frequentes da página de planos, respondidas com o que já está nos Termos de Uso e no fluxo de assinatura.
 * Usadas na página (components/site/plans-page.tsx) e nos dados estruturados (FAQPage) da mesma página.
 */
export const PLANS_FAQ = [
  {
    q: "Como funciona o teste grátis?",
    a: `Ao criar a conta, o restaurante usa tudo do plano Pro por ${TRIAL_DAYS} dias, sem cartão de crédito. Depois você escolhe o plano no painel, em Assinatura.`,
  },
  {
    q: "Tem fidelidade?",
    a: "Não. Você cancela pelo painel quando quiser e continua com acesso até o fim do período já pago, sem multa.",
  },
  {
    q: "Quais formas de pagamento?",
    a: "Cartão de crédito, Pix Automático ou Pix a cada cobrança. Os pagamentos são processados pela Cakto; o Kardap não guarda dados do cartão.",
  },
  {
    q: "Posso trocar de plano depois?",
    a: "Sim. Em Assinatura, no painel, você contrata o outro plano a qualquer momento.",
  },
];
