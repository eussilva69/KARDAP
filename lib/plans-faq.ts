import { TRIAL_DAYS } from "@/lib/billing/plans";

/**
 * Dúvidas frequentes da página de planos, respondidas com o que está nos Termos de Uso e no fluxo de assinatura.
 * Usadas na página (components/site/plans-page.tsx) e nos dados estruturados (FAQPage) da mesma página.
 */
export const PLANS_FAQ = [
  {
    q: "Como funciona o teste grátis?",
    a: `Ao criar a conta, o restaurante usa o plano Pro por ${TRIAL_DAYS} dias, sem cartão de crédito. Depois você escolhe o plano no painel, em Meu plano.`,
  },
  {
    q: "O que conta como pedido próprio?",
    a: "Os pedidos criados no KARDAP: PDV, mesa, delivery próprio, retirada e pedidos lançados pela equipe. Cada pedido confirmado conta uma vez, não importa quantos itens tenha. Rascunhos não contam.",
  },
  {
    q: "Pedidos do iFood e do 99Food contam no limite?",
    a: "Não. Pedidos de marketplaces nunca consomem a franquia mensal e continuam chegando normalmente mesmo quando o limite de pedidos próprios acaba. Eles aparecem no PDV e nos relatórios como qualquer pedido.",
  },
  {
    q: "O que acontece quando o limite de pedidos acaba?",
    a: "Só a confirmação de novos pedidos próprios para até a renovação, no dia 1º do mês seguinte, ou até um upgrade. PDV, caixa, estoque, relatórios, pedidos existentes e pedidos de marketplaces continuam funcionando.",
  },
  {
    q: "Posso trocar de plano depois?",
    a: "Sim, em Meu plano. O upgrade vale na hora e mantém o consumo do mês. A mudança para um plano menor vale no fim do período pago, e nenhum dado é apagado.",
  },
  {
    q: "Tem fidelidade?",
    a: "Não. Você cancela pelo painel quando quiser e continua com acesso até o fim do período já pago, sem multa.",
  },
  {
    q: "Quais formas de pagamento?",
    a: "Cartão de crédito, Pix Automático ou Pix a cada cobrança. Os pagamentos são processados pela Cakto; o KARDAP não guarda dados do cartão.",
  },
];
