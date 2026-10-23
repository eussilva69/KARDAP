# CONTEXTO_PROJETO.md | Contexto Compartilhado do Produto

> **Status:** ATIVO E EM PRODUÇÃO  
> **Última Atualização Técnica:** 2026-10-23  
> **Critérios de Confiabilidade:** Informações baseadas em inspeção estática do código-fonte e configurações reais do repositório.

---

## 1. IDENTIFICAÇÃO DO PROJETO

- **Nome Comercial:** Kardap | Cardápio Digital com Vídeo e QR Code por Mesa [VERIFICADO NO CÓDIGO]
- **Descrição Objetiva:** SaaS multitenant completo de cardápio digital interativo para bares e restaurantes, com exibição de pratos com vídeos curtos em alta resolução, pedidos por mesa via QR Code, chamada de garçom, gestão de planos e assinaturas recorrentes com gateways Cakto e Mercado Pago. [VERIFICADO NO CÓDIGO]
- **Finalidade:** Revolucionar a experiência do cliente em mesas de restaurantes, aumentar o ticket médio através de apelo visual em vídeo e automatizar a cobrança de mensalidades SaaS dos estabelecimentos. [VERIFICADO NO CÓDIGO]
- **Tipo de Aplicação:** Fullstack SaaS Web Application (Next.js 14.2 App Router + Firebase). [VERIFICADO NO CÓDIGO]
- **Repositório Git:** `https://github.com/eussilva69/KARDAP.git` (Branch: `main`, Upstream: `origin/main`). [VERIFICADO NO CÓDIGO]

---

## 2. OBJETIVO DO PRODUTO

- **Problema que resolve:** Cardápios em papel são caros para atualizar, não mostram a realidade apetitosa do prato e geram gargalos de atendimento com garçons sobrecarregados. [VERIFICADO NO CÓDIGO]
- **Como funciona:** O restaurante cria sua conta, cadastra categorias e pratos com fotos e vídeos curtos. O sistema gera QR Codes únicos por mesa. O cliente escaneia com o celular, vê o vídeo do prato sendo preparado, faz o pedido e pode acionar o garçom pelo botão "Chamar Garçom" (`chamados`). O restaurante paga assinatura recorrente para manter o cardápio ativo. [VERIFICADO NO CÓDIGO]
- **Diferenciais:** Pratos com vídeos curtos interativos (estilo Reels gastronômico), chamada de garçom digital, checkout de assinaturas com Cakto e Mercado Pago, controle de entitlements e trial automático. [VERIFICADO NO CÓDIGO]

---

## 3. PÚBLICO-ALVO

- **Perfis Identificados:**
  1. **Clientes do Restaurante:** Pessoas na mesa do estabelecimento que acessam o menu pelo celular sem precisar instalar aplicativo. [VERIFICADO NO CÓDIGO]
  2. **Donos e Gerentes de Restaurantes:** Assinantes do SaaS que gerenciam cardápio, mesas e pedidos. [VERIFICADO NO CÓDIGO]
  3. **Administradores da Plataforma Kardap:** Gestão de planos, assinaturas, clientes SaaS e logs operacionais. [VERIFICADO NO CÓDIGO]

---

## 4. FUNCIONALIDADES EXISTENTES

### Módulo do Cardápio & Cliente na Mesa (56 rotas)
- **Roteamento Dinâmico por Restaurante (`[...path]`):** Acesso ao cardápio com slug do estabelecimento e identificador de mesa. [VERIFICADO NO CÓDIGO]
- **Visualizador de Pratos com Vídeo:** Modal interativo com reprodução automática de vídeo do prato. [VERIFICADO NO CÓDIGO]
- **Filtro por Categorias:** Entradas, Pratos Principais, Bebidas, Sobremesas. [VERIFICADO NO CÓDIGO]
- **Botão "Chamar Garçom":** Registro de alerta em tempo real na coleção `chamados`. [VERIFICADO NO CÓDIGO]

### Módulo SaaS, Billing & Assinaturas
- **Integração com Cakto Gateway:**
  - `api/cakto/checkout/route.ts`: Criação de transação de assinatura. [VERIFICADO NO CÓDIGO]
  - `api/cakto/webhook/route.ts`: Processamento de confirmações de pagamento e renovações. [VERIFICADO NO CÓDIGO]
  - `api/cakto/subscription/route.ts`: Gerenciamento do ciclo de vida da assinatura. [VERIFICADO NO CÓDIGO]
- **Gestão de Assinaturas & Planos (`api/billing/*`, `api/admin/planos/*`):**
  - Ativação de período de testes (`activate-trial`). [VERIFICADO NO CÓDIGO]
  - Troca de plano (`change-plan`) e cancelamento (`subscription/cancel`). [VERIFICADO NO CÓDIGO]
  - Troca de método de pagamento (`change-payment-method`). [VERIFICADO NO CÓDIGO]
  - Verificação de direitos de acesso (`entitlements`). [VERIFICADO NO CÓDIGO]
