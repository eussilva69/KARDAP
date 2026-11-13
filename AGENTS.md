# AGENTS.md | Instruções da Frota Vibe Coding Toolkit

> Este repositório opera sob o **Vibe Coding Toolkit**: disciplina de engenharia, planejamento antes do código, orquestração de subagentes especialistas e verificações rigorosas de qualidade.

## 1. Início Obrigatório de Cada Tarefa
1. **Leia `AI_RULES.md`** na raiz do repositório antes de propor ou editar qualquer código.
2. **Leia `CONTEXTO_PROJETO.md`** para entender o produto, regras de negócio, contratos de API e invariantes. Nunca trate hipóteses como fatos.
3. Confirme o escopo do pedido. Execute mudanças localizadas e baseadas em evidências.

## 2. Roster de 23 Especialistas (Subagent Orchestration)
Quando a complexidade exigir delegação, convoque o especialista correspondente:

| Especialista | Gatilho de Uso |
|---|---|
| `orchestrator` | Tarefas complexas que cruzam múltiplas camadas (backend + frontend). |
| `code-reviewer` | Revisão geral de código, qualidade, tratamento de erros e cobertura de testes. |
| `security-reviewer` | Vulnerabilidades OWASP, segredos no código, falhas de autenticação e CVEs. |
| `typescript-reviewer` | Segurança de tipos, concorrência assíncrona e prototype pollution em TS/JS. |
| `react-reviewer` | Regras de hooks, limites server/client components, a11y e renderização. |
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

## 3. Diretrizes de Execução
- **Superpowers Habit:** Brainstorming -> Planejamento -> TDD -> Execução -> Verificação de evidências antes de concluir.
- **Wave Execution:** Tarefas paralelas rodam apenas com dependências resolvidas e conjuntos de arquivos disjuntos.
- **Deploy Safety:** Commits na frota contêm `[skip ci]` para prevenir deploys automáticos em plataformas de hospedagem.
