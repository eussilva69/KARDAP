# CONTEXTO_PROJETO.md | Contexto Compartilhado do Produto

> **Status Inicial: NÃO CONFIGURADO.** Este arquivo é o mapa central do produto e da engenharia do repositório.
> **Diretriz de Confiabilidade:** Enquanto não houver informações confirmadas aqui, NÃO presuma público-alvo, stack, posicionamento, domínio, empresa, cores oficiais, recursos existentes ou regras comerciais. Inspecione o repositório para determinar detalhes técnicos e nunca invente informações.

---

## 1. IDENTIFICAÇÃO DO PRODUTO & NEGÓCIO

- **Nome Comercial:** [Nome oficial da marca/projeto]
- **Tipo de Aplicação:** [ex: Web App (Next.js 15 App Router) / Mobile (Flutter/React Native) / Landing Page Comercial / API Backend]
- **Repositório Git & Branch Ativa:** [ex: https://github.com/usuario/repo.git | branch: main]
- **Proposta de Valor:** [Qual dor o sistema resolve e qual sua principal entrega]
- **Público-Alvo Principal:** [Perfis de clientes / usuários que operam o sistema]

---

## 2. MAPEAMENTO DE PASTAS & ARQUIVOS-CHAVE (MIRA A LASER)
> **ATENÇÃO IA:** Consulte esta tabela antes de realizar qualquer busca no repositório. Nunca faça varreduras cegas de pastas; acesse diretamente os caminhos mapeados abaixo:

| Diretório / Caminho | Finalidade / O que contém | Arquivos e Pontos de Entrada Críticos |
|---|---|---|
| src/app/ (ou pages/) | Rotas de páginas, layouts e estrutura de navegação | layout.tsx, page.tsx, loading.tsx |
| src/app/api/ (ou pi/) | Endpoints HTTP, webhooks e rotas de servidor | 
oute.ts, handlers REST |
| src/components/ui/ | Componentes base atômicos / design system | utton.tsx, dialog.tsx, input.tsx |
| src/components/ | Componentes de negócio, seções e modais reutilizáveis | Cards de produto, tabelas, formulários |
| src/lib/ ou src/utils/ | Clientes de terceiros, conexões e utilitários globais | prisma.ts, stripe.ts, uth.ts, utils.ts |
| src/hooks/ | Custom hooks React com regras de estado e efeitos | useUser.ts, useDebounce.ts, useCart.ts |
| src/services/ | Regras de negócio desacopladas e chamadas externas | paymentService.ts, emailService.ts |
| prisma/ ou src/db/ | Modelagem relacional, schemas e histórico de migrations | schema.prisma, migrations/, seed.ts |
| public/ ou ssets/ | Arquivos estáticos servidos diretamente | avicon.ico, logos, banners, ícones SVG |
| Raiz (./) | Configurações do ecossistema, TypeScript e linters | package.json, 	sconfig.json, 	ailwind.config.ts, .env.example |

---

## 3. ENGENHARIA, STACK & COMANDOS OFICIAIS

- **Framework / Core:** [ex: Next.js 15, React 19, TypeScript 5]
- **Estilização / UI:** [ex: Tailwind CSS v3/v4, shadcn/ui, Lucide Icons]
- **Banco de Dados & ORM:** [ex: PostgreSQL no Supabase, Prisma ORM]
- **Autenticação & Sessão:** [ex: NextAuth.js / Supabase Auth / JWT]
- **Hospedagem & Deploy:** [ex: Vercel / Netlify / Docker]
- **Comandos Oficiais do Repositório:**
  - Instalação: 
pm install (ou pnpm install / yarn)
  - Servidor Local: 
pm run dev
  - Build de Produção: 
pm run build
  - Checagem Estrita de Tipos: 
px tsc --noEmit
  - Lint / Formatação: 
pm run lint
  - Testes: 
pm run test

---

## 4. INTEGRAÇÕES EXTERNAS, PAGAMENTOS & APIS

- **Gateways de Pagamento:** [ex: Stripe / Mercado Pago / Asaas / Pagar.me]
- **Webhooks & Endpoints de Notificação:** [Rotas de recebimento e validação de assinatura]
- **Mensageria & Notificações:** [ex: Meta WhatsApp Cloud API, Resend, Twilio]
- **Serviços de IA / LLMs:** [ex: OpenAI, Anthropic, Gemini API, Pinecone, Qdrant]

---

## 5. REGRAS DE NEGÓCIO E INVARIANTES CRÍTICAS

1. **Invariante 1:** [Regra essencial que NUNCA pode ser quebrada em refatorações]
2. **Invariante 2:** [Permissões de acesso, papéis de usuário (admin vs cliente)]
3. **Invariante 3:** [Cálculo financeiro, arredondamento ou tratamento de status]

---

## 6. IDENTIDADE VISUAL, DESIGN SYSTEM & LEIS DE UX

- **Paleta de Cores Oficial:** [Cores hexadecimais principais, secundárias e neutras]
- **Tipografia:** [Famílias de fontes para títulos e corpo]
- **Leis de UX Aplicadas:**
  - *Lei de Fitts:* Áreas de clique mínimas de 44x44px em mobile e botões de conversão em locais de fácil alcance.
  - *Lei de Miller:* Informações agrupadas em blocos lógicos (chunking) sem poluição visual.
  - *Lei de Hick:* Formulários e menus concisos para tomada de decisão ágil.
