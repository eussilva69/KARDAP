# AI_RULES.md | Contrato Operacional da Frota Híbrida Suprema

> Este documento é a fonte única de regras de qualidade, despacho de skills e governança de IA para a frota.

## 1. Princípios Invariantes de Engenharia

1. **Evidência Antes de Afirmação:** Nunca declare uma correção ou funcionalidade sem rodar comandos reais de teste ou validação.
2. **Preservação de Contexto e Regras de Negócio:** Respeite rigorosamente `CONTEXTO_PROJETO.md`. Preserva autenticação, autorização, dados e integrações existentes.
3. **Desenvolvimento Disciplinado (Superpowers):**
   - Planeje antes de codificar (`writing-plans`, `brainstorming`).
   - Implemente com testes (`test-driven-development`).
   - Mantenha escopo enxuto (`ponytail`).
   - Verifique exaustivamente antes de concluir (`verification-before-completion`).
4. **Execução em Ondas Paralelas (Wave Execution):**
   - Só despache subagentes em paralelo quando as dependências forem nulas e os conjuntos de arquivos forem estritamente disjuntos.
5. **Segurança e Segredos:** Nunca comite tokens, chaves ou senhas em arquivos de código ou documentação.

---

## 2. Catálogo das 68 Skills do Kit Híbrido Supremo

### Metodologia & Engenharia Disciplinada (Superpowers)
| Skill | Gatilho de Uso / Escopo | Caminho do SKILL.md |
|---|---|---|
| `brainstorming` | Antes de qualquer trabalho criativo, arquitetura ou novas funcionalidades | `.agents/skills/brainstorming/SKILL.md` |
| `using-superpowers` | Início de conversas para definir hábitos de planejamento e verificação | `.agents/skills/using-superpowers/SKILL.md` |
| `writing-plans` | Planejamento cirúrgico de tarefas complexas antes de alterar código | `.agents/skills/writing-plans/SKILL.md` |
| `executing-plans` | Execução ordenada de planos de implementação | `.agents/skills/executing-plans/SKILL.md` |
| `test-driven-development` | Desenvolvimento orientado a testes (test-first/TDD) | `.agents/skills/test-driven-development/SKILL.md` |
| `systematic-debugging` | Investigação sistemática de bugs e análise de causa-raiz (RCA) | `.agents/skills/systematic-debugging/SKILL.md` |
| `subagent-driven-development` | Condução de tarefas complexas via subagentes delegados | `.agents/skills/subagent-driven-development/SKILL.md` |
| `dispatching-parallel-agents` | Despacho de múltiplos agentes em tarefas sem dependências de arquivos | `.agents/skills/dispatching-parallel-agents/SKILL.md` |
| `using-git-worktrees` | Isolamento de branches e tarefas paralelas via worktrees | `.agents/skills/using-git-worktrees/SKILL.md` |
| `requesting-code-review` | Solicitação de revisão formal ao concluir features | `.agents/skills/requesting-code-review/SKILL.md` |
| `receiving-code-review` | Avaliação crítica e resolução rigorosa de apontamentos de code review | `.agents/skills/receiving-code-review/SKILL.md` |
| `verification-before-completion` | Verificação obrigatória de build/testes antes de declarar sucesso | `.agents/skills/verification-before-completion/SKILL.md` |
| `finishing-a-development-branch` | Finalização e integração limpa de branches de desenvolvimento | `.agents/skills/finishing-a-development-branch/SKILL.md` |
| `diagnosing-superpowers` | Diagnóstico de falhas operacionais ou regressões em sessões de IA | `.agents/skills/diagnosing-superpowers/SKILL.md` |
| `writing-skills` | Criação ou aprimoramento de novas skills | `.agents/skills/writing-skills/SKILL.md` |

