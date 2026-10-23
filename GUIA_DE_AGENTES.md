# GUIA DE SUBAGENTES | Claude Code + Gemini CLI + Codex

## 1. Onde cada ferramenta lê os agentes

- **Claude Code**: `.claude/agents/*.md`, arquivos Markdown com YAML frontmatter (`name`, `description`, `tools`).
- **Gemini CLI**: `.gemini/agents/*.md`, arquivos Markdown com YAML frontmatter (`name`, `description`, `kind: "local"`, opcionalmente `tools`).
- **Codex (CLI/IDE)**: `.codex/agents/*.toml`, cada arquivo TOML com `name`, `description` e `developer_instructions`. O arquivo `.codex/config.toml` habilita a execução de subagentes delegados e configura concorrência.
- `CLAUDE.md`, `GEMINI.md` e `AGENTS.md` continuam sendo os arquivos de **instrução principal** de cada ferramenta na raiz do repositório.
- O kit contém **51 perfis de especialistas equivalentes** nas três ferramentas, totalizando **153 definições** prontas para uso.

---

## 2. Fusões e Deduplicações Aplicadas

Para evitar redundância e entregar a máxima potência técnica, os agentes dos repositórios base foram integrados e deduplicados:

1. **`agent-organizer`** (lst97 + VAMFI `chief-architect`): Unifica orquestração inteligente de times (1 a 3 especialistas) com o *Think Protocol* da Anthropic (`think`, `think hard`, `think harder`, `ultrathink`) e decomposição em 3 fases de execução.
2. **`implementation-planner`** (VAMFI `implementation-planner` + `brahma-analyzer`): Unifica criação de planos cirúrgicos e reversíveis com análise de consistência cruzada entre artefatos (spec -> plan -> task -> code) e pontuação de qualidade mínima de 80.
3. **`deployment-engineer`** (lst97 + VAMFI `brahma-deployer`): Unifica automação de CI/CD, Docker e Kubernetes com estratégia de release canário, health probes contínuos e auto-rollback imediato.
4. **`debugger`** (lst97 + VAMFI `brahma-investigator`): Unifica diagnóstico de testes/erros com investigação profunda da causa raiz (não remediar apenas sintomas) e ciclo disciplinado de auto-correção em até 3 tentativas.
5. **`performance-engineer`** (lst97 + VAMFI `brahma-optimizer`): Unifica profiling de gargalos de código/memória com auto-scaling horizontal/vertical e ciclo sistemático (Measure, Optimize, Scale, Validate).
6. **`full-stack-developer`** (lst97 + VAMFI `code-implementer`): Unifica desenvolvimento completo (UI ao banco) com execução cirúrgica orientada a planos e ciclo PDCA estrito guiado por testes.
7. **`incident-responder`** (lst97 `incident-responder` + `devops-incident-responder`): Unifica comando de incidentes (Incident Commander, triagem dos primeiros 5 minutos, war room e post-mortem sem culpa) com remediação técnica em containers e Kubernetes.
8. **`observability-engineer`** (VAMFI `brahma-monitor`): Focado nos 3 pilares da observabilidade (Métricas, Logs estruturados e Distributed Tracing com OpenTelemetry).
9. **`docs-researcher`** (VAMFI): Pesquisa rápida de documentações oficiais e atualizadas antes da codificação, evitando alucinações de APIs obsoletas.
10. **`electron-pro`**: Padronização e correção ortográfica do nome do arquivo (originalmente `electorn-pro.md`).

---

## 3. Catálogo Completo dos 51 Agentes

### A. Orquestração Meta & Planejamento
| Agente | Operação | Finalidade Principal |
|---|---|---|
| `agent-organizer` | Orquestração & Análise | Analisa o projeto, seleciona times ideais e orquestra workflows multi-agente com Think Protocol |
| `implementation-planner` | Planejamento & Consistência | Elabora planos cirúrgicos reversíveis e valida consistência entre especificação, tarefas e código |

### B. Especialistas Centrais do Kit Base (PT-BR)
| Agente | Operação | Finalidade Principal |
|---|---|---|
| `arquitetura-sistema` | Auditoria (Read-only) | Mapeia camadas, dependências, rotas e decisões estruturais sem alterar código |
| `especialista-frontend` | Implementação | Componentes, formulários, estados, navegação e interatividade preservando contratos |
| `especialista-backend-jobs` | Implementação | Filas, tarefas assíncronas, retries, webhooks, idempotência e APIs resilientes |
| `especialista-design-system` | Implementação | Tokens de design, tipografia, espaçamento e identidade autêntica sem templates genéricos |
| `especialista-imagens` | Implementação & Design | Seleciona, licencia, gera e integra imagens e assets visuais com acessibilidade e performance |
| `especialista-mobile-a11y` | Implementação | Responsividade mobile-first, alvos de toque (48x48px), WCAG 2.2 AA, Safari iOS e Android |
| `especialista-performance` | Implementação | Core Web Vitals (LCP, INP, CLS), redução de bundle, fontes e carregamento eficiente |
| `especialista-seguranca-privacidade` | Auditoria (Read-only) | Auditoria de autenticação, LGPD, permissões, proteção de dados e segredos |
| `especialista-seo` | Implementação | Rastreamento, indexação, canonical, meta tags, OpenGraph e dados estruturados Schema.org |
| `especialista-testes-qa` | Testes & QA | Criação e execução de testes reais, evidências, cenários de falha e prevenção de regressão |
| `especialista-ux-ui` | Auditoria (Read-only) | Avaliação heurística de Nielsen, prevenção de "Norman Doors", microcopy e hierarquia |
| `revisor-independente` | Auditoria (Read-only) | Code review independente pós-implementação com foco em riscos reais e regressões |

