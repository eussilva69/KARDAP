---
name: sql-explain-analyze-mastery
description: Analisar query plans, cardinalidade e índices para reduzir latência de consultas SQL reais.
---

# sql-explain-analyze-mastery

## Quando ativar
Quando consultas lentas, seq scans caros, joins ruins ou timeout de banco aparecem em perfis.

## Resultado e limites
Esta skill transforma uma tarefa pontual em um procedimento reproduzível. Não determina a stack nem concede acesso a serviços; comece identificando o que está implementado, permissões e ambiente. Evite executar o workflow se ele não for aplicável ao repositório.

## Preparação mínima
1. Ler `CONTEXTO_PROJETO.md` e a seção necessária de `AI_RULES.md` quando disponíveis; validar informações contra o código.
2. Inspecionar `git status` sem sobrescrever modificações existentes e mapear fluxo, dependências, risco e comando de teste real.
3. Distinguir: confirmado no código, observado por teste, hipótese, não verificável. Registrar baseline antes de editar.
4. Ações destrutivas, produção, compras/custos externos, migrações irreversíveis e leitura de dados sensíveis exigem autorização explícita.

## Protocolo de execução
1. Capturar query parametrizada e métricas de p95, volume, padrões de filtro, concorrência e cardinalidade, sem logar valores sensíveis.
2. Inspecione versão/SGBD, estatísticas e índices existentes; capture EXPLAIN sem execução inicialmente quando necessário.
3. Use EXPLAIN ANALYZE (idealmente BUFFERS e timing conforme SGBD) somente em ambiente seguro; entenda riscos em DML, locks e queries custosas.
4. Compare estimativa vs linhas reais, filtros, sort, joins, spills, bitmap vs seq scans, cache hit e materialização.
5. Proponha índice B-tree parcial/composto, GIN/BRIN ou rewrite apenas se o plano e workload justificarem; meça custo de escrita e tamanho.
6. Rode teste com dados representativos e parâmetros seletivos/não seletivos, analise regressões e planos alternativos.
7. Documente rollout e rollback do índice incluindo lock, espaço, replicação e manutenção.

## Verificações e critérios de aceitação
- Plano antes/depois com buffers e duration, custo de índices, amostras por cardinalidade e métricas de write latency.

## Entrega obrigatória
SQL/plans anonimizados, diagnóstico de cardinalidade, mudança testada, impacto e risco.

Para toda entrega, anote: escopo, arquivos relevantes, baseline, alteração ou recomendação, teste realmente executado (com resultado), riscos restantes e próximos passos. Nunca afirme validação, resultado quantitativo ou ausência de falhas sem evidência.

## Restrições específicas
Nunca rode EXPLAIN ANALYZE de UPDATE/DELETE em produção sem transação/teste apropriado e autorização.

## Ferramentas/comandos candidatos (não executar automaticamente)
EXPLAIN (ANALYZE, BUFFERS, VERBOSE) em ambiente apropriado.

## Referência para consulta e checagem de versão
- https://www.postgresql.org/docs/current/using-explain.html

> Este playbook foi redigido para uso interno; não implica certificação, suporte oficial do fornecedor nem execução prévia de testes.
