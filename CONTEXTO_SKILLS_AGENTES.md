# CONTEXTO_SKILLS_AGENTES.md | Centro de Inteligência & Despacho da Frota

> **Kit Operacional:** Kit Híbrido Supremo (25 Agentes Especialistas | 68 Skills de Domínio)  
> **Finalidade:** Servir como guia definitivo e mapa de contexto imediato para Claude Code, Gemini CLI e Codex. Permite identificar em tempo constante qual agente ou skill deve ser convocado, eliminando adivinhações e otimizando o consumo de tokens.

---

## 1. ÁRVORE DE DECISÃO RÁPIDA (QUAL ESPECIALISTA & SKILL ACIONAR?)

`
DEMANDA RECEBIDA
│
├── Nova Funcionalidade / Criatividade / Arquitetura
│   ├── Antes de codificar -> brainstorming, writing-plans
│   ├── Multi-camada (Front + Back) -> orchestrator
│   └── Com testes primeiro (TDD) -> test-engineer + test-driven-development
│
├── Frontend, UI, Design & Interações
│   ├── Componentes, Telas, Tailwind -> frontend-specialist + frontend-design
│   ├── Animações fluidas & View Transitions -> vercel-react-view-transitions
│   ├── Timelines complexas / Scroll -> gsap-core, gsap-react, gsap-scrolltrigger, gsap-timeline
│   ├── Cenas 3D / WebGL / Shaders -> threejs-animation, shader-glsl
│   └── Auditoria de Usabilidade & UX -> nielsen-heuristic-evaluation, ux-lei-de-fitts, ux-lei-de-hick
│
├── Backend, APIs & Persistência
│   ├── Endpoints REST / Server Actions -> backend-specialist
│   ├── Schemas Prisma/Drizzle / Queries SQL -> database-architect + supabase-postgres-best-practices
│   ├── Migrações sem downtime -> zero-downtime-migrations
│   ├── Caching de alta escala & Hot-keys -> redis-cache-stampede-prevention
│   ├── Pagamentos & Webhooks Stripe -> stripe-webhook-reconciliation
│   ├── Contabilidade & Partidas Dobradas -> double-entry-accounting-ledger
│   └── Mensageria WhatsApp Business -> whatsapp-business-api-integration
│
├── Inteligência Artificial & LLMs
│   ├── Orquestração, RAG & Agentes -> ai-engineer
│   ├── Avaliação de fidelidade RAG -> rag-triad-evaluation
│   ├── Otimização de Prompts / DSPy -> prompt-dspy-optimization
│   ├── Testes de Jailbreak / Red Teaming -> llm-jailbreak-redteaming
│   └── Benchmarking de Banco Vetorial -> vector-index-benchmarking
│
├── Mobile & Multiplataforma
│   ├── App Flutter / React Native / PWA -> mobile-developer
│   └── CI/CD, Assinatura e Lojas (App Store / Play Store) -> app-store-fastlane-automation
│
├── Bugs, Falhas & Performance
│   ├── Investigação de Causa-Raiz (RCA) -> debugger + systematic-debugging
│   ├── Build quebrado / Bundler falhando -> react-build-resolver
│   ├── Otimização de Bundle Next.js / LCP -> next-bundle-optimizer, vercel-optimize
│   └── Testes de Carga & Stress -> distributed-load-testing-k6
│
└── Qualidade, Auditoria & Finalização
    ├── Revisão de Tipos & Assincronismo -> typescript-reviewer
    ├── Revisão de Hooks e Server Components -> react-reviewer
    ├── Revisão OWASP e Segurança -> security-reviewer, security-auditor, differential-review
    ├── Testes E2E com Playwright -> qa-automation-engineer + webapp-testing
    ├── Verificação antes de merge -> verification-before-completion, requesting-code-review
    └── Finalização de Branch -> finishing-a-development-branch
`

---

## 2. ROSTER DOS 25 AGENTES ESPECIALISTAS