### C. Desenvolvimento Full-Stack, Linguagens & Frameworks
| Agente | Operação | Finalidade Principal |
|---|---|---|
| `full-stack-developer` | Implementação | Desenvolvimento ponta a ponta (UI ao banco) com precisão cirúrgica e validação por testes |
| `frontend-developer` | Implementação | Desenvolvimento de UI moderno com React/Vue/Angular, layout responsivo e estado cliente |
| `backend-architect` | Implementação / Design | Arquitetura backend, APIs RESTful, limites de microserviços, resiliência e modelagem |
| `react-pro` | Implementação | Especialista avançado em React (hooks personalizados, renderização, context e performance) |
| `nextjs-pro` | Implementação | Especialista em Next.js (App Router, Server Components, SSR/SSG e Server Actions) |
| `typescript-pro` | Implementação | Tipagem estrita avançada, refatorações typesafe, generics e contratos de interface |
| `python-pro` | Implementação | Python idiomático e moderno (FastAPI, Django, tipagem estrita, async e packaging) |
| `golang-pro` | Implementação | Go idiomático de alto desempenho (goroutines, canais, microsserviços e ferramentas CLI) |
| `mobile-developer` | Implementação | Aplicativos mobile cross-platform (React Native, Flutter) e pontes com APIs nativas |
| `electron-pro` | Implementação | Aplicações desktop multiplataforma com Electron, comunicação IPC segura e empacotamento |
| `dx-optimizer` | Implementação | Developer Experience (tooling, linters, scripts de automação, monorepos e pipelines locais) |
| `legacy-modernizer` | Implementação | Refatoração de código legado, migração gradual de versões e modernização com baixo risco |

### D. UI, UX & Design
| Agente | Operação | Finalidade Principal |
|---|---|---|
| `ui-designer` | Design & UI | Criação visual de interfaces, componentes acessíveis, consistência estética e design system |
| `ux-designer` | Design & UX | Arquitetura de informação, fluxos de usuário, wireframes, usabilidade e redução de fricção |

### E. Infraestrutura, Cloud & SRE
| Agente | Operação | Finalidade Principal |
|---|---|---|
| `cloud-architect` | Arquitetura Cloud | Arquitetura em nuvem (AWS/Azure/GCP), IaC (Terraform), topologia de rede e otimização de custo |
| `deployment-engineer` | CI/CD & Release | Pipelines de CI/CD, Docker, Kubernetes, releases canário e estratégias de zero-downtime |
| `incident-responder` | SRE & Emergências | Incident Commander para triagem imediata de crises, war rooms, post-mortem e mitigação DevOps |
| `observability-engineer` | Observabilidade | Configuração dos 3 pilares: Métricas (Prometheus), Logs JSON e Tracing (OpenTelemetry) |
| `performance-engineer` | Performance & Escala | Profiling de CPU/memória, benchmarks de carga (k6/wrk), caching multi-nível e auto-scaling |

### F. Qualidade, Testes & Diagnóstico
| Agente | Operação | Finalidade Principal |
|---|---|---|
| `debugger` | Diagnóstico & Fix | Investigação sistemática da causa raiz de bugs, análise de stack traces e fixes com 3 retries |
| `code-reviewer` | Auditoria (Read-only) | Revisão rigorosa de código, qualidade, segurança, clareza e conformidade técnica |
| `architect-review` | Auditoria (Read-only) | Revisão arquitetural de PRs, SOLID, clean architecture e acoplamento indevido |
| `qa-expert` | Estratégia QA | Estratégias completas de teste, planos de garantia de qualidade e critérios de aceite |
| `test-automator` | Implementação de Testes | Automação completa de suítes de teste (unitários, integração e E2E com Jest, Vitest, Playwright) |