- **Segurança de Sessão:** CSRF token e gerenciamento de logout (`api/auth/csrf`, `api/auth/session`). [VERIFICADO NO CÓDIGO]

---

## 5. ARQUITETURA TÉCNICA

- **Framework:** Next.js 14.2.16 (App Router). [VERIFICADO NO CÓDIGO]
- **Banco de Dados & Auth:** Firebase Firestore e Firebase Auth. [VERIFICADO NO CÓDIGO]
- **Gateways de Pagamento:** Cakto e Mercado Pago. [VERIFICADO NO CÓDIGO]
- **Estilização:** Tailwind CSS v3, Radix UI Primitives, Lucide React (63 componentes). [VERIFICADO NO CÓDIGO]

---

## 6. MODELO DE DADOS (FIRESTORE)

- **Coleções Verificadas:**
  - `categorias`: Categorias de itens do menu. [VERIFICADO NO CÓDIGO]
  - `produtos`: Pratos, descrições, preços, fotos e URLs de vídeo. [VERIFICADO NO CÓDIGO]
  - `mesas`: Cadastro de mesas e QR Codes do estabelecimento. [VERIFICADO NO CÓDIGO]
  - `chamados`: Solicitações de atendimento e conta feitas pelos clientes. [VERIFICADO NO CÓDIGO]
  - `adminLog`: Trilha de auditoria das ações administrativas. [VERIFICADO NO CÓDIGO]
  - `falhasSincronizacao`: Logs de erros de concorrência ou sincronização de pedidos. [VERIFICADO NO CÓDIGO]

---

## 7. REGRAS DE NEGÓCIO

- **Controle de Inadimplência:** Estabelecimentos sem assinatura ativa ou trial válido têm o cardápio público bloqueado via verificação de entitlements. [VERIFICADO NO CÓDIGO]
- **Chamado com Tempo de Resposta:** Notificação do garçom registra timestamp para medição do tempo de atendimento. [VERIFICADO NO CÓDIGO]

---

## 8. FLUXOS PRINCIPAIS

1. **Fluxo do Cliente:** Senta na mesa -> escaneia QR Code -> abre cardápio da mesa no navegador -> assiste vídeo do prato -> chama garçom ou faz pedido.
2. **Fluxo do Dono do Restaurante:** Assina plano via Cakto/Mercado Pago -> acessa painel -> cadastra pratos com vídeos -> imprime QR Codes para as mesas.

---

## 9. IDENTIDADE VISUAL E DESIGN SYSTEM

- **Estilo:** Visual apetitoso e moderno com contrastes escuros elegantes que destacam a saturação e cores dos vídeos de gastronomia. [VERIFICADO NO CÓDIGO]

---

## 10. PADRÕES DE IMPLEMENTAÇÃO

- **Roteamento Dinâmico:** Captura flexível de subcaminhos via `[...path]/page.tsx`. [VERIFICADO NO CÓDIGO]
- **APIs RESTful:** Endpoints modulares sob `api/billing/` e `api/cakto/`. [VERIFICADO NO CÓDIGO]

---

## 11. SEO E PÁGINAS PÚBLICAS

- **Title Oficial:** "Cardápio digital com vídeo e QR Code por mesa | Kardap" [VERIFICADO NO CÓDIGO]
- **Páginas Indexáveis:** Landing page de vendas do SaaS para donos de restaurantes. [VERIFICADO NO CÓDIGO]

---

## 12. SEGURANÇA E PRIVACIDADE

- **Proteção CSRF:** Verificação de tokens em requisições de pagamento e autenticação. [VERIFICADO NO CÓDIGO]
- **Isolamento Multitenant:** Filtro estrito de dados por ID do restaurante no Firestore. [VERIFICADO NO CÓDIGO]

---

## 13. COMANDOS DO PROJETO

- **Instalação:** `npm install` [VERIFICADO NO CÓDIGO]
- **Desenvolvimento:** `npm run dev` [VERIFICADO NO CÓDIGO]
- **Build:** `npm run build` [VERIFICADO NO CÓDIGO]
- **Start:** `npm run start` [VERIFICADO NO CÓDIGO]
- **Lint:** `npm run lint` [VERIFICADO NO CÓDIGO]

---

## 14. RESTRIÇÕES ESPECÍFICAS

- **Webhooks Cakto:** Não alterar as assinaturas das rotas `api/cakto/webhook` e `api/billing/webhook`. [VERIFICADO NO CÓDIGO]

---

## 15. LACUNAS E INFORMAÇÕES PENDENTES

- **Impressão Direta na Cozinha:** [NÃO DETERMINADO] Confirmar se existe integração nativa com impressoras térmicas ESC/POS ou se a leitura é exclusivamente por tela.

---

## 16. REFERÊNCIAS E ORIGEM DAS INFORMAÇÕES

- `package.json`: Next.js 14.2.16 e dependências.
- `src/app/api/billing/*` & `src/app/api/cakto/*`: Lógica de faturamento e assinaturas.
- Data da Análise Técnica: 2026-10-23
