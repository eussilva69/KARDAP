# AGENTS.md | Centro de Comando & Orquestrador da Frota Híbrida Suprema

> Este repositório opera sob o **Kit Híbrido Supremo**: a disciplina rigorosa do Vibe Coding Toolkit (Superpowers, Wave Execution) unida aos domínios técnicos de elite (GSAP, Leis de UX, Fintech, RAG/IA, Resiliência e Mobile).

## 1. Início Obrigatório de Cada Tarefa
1. **Leia `AI_RULES.md`** na raiz do repositório antes de propor ou editar qualquer código.
2. **Leia `CONTEXTO_PROJETO.md`** (incluindo o Mapeamento de Pastas & Arquivos-Chave)
3. **Consulte `CONTEXTO_SKILLS_AGENTES.md`** para saber o catálogo e árvore de decisão dos 25 agentes e 68 skills para entender o produto, regras de negócio, contratos de API e invariantes. Nunca trate hipóteses como fatos.
3. Confirme o escopo do pedido. Execute mudanças localizadas, cirúrgicas e baseadas em evidências verificáveis.

## 2. Roster dos 25 Agentes Especialistas (Subagent Orchestration)
Quando a complexidade exigir delegação, convoque o especialista correspondente:

| Especialista | Gatilho de Uso / Especialidade |
|---|---|
| `orchestrator` | Coordenação geral de tarefas multi-camada (backend + frontend simultâneos). |
| `code-reviewer` | Revisão geral de código, qualidade, tratamento de erros e cobertura de testes. |
| `security-reviewer` | Vulnerabilidades OWASP, segredos no código, falhas de autenticação e CVEs. |
| `typescript-reviewer` | Segurança de tipos estrita, concorrência assíncrona e prototype pollution em TS/JS. |
| `react-reviewer` | Regras de hooks, limites server/client components, a11y e renderização React 19. |
| `react-build-resolver` | Erros de compilação, bundler quebrado, build ou servidor dev inoperante. |
| `test-engineer` | Testes unitários e de integração (test-first/TDD), cobrindo edge cases. |
| `qa-automation-engineer` | Testes E2E (Playwright) e quality gates de CI/CD para fluxos críticos. |
| `database-architect` | Modelagem de schema (Prisma/Drizzle/SQL), migrações seguras e queries. |
| `devops-engineer` | CI/CD pipelines, infraestrutura, Docker e operações de produção. |
| `backend-specialist` | Endpoints de API, lógica de negócio, autenticação e persistência. |
| `frontend-specialist` | Componentes UI, layout, CSS/Tailwind, design system e arquitetura frontend. |
| `seo-specialist` | Metadados, schema JSON-LD, sitemap, indexação e presença em IA. |
| `performance-optimizer` | Bottlenecks identificados por profiling, bundle size, Core Web Vitals. |
| `product-manager` | Requisitos ambíguos ou indefinidos antes da especificação da história. |
| `product-owner` | Traduz objetivos de negócio em critérios de aceite verificáveis. |
| `project-planner` | Quebra de épicos ou features em tarefas ordenadas e executáveis. |
| `code-archaeologist` | Mapeamento e compreensão de código legado ou não documentado. |
| `debugger` | Investigação de causa-raiz (RCA) antes de propor qualquer correção. |
| `explorer-agent` | Exploração e mapeamento de bases de código complexas ou desconhecidas. |
| `documentation-writer` | Documentação técnica, READMEs, runbooks e guias de API sob demanda. |
| `penetration-tester` | Testes de invasão simulados em fluxos de autenticação ou releases. |
| `security-auditor` | Auditoria de defesa em profundidade e modelagem de ameaças (STRIDE). |
| `mobile-developer` | Desenvolvimento mobile (Flutter, React Native, Swift, Kotlin, Capacitor/PWA) e publicação em lojas. |
| `ai-engineer` | Inteligência artificial aplicada, arquiteturas RAG, orquestração de LLMs, embeddings e guardrails. |

## 3. Diretrizes de Execução
- **Superpowers Habit:** Brainstorming -> Planejamento -> TDD -> Execução -> Verificação de evidências antes de concluir.
- **Wave Execution:** Tarefas paralelas rodam apenas com dependências resolvidas e conjuntos de arquivos disjuntos.
- **Deploy Safety:** Commits na frota contêm `[skip ci] [skip netlify] [skip vercel]` para prevenir deploys automáticos em plataformas de hospedagem.