### Web Moderna, React 19 & Vercel
| Skill | Gatilho de Uso / Escopo | Caminho do SKILL.md |
|---|---|---|
| `vercel-react-best-practices` | Diretrizes de performance React/Next.js da Engenharia da Vercel | `.agents/skills/vercel-react-best-practices/SKILL.md` |
| `vercel-composition-patterns` | Padrões de composição React escaláveis e desacoplamento de props | `.agents/skills/vercel-composition-patterns/SKILL.md` |
| `vercel-optimize` | Otimização de custos, caching e performance na Vercel | `.agents/skills/vercel-optimize/SKILL.md` |
| `vercel-react-view-transitions` | Animações fluidas nativas com a View Transitions API | `.agents/skills/vercel-react-view-transitions/SKILL.md` |
| `next-dev-loop` | Loop de desenvolvimento rápido e feedback Next.js / Turbopack | `.agents/skills/next-dev-loop/SKILL.md` |
| `next-bundle-optimizer` | Análise e redução cirúrgica de bundles JavaScript em Next.js | `.agents/skills/next-bundle-optimizer/SKILL.md` |
| `deploy-to-vercel` | Procedimentos de publicação e deploy na Vercel sob demanda | `.agents/skills/deploy-to-vercel/SKILL.md` |
| `vercel-cli-with-tokens` | Operações com Vercel CLI utilizando tokens de autenticação | `.agents/skills/vercel-cli-with-tokens/SKILL.md` |
| `find-skills` | Descoberta e recomendação de skills adicionais sob demanda | `.agents/skills/find-skills/SKILL.md` |
| `shadcn` | Gerenciamento e customização de componentes shadcn/ui | `.agents/skills/shadcn/SKILL.md` |
| `supabase-postgres-best-practices` | Melhores práticas PostgreSQL (índices, pools, queries e migrations) | `.agents/skills/supabase-postgres-best-practices/SKILL.md` |
| `gh-fix-ci` | Diagnóstico e correção de pipelines quebradas no GitHub Actions | `.agents/skills/gh-fix-ci/SKILL.md` |
| `differential-review` | Revisão diferencial de segurança para PRs e alterações críticas | `.agents/skills/differential-review/SKILL.md` |
| `web-design-guidelines` | Auditoria de UI contra diretrizes Web Interface Guidelines (WIG) | `.agents/skills/web-design-guidelines/SKILL.md` |
| `writing-guidelines` | Revisão de prosa, documentação técnica e tom de voz | `.agents/skills/writing-guidelines/SKILL.md` |

### Domínio Criativo: Animações Avançadas & 3D (Resgate Estratégico)
| Skill | Gatilho de Uso / Escopo | Caminho do SKILL.md |
|---|---|---|
| `gsap-core` | Core da biblioteca GSAP, interpolações e propriedades de movimento | `.agents/skills/gsap-core/SKILL.md` |
| `gsap-react` | Integração do GSAP com React/Next.js (`useGSAP`, cleanup de memória) | `.agents/skills/gsap-react/SKILL.md` |
| `gsap-scrolltrigger` | Animações acionadas por scroll, pinning e parallax de alta performance | `.agents/skills/gsap-scrolltrigger/SKILL.md` |
| `gsap-timeline` | Sequenciamento complexo de timelines sincronizadas | `.agents/skills/gsap-timeline/SKILL.md` |
| `threejs-animation` | Cenas 3D interativas, shaders, modelos GLTF e WebGL | `.agents/skills/threejs-animation/SKILL.md` |
| `shader-glsl` | Shaders customizados em GLSL para efeitos visuais de ponta | `.agents/skills/shader-glsl/SKILL.md` |

### Psicologia Cognitiva & Leis de UX (Resgate Estratégico)
| Skill | Gatilho de Uso / Escopo | Caminho do SKILL.md |
|---|---|---|
| `ux-lei-de-fitts` | Otimização de tempos de clique, áreas de toque e botões de ação | `.agents/skills/ux-lei-de-fitts/SKILL.md` |
| `ux-lei-de-jakob` | Familiaridade de padrões mentais e redução de atrito de navegação | `.agents/skills/ux-lei-de-jakob/SKILL.md` |
| `ux-lei-de-miller` | Chunking de informações e limites de carga de trabalho mental (7±2) | `.agents/skills/ux-lei-de-miller/SKILL.md` |
| `ux-lei-de-hick` | Minimização do tempo de decisão em menus, preços e formulários | `.agents/skills/ux-lei-de-hick/SKILL.md` |
| `ux-lei-de-pragnanz` | Simplicidade visual, ordem e percepção Gestalt | `.agents/skills/ux-lei-de-pragnanz/SKILL.md` |
| `nielsen-heuristic-evaluation` | Avaliação heurística completa de usabilidade (10 Heurísticas de Nielsen) | `.agents/skills/nielsen-heuristic-evaluation/SKILL.md` |

### Fintech, Negócios & Mensageria Crítica (Resgate Estratégico)
| Skill | Gatilho de Uso / Escopo | Caminho do SKILL.md |
|---|---|---|
| `stripe-webhook-reconciliation` | Reconciliação de webhooks Stripe, idempotência e tratamento de falhas | `.agents/skills/stripe-webhook-reconciliation/SKILL.md` |
| `double-entry-accounting-ledger` | Ledger contábil de partidas dobradas para sistemas financeiros | `.agents/skills/double-entry-accounting-ledger/SKILL.md` |
| `whatsapp-business-api-integration` | Integração oficial com WhatsApp Business Cloud API da Meta | `.agents/skills/whatsapp-business-api-integration/SKILL.md` |