### G. Dados & Inteligência Artificial
| Agente | Operação | Finalidade Principal |
|---|---|---|
| `ai-engineer` | Implementação de IA | Aplicações com LLMs, sistemas RAG, busca vetorial e orquestração de workflows de IA |
| `prompt-engineer` | Engenharia de Prompts | Criação e otimização de prompts avançados (Few-shot, Chain-of-Thought, ReAct) e métricas |
| `ml-engineer` | MLOps & Machine Learning | Pipelines de ML, feature engineering, serving de modelos e monitoramento de drift |
| `data-engineer` | Engenharia de Dados | Pipelines ETL/ELT escaláveis, modelagem de dados, data warehouses e data lakes |
| `data-scientist` | Análise de Dados | Consultas analíticas SQL avançadas, BigQuery, estatística aplicada e insights de dados |
| `database-optimizer` | Banco de Dados | Otimização de queries SQL, estratégias de indexação, profiling com EXPLAIN e tuning |
| `postgres-pro` | Especialista Postgres | Recursos avançados de PostgreSQL, extensões, particionamento e ajuste de performance |
| `graphql-architect` | Arquitetura GraphQL | Schemas GraphQL eficientes, resolvers otimizados (DataLoader), federation e subscriptions |

### H. Segurança
| Agente | Operação | Finalidade Principal |
|---|---|---|
| `security-auditor` | Auditoria (Read-only) | Identificação de vulnerabilidades (OWASP), análise de autenticação, segredos e pen-testing |

### I. Documentação & Pesquisa
| Agente | Operação | Finalidade Principal |
|---|---|---|
| `docs-researcher` | Pesquisa (Read-only) | Pesquisa rápida de documentação oficial recente para ancorar o código em fatos verificados |
| `api-documenter` | Documentação Técnica | Especificações OpenAPI/Swagger, coleções Postman, SDK guides e contratos de API |
| `documentation-expert` | Documentação Geral | Redação técnica profissional, manuais, guias de arquitetura e manutenção de READMEs |

### J. Produto & Negócios
| Agente | Operação | Finalidade Principal |
|---|---|---|
| `product-manager` | Estratégia de Produto | Definição de requisitos, histórias de usuário, critérios de sucesso e roadmap de produto |

---

## 4. Como Acionar os Agentes

### Claude Code
1. Digite `/agents` no chat do Claude Code para visualizar a lista completa de especialistas carregados.
2. Para delegar:
   > "Delegue ao subagente `agent-organizer` a análise da arquitetura e a formação da equipe necessária para a tarefa X."
   > "Peça ao `docs-researcher` que pesquise a API oficial da biblioteca Y antes de começarmos a implementação."
   > "Use o `debugger` para investigar a causa raiz do erro no arquivo Z sem aplicar remendos superficiais."

### Gemini CLI
1. Digite `/agents` no Gemini CLI para listar os agentes locais registrados em `.gemini/agents/*.md`.
2. Para acionar um especialista específico:
   > `@agent-organizer Analise as dependências e recomende a sequência de especialistas para refatorar o módulo de autenticação.`
   > `@debugger Investigue o stack trace do erro de timeout no banco de dados.`

### OpenAI Codex
1. Inicie uma nova sessão na raiz do projeto (onde o arquivo `.codex/config.toml` está ativo).
2. Para delegar:
   > "Consulte o subagente `agent-organizer` para planejar as fases da tarefa e acione o `full-stack-developer` para implementar a alteração aprovada."

---

## 5. Fluxo de Trabalho Multi-Agente Recomendado

```
               [Usuário / Solicitação]
                          │
                          ▼
                  agent-organizer
              (Analisa + Think Protocol)
                          │
       ┌──────────────────┼──────────────────┐
       ▼                  ▼                  ▼
 docs-researcher   implementation-planner  ui-designer / ux-designer
 (Pesquisa oficial) (Plano cirúrgico + QA) (Arquitetura visual / UX)
       │                  │                  │
       └──────────────────┬──────────────────┘
                          │
                          ▼
      full-stack-developer / especialista-*
               (Execução cirúrgica + PDCA)
                          │
       ┌──────────────────┴──────────────────┐
       ▼                                     ▼
test-automator / qa-expert           code-reviewer / revisor-independente
  (Testes automatizados)                (Revisão independente de diffs)
                          │
                          ▼
                 deployment-engineer
               (Release canário seguro)
```

---

## 6. Diretrizes de Segurança e Boas Práticas

- **Permissões Reais**: Agentes de auditoria (`Read-only`) foram configurados sem ferramentas de escrita. No Codex, a sandbox é compartilhada com o processo pai; portanto, sempre verifique o modo de aprovação.
- **Não Concorrência**: Nunca delegue edições simultâneas no mesmo arquivo para agentes diferentes. Conclua a tarefa de um implementador antes de iniciar outro.
- **Evidências Reais**: Nenhum agente pode assumir resultados de testes que não foram efetivamente executados no terminal local.
- **Segredos e Produção**: Nenhum agente tem permissão para commitar, dar push, deploy em produção ou expor chaves de API sem autorização explícita do usuário.
