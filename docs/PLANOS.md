# Planos, assinaturas e limites

Este documento descreve como o KARDAP vende, cobra e controla os planos, e como o PDV (`pdv.kardapp.online`) usa a mesma
fonte de verdade.

Tudo que limita uma operação é decidido no servidor do KARDAP (`kardapp.online`). As telas só mostram o estado.

## Planos

| Plano | Preço | Mesas | Pedidos próprios/mês | PDV | Destaques |
| --- | --- | --- | --- | --- | --- |
| **KARDAP Start** | R$ 49,90/mês | até 8 | — (indisponível) | não | cardápio em vídeo estilo Reels, QR Code, cores e logotipo |
| **KARDAP Pro** | R$ 129,90/mês | ilimitadas | 150 | sim | pedidos, comandas, caixa, estoque, financeiro, entregas, relatórios |
| **KARDAP Business** (mais popular) | R$ 199,90/mês | ilimitadas | 500 | sim | + promoções, integrações com marketplaces, suporte prioritário |
| **KARDAP Enterprise** | sob consulta | ilimitadas | ilimitados ou conforme contrato | sim | limites, recursos e permissões por contrato |

- **Catálogo:** fica em `lib/billing/plans.ts` (`PLAN_CATALOG`, versão 2), que é a única fonte de preços, limites e
  recursos.
  - `null` significa ilimitado; `0` significa indisponível.
  - O script de migração publica uma cópia em `planos/{id}`, só para consulta.
- **Teste grátis:** toda conta nova tem 15 dias do **Pro**, contados da criação e sem cartão, como prometem os Termos. O
  teste inclui o PDV e a franquia de 150 pedidos.
- **Sem assinatura válida** (teste encerrado, vencida, suspensa):
  - o cardápio continua no ar e nenhum dado é apagado;
  - os recursos voltam ao básico do Start;
  - o PDV, a confirmação de pedidos próprios e "pedir a conta" ficam bloqueados.
- **Planos anteriores:**
  - **Essencial** vira **Start** e mantém as 30 mesas contratadas (via `customLimits`).
  - O **Pro antigo** vira o Pro atual: ganha o PDV e a franquia de 150 pedidos.
  - O preço pago continua o que está gravado na assinatura.

## Regra dos pedidos próprios

A franquia mensal conta **só** os pedidos criados no KARDAP. Pedidos de marketplaces nunca consomem a franquia e nunca são
bloqueados por ela.

| Origem (`origin.source`) | Consome |
| --- | --- |
| `kardap_pdv`, `kardap_table`, `kardap_delivery`, `kardap_pickup`, `kardap_staff` | sim, 1 por pedido confirmado |
| `ifood`, `99food`, `external_marketplace` | nunca |

- Cada pedido próprio confirmado consome exatamente uma unidade, não importa quantos itens tenha.
- Rascunhos não consomem.
- Atualizar um pedido confirmado não consome de novo.
- Cancelar depois não devolve a franquia automaticamente. A administração pode corrigir, com registro.
- Reenviar a mesma confirmação (mesmo `orderId` ou mesma `idempotencyKey`) não consome de novo.
- A origem é gravada pelo servidor:
  - `/api/pedidos/confirmar` só aceita origens próprias;
  - `/api/pedidos/externos` só aceita marketplaces e exige o segredo do servidor da integração;
  - as regras do Firestore impedem alterar `origin` e `quota` pelo navegador.
- **Franquia esgotada:** só a confirmação de **novos pedidos próprios** para. Continuam funcionando:
  - PDV, caixa e estoque;
  - relatórios e pedidos existentes;
  - rascunhos;
  - pedidos de iFood e 99Food.
- **Avisos:** aos 70%, 90% e 100% de uso, na visão geral e em Meu plano, com barra de progresso.

## Onde ficam os dados

O sistema reaproveita as coleções que já existiam (`restaurantes/{id}` é o "estabelecimento"):