### Engenharia de IA, LLMs & Vetores (Resgate Estratégico)
| Skill | Gatilho de Uso / Escopo | Caminho do SKILL.md |
|---|---|---|
| `rag-triad-evaluation` | Avaliação de fidelidade de contexto, alucinação e qualidade em RAG | `.agents/skills/rag-triad-evaluation/SKILL.md` |
| `prompt-dspy-optimization` | Otimização sistemática de pipelines de prompts com DSPy | `.agents/skills/prompt-dspy-optimization/SKILL.md` |
| `llm-jailbreak-redteaming` | Testes de robustez contra injeção de prompt e jailbreak em LLMs | `.agents/skills/llm-jailbreak-redteaming/SKILL.md` |
| `vector-index-benchmarking` | Benchmarking de latência, recall e escalabilidade em bancos vetoriais | `.agents/skills/vector-index-benchmarking/SKILL.md` |

### Resiliência Backend, Escala & Mobile (Resgate Estratégico)
| Skill | Gatilho de Uso / Escopo | Caminho do SKILL.md |
|---|---|---|
| `zero-downtime-migrations` | Estratégia de migrações de banco em 5 fases sem lock ou downtime | `.agents/skills/zero-downtime-migrations/SKILL.md` |
| `redis-cache-stampede-prevention` | Travas probabilísticas (XFetch) e proteção contra avalanche de cache | `.agents/skills/redis-cache-stampede-prevention/SKILL.md` |
| `distributed-load-testing-k6` | Testes de carga e stress testing com k6 distribuído | `.agents/skills/distributed-load-testing-k6/SKILL.md` |
| `app-store-fastlane-automation` | Automação de builds, certificados e submissão nas lojas de aplicativos | `.agents/skills/app-store-fastlane-automation/SKILL.md` |

### Ferramentas de Documentação & Produtividade
| Skill | Gatilho de Uso / Escopo | Caminho do SKILL.md |
|---|---|---|
| `ponytail` | Manutenção da menor solução completa sem excesso de código | `.agents/skills/ponytail/SKILL.md` |
| `ponytail-audit` | Auditoria de dívida técnica e complexidade acidental | `.agents/skills/ponytail-audit/SKILL.md` |
| `ponytail-debt` | Identificação e redução de débito técnico | `.agents/skills/ponytail-debt/SKILL.md` |
| `ponytail-review` | Revisão de simplicidade e clareza de código | `.agents/skills/ponytail-review/SKILL.md` |
| `graphify` | Mapeamento estrutural de grafos e dependências do repositório | `.agents/skills/graphify/SKILL.md` |
| `docx` | Criação, leitura e manipulação de documentos Word (.docx) | `.agents/skills/docx/SKILL.md` |
| `pdf` | Manipulação e extração de documentos PDF | `.agents/skills/pdf/SKILL.md` |
| `pptx` | Geração e edição de apresentações PowerPoint (.pptx) | `.agents/skills/pptx/SKILL.md` |
| `xlsx` | Processamento, modelagem e validação de planilhas Excel (.xlsx) | `.agents/skills/xlsx/SKILL.md` |
| `skill-creator` | Criação e benchmark de skills compatíveis com agentskills.io | `.agents/skills/skill-creator/SKILL.md` |
| `mcp-builder` | Engenharia e desenvolvimento de servidores MCP | `.agents/skills/mcp-builder/SKILL.md` |
| `webapp-testing` | Testes automatizados de interfaces locais com Playwright | `.agents/skills/webapp-testing/SKILL.md` |
| `frontend-design` | Direção de arte e design intencional sem aspecto genérico | `.agents/skills/frontend-design/SKILL.md` |
| `web-artifacts-builder` | Construção de artefatos web interativos multi-componentes | `.agents/skills/web-artifacts-builder/SKILL.md` |
| `doc-coauthoring` | Co-autoria estruturada de documentação e especificações | `.agents/skills/doc-coauthoring/SKILL.md` |

---

## 3. Roster dos 25 Agentes Especialistas

Consulte `AGENTS.md` para o mapeamento detalhado dos 25 papéis em `.claude/agents`, `.gemini/agents` e `.codex/agents`.
