---
name: architecture-decision-records-adr
description: Registro de decisões arquiteturais com contexto, opções, trade-offs, reversibilidade e impactos.
---

# architecture-decision-records-adr

## Quando ativar
Quando uma mudança afeta arquitetura, contratos, dados, custos, segurança ou manutenção de longo prazo.

## Resultado e limites
Esta skill transforma uma tarefa pontual em um procedimento reproduzível. Não determina a stack nem concede acesso a serviços; comece identificando o que está implementado, permissões e ambiente. Evite executar o workflow se ele não for aplicável ao repositório.

## Preparação mínima
1. Ler `CONTEXTO_PROJETO.md` e a seção necessária de `AI_RULES.md` quando disponíveis; validar informações contra o código.
2. Inspecionar `git status` sem sobrescrever modificações existentes e mapear fluxo, dependências, risco e comando de teste real.
3. Distinguir: confirmado no código, observado por teste, hipótese, não verificável. Registrar baseline antes de editar.
4. Ações destrutivas, produção, compras/custos externos, migrações irreversíveis e leitura de dados sensíveis exigem autorização explícita.

## Protocolo de execução
1. Descreva situação concreta e decisão necessária, donos, janela de decisão e restrições observadas no código.
2. Defina critérios ponderados: corretude, custo, time-to-market, reversibilidade, interoperabilidade e operação.
3. Avalie no mínimo duas opções genuínas mais status quo; considere o custo de não mudar.
4. Documente evidências, premissas, riscos e incertezas sem preencher faltas com conjecturas.
5. Escolha solução e explique por que alternativas foram rejeitadas; associe consequências positivas/negativas e métricas de sucesso.
6. Registre status proposto/aceito/substituído/depreciado, data, decisores e links para issues/experimentos.
7. Revisite quando premissas mudarem; decisões irreversíveis exigem validação e aprovação humana.

## Verificações e critérios de aceitação
- ADR legível, alternativas com comparativo, link para implementação/testes, estados atualizados após decisão.

## Entrega obrigatória
Arquivo docs/adr/NNNN-titulo.md ou padrão existente, status e critérios de reavaliação.

Para toda entrega, anote: escopo, arquivos relevantes, baseline, alteração ou recomendação, teste realmente executado (com resultado), riscos restantes e próximos passos. Nunca afirme validação, resultado quantitativo ou ausência de falhas sem evidência.

## Restrições específicas
Não forçar ADR para mudança trivial; não declarar aprovação em nome de decisores ausentes.

## Ferramentas/comandos candidatos (não executar automaticamente)
Git history, docs do projeto, template ADR.

## Referência para consulta e checagem de versão
- https://adr.github.io/

> Este playbook foi redigido para uso interno; não implica certificação, suporte oficial do fornecedor nem execução prévia de testes.


## Architectural Decision-Making Framework (Merged)
---
name: architecture
description: Architectural decision-making framework. Requirements analysis, trade-off evaluation, ADR documentation. Use when making architecture decisions or analyzing system design.
when_to_use: "When making architectural decisions, evaluating trade-offs, writing ADRs, or analyzing system design. NOT for direct code implementation."
allowed-tools: Read, Glob, Grep
version: 1.0.0
---

# Architecture Decision Framework

> "Requirements drive architecture. Trade-offs inform decisions. ADRs capture rationale."

## 🎯 Selective Reading Rule

**Read ONLY files relevant to the request!** Check the content map, find what you need.

| File | Description | When to Read |
|------|-------------|--------------|
| `context-discovery.md` | Questions to ask, project classification | Starting architecture design |
| `trade-off-analysis.md` | ADR templates, trade-off framework | Documenting decisions |
| `pattern-selection.md` | Decision trees, anti-patterns | Choosing patterns |
| `examples.md` | MVP, SaaS, Enterprise examples | Reference implementations |
| `patterns-reference.md` | Quick lookup for patterns | Pattern comparison |

---

## 🔗 Related Skills

| Skill | Use For |
|-------|---------|
| `@[skills/database-design]` | Database schema design |
| `@[skills/api-patterns]` | API design patterns |
| `@[skills/deployment-procedures]` | Deployment architecture |

---

## Core Principle

**"Simplicity is the ultimate sophistication."**

- Start simple
- Add complexity ONLY when proven necessary
- You can always add patterns later
- Removing complexity is MUCH harder than adding it

---

## Validation Checklist

Before finalizing architecture:

- [ ] Requirements clearly understood
- [ ] Constraints identified
- [ ] Each decision has trade-off analysis
- [ ] Simpler alternatives considered
- [ ] ADRs written for significant decisions
- [ ] Team expertise matches chosen patterns