| No pedido original | No KARDAP | Quem grava |
| --- | --- | --- |
| `plans/{id}` | `planos/{id}` (cópia; a regra vale no código) | script de migração |
| `establishments/{id}` | `restaurantes/{id}` | — |
| `subscription/current` | `restaurantes/{id}.subscription` (mapa) | servidor |
| `usage/{periodId}` | `restaurantes/{id}/uso/{AAAA-MM}` | servidor |
| `subscriptionEvents/{id}` | `restaurantes/{id}/eventosAssinatura/{id}` | servidor |
| `usageEvents/{id}` | `restaurantes/{id}/eventosUso/{id}` (id = pedido) | servidor |
| `tables/{id}` | `restaurantes/{id}/mesas/{id}` | criação só no servidor |
| `orders/{id}` | `restaurantes/{id}/pedidos/{id}` | rascunho: equipe; confirmação e marketplace: servidor |
| `billingEvents/{id}` | `cakto_webhook_events/{id}` | servidor |
| — | `restaurantes/{id}/privado/assinatura` (bandeira e final do cartão) | servidor |
| — | `falhasSincronizacao/{id}`, `propostasEnterprise/{id}`, `adminLog/{id}` | servidor |

### Campos de `restaurantes/{id}.subscription`

- **Do formato anterior:** `planId`, `planName`, `status`, `cycle`, `priceCents`, `currentPeriodStart`,
  `currentPeriodEnd`, `nextPaymentDate`, `trialEndsAt`, `lateSince`, `canceledAt`, `caktoSubscriptionId`,
  `caktoOrderId`, `caktoOfferId`, `paymentMethod`.
- **Novos:**
  - `planVersion`;
  - `paymentProvider`;
  - `cancelAtPeriodEnd`;
  - `scheduledChange { planId, effectiveAt, requestedAt }`;
  - `customLimits { maxTables, maxNativeOrdersPerMonth }`;
  - `customFeatures { <recurso>: true | false }`.
- **Situações:** `trialing`, `active`, `past_due` (3 dias de carência), `canceled` (vale até o fim do período pago),
  `expired` e `suspended`.
  - Os valores antigos (`trial`, `late`, `inactive`, `paused`) continuam aceitos na leitura.
  - Estorno ou chargeback, que antes gravavam `inactive`, agora resultam em `expired`, sem devolver o teste.
- **Uso do mês:** `uso/2026-10 { nativeOrdersUsed, nativeOrdersLimit, periodStart, periodEnd, updatedAt }`.
  - O mês é o de calendário no fuso **America/Sao_Paulo**.
  - Cada mês tem o próprio documento, então a franquia renova sozinha no dia 1º, sem tarefa agendada, e o histórico fica.
  - **Renovação da franquia** (dia 1º) e **próxima cobrança** (data do gateway) são datas diferentes e aparecem
    separadas em Meu plano.

## Acesso efetivo

**Assinatura válida + recurso no plano + papel autorizado + estabelecimento certo.**

### Regras puras (`lib/billing/plans.ts`)

Valem no navegador, no servidor e nos testes:

- `resolveEntitlements` calcula os direitos efetivos.
- `orderQuota` calcula a situação da franquia.
- `usagePeriod` define o período do mês.
- `roleAllows` decide pelo papel da pessoa.

### Serviço central (`lib/billing/server.ts`, somente servidor)

| Função | O que faz |
| --- | --- |
| `getSubscriptionEntitlements(id)` | Direitos efetivos do estabelecimento |
| `canAccessFeature(id, uid, recurso)` | `{ allowed, reason: ok \| not_member \| role \| subscription \| plan }` |
| `checkPlanLimit(id, "tables" \| "nativeOrders", n)` | Consulta o limite, sem reservar nada |
| `createTables(id, uid, …)` | Cria mesas numa transação que lê as mesas e confere o limite |
| `confirmNativeOrder(…)` | Confirma o pedido e incrementa o uso do mês na mesma transação, com idempotência |
| `recordExternalOrder(…)` | Grava pedido de marketplace sem tocar no uso |
| `reconcileUsage(id, período)` | Confere o contador com os pedidos confirmados e corrige com registro |
| `applySubscriptionChange(…)` | Altera a assinatura com registro (antes, depois, quem, motivo) |

