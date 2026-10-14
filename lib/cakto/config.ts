/**
 * Configurações e variáveis de ambiente para a integração com a API Cakto.
 *
 * Todas as credenciais confidenciais (client_secret, webhook_secret)
 * são lidas estritamente no ambiente do servidor (Node.js runtime).
 */

const env = (name: string) => process.env[name]?.trim() || "";

export const CAKTO_CONFIG = {
  // URLs da API e Checkout
  baseUrl: env("CAKTO_BASE_URL") || "https://api.cakto.com.br",
  payBaseUrl: env("CAKTO_PAY_BASE_URL") || "https://pay.cakto.com.br",

  // Credenciais OAuth2
  clientId: env("CAKTO_CLIENT_ID"),
  clientSecret: env("CAKTO_CLIENT_SECRET"),

  // Segredo de validação HMAC-SHA256 do Webhook
  webhookSecret: env("CAKTO_WEBHOOK_SECRET"),

  /**
   * Ofertas mensais dos planos atuais (docs/PLANOS.md). Sem a variável, o plano não abre checkout: nunca há
   * um identificador inventado. O Enterprise não tem oferta: é contratado com o time comercial.
   */
  offers: {
    start: env("CAKTO_OFFER_START"),
    pro: env("CAKTO_OFFER_PRO"),
    business: env("CAKTO_OFFER_BUSINESS"),
  },

  /** Ofertas dos planos anteriores: só para reconhecer renovações de quem já assinava. */
  legacyOffers: {
    essencial: [env("CAKTO_OFFER_ESSENCIAL_MONTHLY"), env("CAKTO_OFFER_ESSENCIAL_ANNUAL")].filter(Boolean),
    pro: [env("CAKTO_OFFER_PRO_MONTHLY"), env("CAKTO_OFFER_PRO_ANNUAL")].filter(Boolean),
  },

  // Período de teste inicial para novos estabelecimentos (15 dias)
  trialDays: 15,

  // Dias de carência para inadimplência antes de bloqueio
  gracePeriodDays: 3,

  // Timeout padrão para chamadas à API da Cakto (em milissegundos)
  requestTimeoutMs: 8000,
};

export function isCaktoConfigured(): boolean {
  return Boolean(CAKTO_CONFIG.clientId && CAKTO_CONFIG.clientSecret);
}

export function isWebhookConfigured(): boolean {
  return Boolean(CAKTO_CONFIG.webhookSecret);
}

/**
 * Webhook sem segredo só é aceito nos testes com os emuladores (projeto demo-*, que nunca toca serviços reais).
 * Em qualquer outro ambiente, sem CAKTO_WEBHOOK_SECRET nenhum evento é processado: ninguém ativa um plano
 * mandando um evento falso.
 */
export function unsignedWebhooksAllowed(): boolean {
  const project = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "";
  return Boolean(process.env.FIRESTORE_EMULATOR_HOST) && project.startsWith("demo-") && process.env.CAKTO_WEBHOOK_ALLOW_UNSIGNED === "1";
}