| Agente | Especialidade / Papel Técnico | Quando Convocar (Gatilho Exato) |
|---|---|---|
| orchestrator | Coordenação geral multi-camada | Tarefas que cruzam backend, frontend e banco simultaneamente |
| rontend-specialist | UI, layout, Tailwind, Design System | Construção ou refatoração de interfaces e componentes de tela |
| ackend-specialist | APIs, regras de servidor, serviços | Criação de rotas, integrações REST/GraphQL, webhooks e lógica de negócio |
| database-architect | Modelagem relacional e queries SQL | Criação ou alteração de schemas Prisma/Drizzle, índices e migrations |
| i-engineer | Engenharia de IA, RAG e orquestração de LLMs | Implementação de fluxos RAG, vetores, chains, agentes e guardrails |
| mobile-developer | Desenvolvimento mobile e multiplataforma | Flutter, React Native, Swift, Kotlin, Capacitor/PWA e publicação |
| debugger | Investigação sistemática de causa-raiz | Bugs desconhecidos, falhas silenciosas, comportamentos anômalos |
| 	est-engineer | Testes unitários e de integração TDD | Criação de suítes de testes automatizados e edge cases |
| qa-automation-engineer | Testes end-to-end (E2E) e pipelines CI | Fluxos críticos de ponta a ponta com Playwright e gates de qualidade |
| 
eact-build-resolver | Resolução de falhas de build e bundler | Erros de compilação Next.js/Turbopack/Vite e dependências quebradas |
| 
eact-reviewer | Auditoria de regras React 19 e Server Components | Revisão de vazamento de estado, boundaries client/server e hooks |
| 	ypescript-reviewer | Tipagem estrita e segurança JS/TS | Eliminação de ny, validação de tipos em concorrência assíncrona |
| security-reviewer | Análise de vulnerabilidades OWASP | Revisão pré-deploy procurando injeção, falhas de auth e segredos |
| security-auditor | Modelagem de ameaças e defesa em profundidade | Auditoria arquitetural de segurança (STRIDE, superfícies de ataque) |
| penetration-tester | Testes de intrusão simulados | Validação de brechas em fluxos reais de login, checkout e permissões |
| performance-optimizer | Eliminação de gargalos e Core Web Vitals | Redução de latência de endpoints, memory leaks e peso de assets |
| devops-engineer | Infraestrutura, Docker e CI/CD | Configuração de pipelines GitHub Actions, contêineres e deploy |
| seo-specialist | Otimização de busca e presença em IA | Metadados dinâmicos, OpenGraph, JSON-LD schemas e sitemaps |
| product-manager | Refinamento de requisitos ambíguos | Quando o usuário não definiu as regras de negócio ou o escopo |
| product-owner | Critérios de aceite e histórias de usuário | Conversão de metas de negócio em checklists técnicos verificáveis |
| project-planner | Quebra de épicos em tarefas atômicas | Planejamento sequencial antes de executar features grandes |
| code-archaeologist | Leitura e mapeamento de código legado | Investigação de código antigo, não documentado ou de terceiros |
| explorer-agent | Mapeamento estrutural de novos repositórios | Reconhecimento de topologia em bases de código desconhecidas |
| documentation-writer | Documentação técnica e manuais | Elaboração de READMEs, runbooks operacionais e contratos de API |
| code-reviewer | Revisão geral de código pré-merge | Inspeção padrão de qualidade, legibilidade e manutenibilidade |

---

## 3. CATÁLOGO DAS 68 SKILLS DO KIT HÍBRIDO SUPREMO

### 3.1 Metodologia & Engenharia Disciplinada (Superpowers)
| Skill | Finalidade & Gatilho de Uso | Caminho |
|---|---|---|
| rainstorming | Obrigatório antes de qualquer criação ou arquitetura | .agents/skills/brainstorming/SKILL.md |
| using-superpowers | Estabelece hábitos de rigor e planejamento na sessão | .agents/skills/using-superpowers/SKILL.md |
| writing-plans | Elaboração de planos de implementação atômicos | .agents/skills/writing-plans/SKILL.md |
| executing-plans | Execução ordenada de planos passo a passo | .agents/skills/executing-plans/SKILL.md |
| 	est-driven-development | Desenvolvimento orientado a testes (Red-Green-Refactor) | .agents/skills/test-driven-development/SKILL.md |
| systematic-debugging | Diagnóstico de causa-raiz antes de qualquer correção | .agents/skills/systematic-debugging/SKILL.md |
| subagent-driven-development | Orquestração de subagentes em tarefas complexas | .agents/skills/subagent-driven-development/SKILL.md |
| dispatching-parallel-agents | Despacho de múltiplos agentes com arquivos disjuntos | .agents/skills/dispatching-parallel-agents/SKILL.md |
| using-git-worktrees | Isolamento seguro de branches via worktrees | .agents/skills/using-git-worktrees/SKILL.md |
| 
equesting-code-review | Checklist de verificação antes de solicitar revisão | .agents/skills/requesting-code-review/SKILL.md |
| 
eceiving-code-review | Avaliação técnica e sem submissão cega a feedbacks | .agents/skills/receiving-code-review/SKILL.md |
| erification-before-completion | Prova de evidências reais antes de declarar tarefa concluída | .agents/skills/verification-before-completion/SKILL.md |
| inishing-a-development-branch | Merge, limpeza e finalização disciplinada de branches | .agents/skills/finishing-a-development-branch/SKILL.md |
| diagnosing-superpowers | Diagnóstico de falhas de execução no fluxo dos agentes | .agents/skills/diagnosing-superpowers/SKILL.md |
| writing-skills | Criação e aprimoramento de skills padronizadas | .agents/skills/writing-skills/SKILL.md |