### Papéis (`restaurantes/{id}/membros/{uid}.permissions`)

| Papel ou permissão | O que libera |
| --- | --- |
| Dono ou `*` | Tudo |
| `pdv` | PDV, pedidos, caixa, estoque e entregas. Não libera finanças, relatórios, configurações nem assinatura |
| `pedidos`, `caixa`, `estoque`, `entregas`, `financeiro`, `relatorios`, `promocoes`, `integracoes` | Cada uma libera só o recurso correspondente |
| `assinatura` | Cobrança |
| `configuracoes` | Mesas e configurações |

## APIs (kardapp.online)

Todas respondem `{ error, message }` em caso de erro.

**Autenticação:** `Bearer <ID token>` (painel e navegador do PDV), ou `Basic <pdv:segredo>` mais
`{ session: <cookie kardap_sso_session> }` no corpo (servidor do PDV, como em `/api/sso/introspect`). Identidade anônima
nunca é aceita.

| Rota | Quem | O que faz |
| --- | --- | --- |
| `GET /api/billing/entitlements?restaurantId=` (ou `POST`) | equipe | Plano, situação, limites, recursos, uso do mês, mesas, papel, acesso ao PDV |
| `POST /api/restaurants/{id}/mesas` `{ name? \| quantity? }` | dono, `*`, `configuracoes` | Cria mesas respeitando o limite (`403 table_limit`) |
| `POST /api/pedidos/confirmar` `{ restaurantId, source, orderId \| idempotencyKey, order? }` | equipe com pedidos | Confirma pedido próprio: `201`; repetido: `200 duplicate`; franquia esgotada: `402 quota_exceeded { used, limit }` |
| `POST /api/pedidos/externos` `{ restaurantId, provider, externalOrderId, order? }` | servidor do PDV (Basic) | Pedido de marketplace: nunca consome nem é bloqueado |
| `POST /api/cakto/checkout` `{ restaurantId, planId }` | dono, `*`, `assinatura` | Abre o checkout (novo, upgrade, downgrade agendado, reativação) |
| `POST /api/billing/change-plan` `{ restaurantId, planId }` | dono, `*`, `assinatura` | Agenda a mudança para um plano menor no fim do período |
| `GET` e `POST /api/cakto/subscription` | equipe / responsável | Histórico, cancelamento, forma de pagamento |
| `POST /api/cakto/webhook` | Cakto (HMAC) | Confirma pagamentos e mudanças da assinatura |
| `POST /api/enterprise/contato` | público | Pedido de proposta Enterprise (nunca cria assinatura) |
| `POST /api/admin/assinaturas` | administradores (`admins/{uid}`) | `extend_trial`, `set_subscription`, `reconcile_usage`, `resolve_failure`, sempre com motivo |
| `POST /api/sso/introspect` | servidor do PDV | Sessão e acesso: agora exige o plano (ver abaixo) |

## Fluxo de contratação (Cakto)

**1. Checkout.** Em Meu plano, o botão "Assinar" ou "Fazer upgrade" chama `/api/cakto/checkout`. O servidor decide o tipo
pela assinatura atual, cria `cakto_checkout_sessions/{token}` (com a oferta esperada) e devolve a URL da Cakto com
`?callback=<token>`.

**2. Confirmação.** O webhook valida o HMAC.

- Sem `CAKTO_WEBHOOK_SECRET` configurado, **nada** é processado.
- O plano só é ativado se a oferta paga for a esperada para o plano escolhido. Pagar a oferta do Start com o checkout do
  Business não ativa o Business: a falha fica registrada em `falhasSincronizacao`.

