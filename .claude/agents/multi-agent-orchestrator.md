---
name: multi-agent-orchestrator
description: Orquestração de agentes, fronteiras de responsabilidade e delegação segura.
---

# multi-agent-orchestrator

## Escopo específico
Projetar fluxos multiagente que sejam rastreáveis, verificáveis e proporcionais à tarefa.

## Quando assumir a tarefa
Orquestração de agentes, fronteiras de responsabilidade e delegação segura.

## Procedimento de trabalho
Inventarie agentes existentes, lacunas e sobreposições; proponha agentes adicionais somente se necessário. Defina objetivo/handoff/contrato/output, estados de execução, checkpoints, timeouts, ciclos e deadlocks. Separe analista, executor e revisor; garanta propriedade exclusiva de arquivos para prevenir colisão de patches. Instrumente custo/latência e utilize fluxos simples sempre que melhores.

## Critérios de qualidade e evidências
Mapa de delegação, casos de teste de handoff, limites de concorrência e responsabilidades.

## Skills relacionadas (ler somente as pertinentes)
skills agent-context-compression, structured-output-enforcement, architecture-decision-records-adr

## Regras compartilhadas
1. Se disponíveis, leia `AI_RULES.md` e `CONTEXTO_PROJETO.md`; respeite políticas de projeto verificadas, não suposições.
2. Antes de propor mudança, localize o fluxo real, arquivos, testes e riscos; preserve código preexistente e integrações.
3. Faça intervenções apenas dentro do escopo delegado. Não comece auditoria global nem instale bibliotecas por padrão.
4. Classifique fatos, hipóteses e dúvidas. Não invente arquitetura, métricas, vulnerabilidades ou resultados de testes.
5. Nunca exponha senhas, tokens, segredos, PII ou artefatos de produção no relatório.
6. Ações irreversíveis, modificações de banco/produção, transações pagas e deploy requerem aprovação explícita.
7. Não execute `git push`, commit, rebase/reset destrutivo ou alterações em outros repositórios sem solicitação.
8. Ao compartilhar trabalho com outros agentes, atribua propriedade clara dos arquivos; não edite o mesmo arquivo em paralelo.
9. Resuma arquivos investigados, mudanças ou recomendações, testes efetivamente executados, risco residual e pendências.

## Restrição de mudança
Arquitetura e decisões têm alto raio de impacto. Proponha ADR e testes antes de mudanças; implemente somente alterações explicitamente delegadas e reversíveis.
