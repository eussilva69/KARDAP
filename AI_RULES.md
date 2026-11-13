# AI_RULES.md | Contrato Operacional da Frota Vibe Coding Toolkit

> Este documento é a fonte única de regras de qualidade, despacho de skills e governança de IA para a frota.

## 1. Princípios Invariantes de Engenharia

1. **Evidência Antes de Afirmação:** Nunca declare uma correção ou funcionalidade sem rodar comandos reais de teste ou validação.
2. **Preservação de Contexto e Regras de Negócio:** Respeite rigorosamente `CONTEXTO_PROJETO.md`. Preserva autenticação, autorização, dados e integrações.
3. **Desenvolvimento Disciplinado (Superpowers):**
   - Planeje antes de codificar (`writing-plans`, `brainstorming`).
   - Implemente com testes (`test-driven-development`).
   - Mantenha escopo enxuto (`ponytail`).
   - Verifique exaustivamente antes de concluir (`verification-before-completion`).
4. **Execução em Ondas Paralelas (Wave Execution):**
   - Só despache subagentes em paralelo quando as dependências forem nulas e os conjuntos de arquivos forem estritamente disjuntos.
5. **Segurança e Segredos:** Nunca comite tokens, chaves ou senhas em arquivos de código ou documentação.

---

## 2. Catálogo das 45 Skills do Vibe Coding Toolkit

| Skill | Gatilho de Uso / Escopo | Caminho do SKILL.md |
|---|---|---|
| `brainstorming` | Antes de qualquer trabalho criativo, arquitetura ou novas funcionalidades | `.agents/skills/brainstorming/SKILL.md` |
| `using-superpowers` | Início de conversas para definir hábitos de planejamento e verificação | `.agents/skills/using-superpowers/SKILL.md` |
| `writing-plans` | Planejamento cirúrgico de tarefas complexas antes de alterar código | `.agents/skills/writing-plans/SKILL.md` |
| `executing-plans` | Execução ordenada de planos de implementação | `.agents/skills/executing-plans/SKILL.md` |
| `test-driven-development` | Desenvolvimento orientado a testes (test-first) | `.agents/skills/test-driven-development/SKILL.md` |
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
| `ponytail` | Manutenção da menor solução completa sem excesso de código | `.agents/skills/ponytail/SKILL.md` |
| `ponytail-audit` | Auditoria de dívida técnica e complexidade acidental | `.agents/skills/ponytail-audit/SKILL.md` |
| `ponytail-debt` | Identificação e redução de débito técnico | `.agents/skills/ponytail-debt/SKILL.md` |
| `ponytail-review` | Revisão de simplicidade e clareza de código | `.agents/skills/ponytail-review/SKILL.md` |
| `graphify` | Mapeamento estrutural de grafos e dependências do repositório | `.agents/skills/graphify/SKILL.md` |
| `vercel-react-best-practices` | Diretrizes de performance React/Next.js da Engenharia da Vercel | `.agents/skills/vercel-react-best-practices/SKILL.md` |
| `vercel-composition-patterns` | Padrões de composição React escaláveis e desacoplamento de props | `.agents/skills/vercel-composition-patterns/SKILL.md` |
| `web-design-guidelines` | Auditoria de UI contra diretrizes Web Interface Guidelines (WIG) | `.agents/skills/web-design-guidelines/SKILL.md` |
| `writing-guidelines` | Revisão de prosa, documentação técnica e tom de voz | `.agents/skills/writing-guidelines/SKILL.md` |
| `vercel-react-view-transitions` | Animações fluidas nativas com a View Transitions API | `.agents/skills/vercel-react-view-transitions/SKILL.md` |
| `vercel-optimize` | Otimização de custos, caching e performance na Vercel | `.agents/skills/vercel-optimize/SKILL.md` |
| `deploy-to-vercel` | Procedimentos de publicação e deploy na Vercel sob demanda | `.agents/skills/deploy-to-vercel/SKILL.md` |
| `vercel-cli-with-tokens` | Operações com Vercel CLI utilizando tokens de autenticação | `.agents/skills/vercel-cli-with-tokens/SKILL.md` |
| `find-skills` | Descoberta e recomendação de skills adicionais sob demanda | `.agents/skills/find-skills/SKILL.md` |
| `next-dev-loop` | Loop de desenvolvimento rápido e feedback Next.js / Turbopack | `.agents/skills/next-dev-loop/SKILL.md` |
| `next-bundle-optimizer` | Análise e redução cirúrgica de bundles JavaScript em Next.js | `.agents/skills/next-bundle-optimizer/SKILL.md` |
| `supabase-postgres-best-practices` | Melhores práticas PostgreSQL (índices, pools, queries e migrations) | `.agents/skills/supabase-postgres-best-practices/SKILL.md` |
| `gh-fix-ci` | Diagnóstico e correção de pipelines quebradas no GitHub Actions | `.agents/skills/gh-fix-ci/SKILL.md` |
| `differential-review` | Revisão diferencial de segurança para PRs e alterações críticas | `.agents/skills/differential-review/SKILL.md` |
| `shadcn` | Gerenciamento e customização de componentes shadcn/ui | `.agents/skills/shadcn/SKILL.md` |
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

## 3. Roster dos 23 Agentes Especialistas

Consulte `AGENTS.md` para o mapeamento dos 23 papéis dedicados em `.claude/agents`, `.gemini/agents` e `.codex/agents`.
