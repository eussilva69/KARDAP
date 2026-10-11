/**
 * Configurações e variáveis de ambiente para a integração com a API Cakto.
 *
 * Todas as credenciais confidenciais (client_secret, webhook_secret)
 * são lidas estritamente no ambiente do servidor (Node.js runtime).
 */

export const CAKTO_CONFIG = {
  // URLs da API e Checkout
  baseUrl: process.env.CAKTO_BASE_URL?.trim() || "https://api.cakto.com.br",
  payBaseUrl: process.env.CAKTO_PAY_BASE_URL?.trim() || "https://pay.cakto.com.br",

  // Credenciais OAuth2
  clientId: process.env.CAKTO_CLIENT_ID?.trim() || "",
  clientSecret: process.env.CAKTO_CLIENT_SECRET?.trim() || "",

  // Segredo de validação HMAC-SHA256 do Webhook
  webhookSecret: process.env.CAKTO_WEBHOOK_SECRET?.trim() || "",

  // Mapeamento de IDs de ofertas cadastradas na Cakto
  offers: {
    essencialMonthly: process.env.CAKTO_OFFER_ESSENCIAL_MONTHLY?.trim() || "kardap-essencial-mensal",
    essencialAnnual: process.env.CAKTO_OFFER_ESSENCIAL_ANNUAL?.trim() || "kardap-essencial-anual",
    proMonthly: process.env.CAKTO_OFFER_PRO_MONTHLY?.trim() || "kardap-pro-mensal",
    proAnnual: process.env.CAKTO_OFFER_PRO_ANNUAL?.trim() || "kardap-pro-anual",
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
