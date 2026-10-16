# Integração Cakto — Assinaturas Kardap

Documento operacional da integração com a Cakto para cobranças recorrentes.
A referência oficial é https://docs.cakto.com.br.

## Arquitetura

- **Autenticação Cakto**: OAuth2 client credentials (`POST /public_api/token/`).
  Token com validade de ~10h, cacheado em memória do processo com renovação
  antecipada em 60s. Sem endpoint de refresh — pedimos um novo quando expira.
- **Checkout**: hospedado pela Cakto, URL `https://pay.cakto.com.br/{offerId}`.
  Nunca armazenamos cartão. O backend decide o `offerId` com base no plano e
  periodicidade escolhidos; preços enviados pelo navegador são descartados.
- **Recorrência**: gerenciada pela Cakto (cartão recorrente ou Pix Automático,
  conforme configuração da oferta no painel). Não criamos cron para cobrar.
- **Webhook**: `POST /api/billing/webhook` valida HMAC-SHA256 em
  `X-Cakto-Signature: v1=<hex>` sobre `{X-Cakto-Timestamp}.{raw body}`, com
  tolerância de 5 min. Fallback: `secret` no corpo (menos seguro).
- **Idempotência**: cada evento gera uma chave `evento:id` armazenada em
  `usuarios/{uid}/assinatura/current/eventos/{eventId}` dentro de uma transação.
- **Reconciliação**: para `subscription_created` e `subscription_renewed`,
  consultamos `GET /subscriptions/{id}/` e sobrescrevemos status/próxima
  cobrança/valor com o estado real.
- **Acesso**: `lib/billing/access.ts#requirePaidAccess` libera recursos pagos
  somente para `active`, `trial`, ou `canceled` com `currentPeriodEnd` futuro.

## Arquivos criados

```
lib/billing/
  cakto.ts              # cliente OAuth2 + HMAC + endpoints Cakto
  plans.ts              # catálogo de planos no backend (fonte de verdade)
  subscriptions.ts      # Firestore (admin) + idempotência + índices
  events.ts             # mapa de eventos → status
  access.ts             # requireAuth / requirePaidAccess

app/api/billing/
  plans/route.ts                                 GET  — catálogo público
  checkout/route.ts                              POST — inicia contratação
  subscription/route.ts                          GET  — assinatura + pagamentos
  subscription/cancel/route.ts                   POST — cancela via Cakto
  subscription/change-payment-method/route.ts    POST — altera método
  webhook/route.ts                               POST — recebe eventos Cakto

app/planos/page.tsx                              Tela de planos
app/assinatura/page.tsx                          Página “Minha Assinatura”
components/billing/plans-client.tsx
components/billing/subscription-client.tsx
```

## Variáveis de ambiente (ver `.env.example`)

- `CAKTO_CLIENT_ID`, `CAKTO_CLIENT_SECRET` — gerar em
  https://app.cakto.com.br/dashboard/cakto-api. O `client_secret` só é
  exibido no momento da criação da chave.
- `CAKTO_WEBHOOK_SECRET` — segredo do webhook configurado no painel para a
  URL `https://SEU_DOMINIO/api/billing/webhook`.
- `CAKTO_OFFER_<PLANO>_<MENSAL|ANUAL>` — IDs das ofertas criadas no painel.
  Uma oferta por combinação plano × periodicidade. Deixar vazio esconde a
  opção na UI.
- `CAKTO_API_BASE_URL`, `CAKTO_CHECKOUT_BASE_URL` — opcionais, só para testes.

## Passo a passo para colocar em produção

1. **No painel Cakto**:
   - Em *API*, gere um client credentials com os scopes
     `read subscriptions write subscriptions read offers read products
     read orders`.
   - Em *Produtos*, crie um produto de assinatura por plano (Starter, Pro,
     Scale). Em cada produto crie duas *ofertas*: mensal e anual, com
     `type = subscription`, `recurrence_period` adequado (30 ou 365) e
     `quantity_recurrences = -1` para recorrência indeterminada.
   - Copie o `offerId` de cada oferta para as variáveis `CAKTO_OFFER_*`.
   - Em *Webhooks*, cadastre a URL `https://SEU_DOMINIO/api/billing/webhook`
     e marque todos os eventos de assinatura (`subscription_*`) além de
     `purchase_approved`, `purchase_refused`, `refund`, `chargeback`.
     Copie o segredo para `CAKTO_WEBHOOK_SECRET`.
2. **No servidor**: preencha o `.env` e reinicie o processo.
3. **Teste em sandbox**: inicie um checkout com cartão de teste da Cakto,
   confirme a chegada do webhook e o `active` em `/assinatura`.
4. **Produção**: use o painel real da Cakto. Nenhum código muda — apenas
   as credenciais e os IDs de oferta.

## Eventos tratados

| Evento Cakto | Transição |
|---|---|
| `subscription_created` | `active` + reconciliação |
| `subscription_renewed` | `active` + reconciliação |
| `subscription_renewal_refused` | `past_due` |
| `subscription_paused` | `paused` |
| `subscription_resumed` | `active` |
| `subscription_late` | `past_due` |
| `subscription_late_recovered` | `active` |
| `subscription_canceled` | `canceled` + `canceledAt` |
| `purchase_approved` | registra pagamento, promove `active` |
| `purchase_refused` | registra pagamento recusado, `past_due` |
| `refund` / `chargeback` | registra evento, cancela |

Eventos sem correspondência no catálogo (`offerId` desconhecido) são
registrados com `skipped: user_not_found` e retornam 200 para não bloquear a
fila de reentregas da Cakto.

## Correlação evento → usuário

1. `data.subscription.id` em `indices/cakto_subscription/map/{id}` (preferido).
2. Fallback: `data.customer.email` em `indices/cakto_customer_email/map/{email}`
   (populado no `POST /api/billing/checkout`).

O e-mail cadastrado no SaaS **precisa** ser o mesmo informado no checkout
da Cakto. O pré-preenchimento é feito via query param `?email=`.

## Segurança

- Credenciais apenas no servidor (`CAKTO_CLIENT_*`, `CAKTO_WEBHOOK_SECRET`).
- Preços lidos do catálogo no backend; o browser nunca escolhe valor.
- Webhook valida HMAC em tempo constante (`timingSafeEqual`) e exige
  timestamp dentro de 5 min.
- Idempotência via transação Firestore no documento de eventos.
- Nenhum número de cartão ou CVV passa pelo nosso backend (checkout Cakto).
- Logs técnicos sem credenciais (`console.error("[cakto]", { status })`).

## O que ainda depende de você

- Criar as ofertas no painel Cakto e preencher os `CAKTO_OFFER_*`.
- Ajustar os preços exibidos (`lib/billing/plans.ts → priceCents`) para
  bater com o painel; os valores atuais são placeholders.
- Decidir carência da política de inadimplência (`past_due`): hoje o
  acesso é cortado imediatamente. Se quiser carência, adicione uma regra
  em `hasPaidAccess` baseada em `lastEventAt`.
- Testes end-to-end com cartão real exigem autorização sua.

## Verificações rodadas aqui

- `npx tsc --noEmit` — sem erros.
- Testes automatizados não existem no projeto; nenhum foi adicionado.
- `next build` **não** foi executado para evitar colidir com o dev server
  (ambos usam `.next`); rode manualmente após parar o dev.