**3. Idempotência.** Cada evento (tipo + pedido) é processado uma vez. Uma reentrega responde `duplicate`. Se o
processamento falhar, a próxima entrega da Cakto tenta de novo.

**4. Upgrade.** Vale na hora em que o pagamento é confirmado. O consumo do mês é preservado (ex.: 140/150 vira 140/500)
e a assinatura anterior é cancelada no gateway.

- Eventos que chegarem da assinatura antiga (renovação ou cancelamento) não mexem no plano novo.
- A Cakto cobra o valor cheio do plano novo, sem crédito proporcional dos dias restantes do plano anterior.

**5. Downgrade.** É agendado em Meu plano:

- a assinatura atual não renova (cancelada no gateway);
- o plano atual vale até o fim do período;
- o checkout do plano menor abre a partir de 1 dia antes da data agendada;
- nada é apagado: acima dos novos limites, só novas criações ficam bloqueadas, e o consumo já acima da nova franquia
  bloqueia novas confirmações até a renovação.

**6. Cancelamento e reativação.**

- O cancelamento vale até o fim do período pago.
- A reativação é um novo checkout, liberado perto do fim do período (evita pagar duas vezes o mesmo mês).

**7. Falha de pagamento.** Entra em `past_due` com 3 dias de carência. Depois disso, o acesso fica no básico até
regularizar.

**8. Enterprise.** Começa por "Falar com vendas", que grava a proposta em `propostasEnterprise`. A ativação é feita por um
administrador, com limites e recursos do contrato e motivo registrado.

## Fluxo de acesso ao PDV

**1. Botão "Acessar PDV".** Fica no menu lateral (computador), na barra superior (celular) e em Meu plano.

- Com o PDV no plano, leva a `https://pdv.kardapp.online/`. O login é o mesmo, pela sessão compartilhada do SSO.
- No Start, aparece com cadeado e abre "Desbloqueie o PDV do KARDAP", com "Conhecer planos" e "Fazer upgrade".

**2. Validação no servidor.** Mesmo digitando o endereço do PDV, o layout protegido chama `/api/sso/introspect`, e o
servidor central confere identidade, sessão, estabelecimento, papel **e plano**.

- `access.allowed` só é verdadeiro com o plano válido.
- `access.blocked[].reason` diz se o bloqueio é por `plan` (upgrade) ou `subscription` (regularizar).
- O kit mostra a página de bloqueio certa: `/sem-permissao?motivo=plano` ou `?motivo=assinatura`.

**3. Mudança com o PDV aberto.** Se o plano mudar com o PDV aberto (downgrade, vencimento), a conferência periódica do kit
(a cada 2 minutos, com cache de 10 s no servidor central) tira o acesso.

- Toda confirmação de pedido é conferida na hora no servidor, sem cache.
- O upgrade libera o PDV no próximo acesso.
- O painel do KARDAP reflete a mudança em tempo real, pelo documento do restaurante.

## Regras do Firestore (`firestore.rules`, proposta do repositório)

**Ainda não publicadas: em produção vale a regra aberta escolhida pelo responsável.** Enquanto ela valer, o servidor
aplica os limites nas APIs, mas um cliente que grave direto no Firestore não é barrado.

O que as regras do repositório garantem quando publicadas:

- `subscription`, `ownerId`, `status` do restaurante: nenhum dono altera.
- `uso`, `eventosUso`, `eventosAssinatura`: leitura da equipe; gravação só pelo servidor.
- `mesas`: criação só pelo servidor. A equipe renomeia, muda a situação e exclui.
- `pedidos`:
  - a equipe cria e edita rascunhos (`status: "rascunho"`);
  - `origin`, `quota`, `confirmedAt` e `confirmedBy` nunca mudam pelo navegador;
  - um rascunho só vira pedido pelo servidor.