### 3.2 Web Moderna, React 19, Next.js & Vercel
| Skill | Finalidade & Gatilho de Uso | Caminho |
|---|---|---|
| ercel-react-best-practices | Regras oficiais de performance e patterns React/Next.js | .agents/skills/vercel-react-best-practices/SKILL.md |
| ercel-composition-patterns | Padrões de composição e desacoplamento de componentes | .agents/skills/vercel-composition-patterns/SKILL.md |
| ercel-optimize | Otimização de Core Web Vitals, Edge e Caching | .agents/skills/vercel-optimize/SKILL.md |
| ercel-react-view-transitions | Transições de página nativas fluidas com View Transitions API | .agents/skills/vercel-react-view-transitions/SKILL.md |
| 
ext-dev-loop | Diagnóstico e feedback em tempo de execução Next.js | .agents/skills/next-dev-loop/SKILL.md |
| 
ext-bundle-optimizer | Redução do tamanho do bundle JS inicial e code splitting | .agents/skills/next-bundle-optimizer/SKILL.md |
| deploy-to-vercel | Procedimentos oficiais de deploy automatizado | .agents/skills/deploy-to-vercel/SKILL.md |
| ercel-cli-with-tokens | Operações Vercel via CLI autenticada por token | .agents/skills/vercel-cli-with-tokens/SKILL.md |
| shadcn | Instalação e customização de componentes Radix/shadcn | .agents/skills/shadcn/SKILL.md |
| supabase-postgres-best-practices | Otimização de PostgreSQL, RLS, pooling e queries | .agents/skills/supabase-postgres-best-practices/SKILL.md |
| gh-fix-ci | Resolução de pipelines com falha no GitHub Actions | .agents/skills/gh-fix-ci/SKILL.md |
| differential-review | Auditoria de segurança diferencial focada no diff | .agents/skills/differential-review/SKILL.md |
| web-design-guidelines | Auditoria de conformidade com Web Interface Guidelines | .agents/skills/web-design-guidelines/SKILL.md |
| writing-guidelines | Revisão de copy, tom de voz e documentação | .agents/skills/writing-guidelines/SKILL.md |
| ind-skills | Busca e recomendação dinâmica de novas skills | .agents/skills/find-skills/SKILL.md |

### 3.3 Domínio Criativo: Animações GSAP & 3D WebGL
| Skill | Finalidade & Gatilho de Uso | Caminho |
|---|---|---|
| gsap-core | Interpolações, tweens e princípios de movimento | .agents/skills/gsap-core/SKILL.md |
| gsap-react | Hook useGSAP, scoping de seletores e cleanup de memória | .agents/skills/gsap-react/SKILL.md |
| gsap-scrolltrigger | Efeitos disparados pelo scroll, pinning e parallax | .agents/skills/gsap-scrolltrigger/SKILL.md |
| gsap-timeline | Coreografia e sequenciamento de múltiplas animações | .agents/skills/gsap-timeline/SKILL.md |
| 	hreejs-animation | Modelos 3D, câmeras, luzes e loops de renderização | .agents/skills/threejs-animation/SKILL.md |
| shader-glsl | Shaders vertex/fragment em GLSL para efeitos visuais | .agents/skills/shader-glsl/SKILL.md |

### 3.4 Psicologia Cognitiva & Leis de UX
| Skill | Finalidade & Gatilho de Uso | Caminho |
|---|---|---|
| ux-lei-de-fitts | Alvos de toque acessíveis e botões de conversão destacados | .agents/skills/ux-lei-de-fitts/SKILL.md |
| ux-lei-de-jakob | Adoção de convenções mentais familiares de navegação | .agents/skills/ux-lei-de-jakob/SKILL.md |
| ux-lei-de-miller | Divisão de dados em blocos concisos (7 ± 2 itens) | .agents/skills/ux-lei-de-miller/SKILL.md |
| ux-lei-de-hick | Redução do tempo de escolha em menus e formulários | .agents/skills/ux-lei-de-hick/SKILL.md |
| ux-lei-de-pragnanz | Harmonia, ordem e redução de ruído visual Gestalt | .agents/skills/ux-lei-de-pragnanz/SKILL.md |
| 
ielsen-heuristic-evaluation | Auditoria completa contra as 10 Heurísticas de Usabilidade | .agents/skills/nielsen-heuristic-evaluation/SKILL.md |