- `planos`: leitura pública.
- `cakto_*`, `falhasSincronizacao`, `propostasEnterprise`: leitura só por administradores.
- Um estabelecimento não lê o consumo nem os pedidos de outro.

Publicar: teste no emulador e rode `firebase deploy --only firestore:rules`. **Antes, o PDV precisa estar usando
`/api/pedidos/confirmar`**, porque a regra deixa de aceitar pedido confirmado gravado direto pelo navegador.

## Administração (`/admin`)

**Detalhe do restaurante → "Plano e limites":**

- plano, situação, fim do período e valor;
- limites personalizados (mesas e pedidos por mês, ou "ilimitado");
- recursos liberados ou bloqueados por contrato;
- "Conferir consumo" e "Corrigir consumo" (reconciliação);
- motivo obrigatório. Cada alteração registra administrador, estabelecimento, antes, depois, data e motivo, em `adminLog`
  e `eventosAssinatura`.

**"Planos":** assinantes e receita por plano, falhas de sincronização com a Cakto (marcar como resolvida, com o motivo) e
pedidos de proposta Enterprise.

## Migração (`npm run migrate:plans`)

Simulação por padrão; só grava com `--apply`. É idempotente: rodar de novo não altera o que já foi migrado.

```bash
node --env-file=.env.local scripts/migrate-plans.mjs                       # simulação + relatório JSON
node --env-file=.env.local scripts/migrate-plans.mjs --apply               # aplica
node --env-file=.env.local scripts/migrate-plans.mjs --apply --classify    # também grava a origem dos pedidos inequívocos
```

1. Publica o catálogo em `planos/`.
2. **Assinaturas:**
   - Essencial vira Start, com `customLimits.maxTables = 30`;
   - situações antigas passam aos nomes atuais;
   - `planVersion` passa a 2, com evento em `eventosAssinatura`;
   - dados de cartão que estejam no documento público são retirados.
3. **Mesas:** lista quem tem mais mesas que o novo limite. Nada é apagado.
4. **Pedidos do mês:**
   - classifica a origem só quando um campo existente é inequívoco (ex.: `origem: "PDV"`, `canal: "iFood"`);
   - **origem desconhecida nunca vira pedido próprio**: vai para o relatório, para classificação manual;
   - rascunhos não são tocados.
5. **Consumo:** cria `uso/{mês}` só se ainda não existir, contando apenas pedidos próprios classificados. Nunca
   sobrescreve um contador em uso.

**Importante:** o repositório do PDV não estava disponível nesta implementação. Os nomes dos campos de origem dos pedidos
antigos são suposições cobertas pelo mapeamento acima. Rode a simulação em produção e confira o relatório antes de
`--apply`.

## Configuração para produção

1. **Cakto:**
   - crie as ofertas mensais Start (R$ 49,90), Pro (R$ 129,90) e Business (R$ 199,90);
   - defina `CAKTO_OFFER_START`, `CAKTO_OFFER_PRO` e `CAKTO_OFFER_BUSINESS`;
   - defina **`CAKTO_WEBHOOK_SECRET`**: sem ele o webhook recusa tudo;
   - mantenha `CAKTO_OFFER_ESSENCIAL_*` e `CAKTO_OFFER_PRO_MONTHLY`/`ANNUAL` com as ofertas antigas, para reconhecer
     as renovações de quem já assina.
2. Rode a migração (simulação → conferência → `--apply`).
3. **PDV:**
   - copie os arquivos novos do kit (`integrations/pdv-sso`, seção "Planos e pedidos" do README);
   - troque a confirmação de pedidos para `confirmOrder` e a entrada de marketplaces para `recordMarketplaceOrder`.
4. Só então publique as regras do Firestore.

## Testes

- `npm run test:billing`: regras puras (planos, situações, Enterprise, planos antigos, avisos 70/90/100, virada do mês
  em São Paulo, origens, papéis).
- `npm run test:plans`: ponta a ponta com os emuladores. Ver [TESTES.md](TESTES.md).