### 3.5 Fintech, Pagamentos & Mensageria
| Skill | Finalidade & Gatilho de Uso | Caminho |
|---|---|---|
| stripe-webhook-reconciliation | Idempotência e reconciliação segura de eventos Stripe | .agents/skills/stripe-webhook-reconciliation/SKILL.md |
| double-entry-accounting-ledger | Razão contábil de partidas dobradas para saldos e estornos | .agents/skills/double-entry-accounting-ledger/SKILL.md |
| whatsapp-business-api-integration | Integração resiliente com a Meta WhatsApp Cloud API | .agents/skills/whatsapp-business-api-integration/SKILL.md |

### 3.6 Engenharia de IA, RAG & Vetores
| Skill | Finalidade & Gatilho de Uso | Caminho |
|---|---|---|
| 
ag-triad-evaluation | Avaliação de fidelidade, relevância e resposta em RAG | .agents/skills/rag-triad-evaluation/SKILL.md |
| prompt-dspy-optimization | Otimização algorítmica de pipelines de prompts via DSPy | .agents/skills/prompt-dspy-optimization/SKILL.md |
| llm-jailbreak-redteaming | Testes adversariais contra prompt injection e jailbreak | .agents/skills/llm-jailbreak-redteaming/SKILL.md |
| ector-index-benchmarking | Benchmark de ANN, HNSW, latência e recall vetorial | .agents/skills/vector-index-benchmarking/SKILL.md |

### 3.7 Resiliência Backend, Escala & Mobile
| Skill | Finalidade & Gatilho de Uso | Caminho |
|---|---|---|
| zero-downtime-migrations | Migrações de banco em 5 fases (expand/contract) sem lock | .agents/skills/zero-downtime-migrations/SKILL.md |
| 
edis-cache-stampede-prevention | Invalidação probabilística e mitigação de hot-keys | .agents/skills/redis-cache-stampede-prevention/SKILL.md |
| distributed-load-testing-k6 | Testes de estresse, pico e soak com k6 | .agents/skills/distributed-load-testing-k6/SKILL.md |
| pp-store-fastlane-automation | Pipelines Fastlane de build e deploy iOS e Android | .agents/skills/app-store-fastlane-automation/SKILL.md |

### 3.8 Qualidade, Simplicidade & Anti-Bloat (Ponytail)
| Skill | Finalidade & Gatilho de Uso | Caminho |
|---|---|---|
| ponytail | Princípio da menor solução técnica completa | .agents/skills/ponytail/SKILL.md |
| ponytail-audit | Auditoria de complexidade acidental e dependências inúteis | .agents/skills/ponytail-audit/SKILL.md |
| ponytail-debt | Mapeamento de atalhos e débitos técnicos acumulados | .agents/skills/ponytail-debt/SKILL.md |
| ponytail-review | Revisão de código com foco estrito em simplicidade | .agents/skills/ponytail-review/SKILL.md |

### 3.9 Ferramentas de Produtividade & Artefatos
| Skill | Finalidade & Gatilho de Uso | Caminho |
|---|---|---|
| graphify | Extração de mapas de grafos de arquivos e chamadas | .agents/skills/graphify/SKILL.md |
| docx | Geração, formatação e leitura de documentos Word | .agents/skills/docx/SKILL.md |
| pdf | Extração e montagem de relatórios e arquivos PDF | .agents/skills/pdf/SKILL.md |
| pptx | Montagem automatizada de apresentações de slides | .agents/skills/pptx/SKILL.md |
| xlsx | Processamento analítico de planilhas Excel | .agents/skills/xlsx/SKILL.md |
| skill-creator | Criação e benchmark de novas skills compatíveis | .agents/skills/skill-creator/SKILL.md |
| mcp-builder | Desenvolvimento de servidores MCP em TS ou Python | .agents/skills/mcp-builder/SKILL.md |
| webapp-testing | Testes automatizados de UI em tempo real com Playwright | .agents/skills/webapp-testing/SKILL.md |
| rontend-design | Direção de arte com identidade visual intencional | .agents/skills/frontend-design/SKILL.md |
| web-artifacts-builder | Construção de artefatos web interativos ricos | .agents/skills/web-artifacts-builder/SKILL.md |
| doc-coauthoring | Escrita colaborativa de documentações e especificações | .agents/skills/doc-coauthoring/SKILL.md |

---

## 4. INVARIANTES OPERACIONAIS DE EXECUÇÃO

1. **Evidência Antes de Afirmação:** Toda conclusão exige execução e prova real por comandos de teste/build.
2. **Execução em Ondas Paralelas (Wave Execution):** Apenas dispare agentes em paralelo se os conjuntos de arquivos forem estritamente disjuntos.
3. **Deploy Safety:** Todo commit deve incluir [skip ci] [skip netlify] [skip vercel].
