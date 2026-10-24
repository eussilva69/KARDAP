---
name: zero-downtime-migrations
description: Migrações de banco sem indisponibilidade usando expand/contract, dual-read/write quando adequado e rollback.
---

# zero-downtime-migrations

## Quando ativar
Quando alterar schema, renomear colunas, descontinuar campos, migrar grande volume de dados ou APIs com deploys independentes.

## Resultado e limites
Esta skill transforma uma tarefa pontual em um procedimento reproduzível. Não determina a stack nem concede acesso a serviços; comece identificando o que está implementado, permissões e ambiente. Evite executar o workflow se ele não for aplicável ao repositório.

## Preparação mínima
1. Ler `CONTEXTO_PROJETO.md` e a seção necessária de `AI_RULES.md` quando disponíveis; validar informações contra o código.
2. Inspecionar `git status` sem sobrescrever modificações existentes e mapear fluxo, dependências, risco e comando de teste real.
3. Distinguir: confirmado no código, observado por teste, hipótese, não verificável. Registrar baseline antes de editar.
4. Ações destrutivas, produção, compras/custos externos, migrações irreversíveis e leitura de dados sensíveis exigem autorização explícita.

## Protocolo de execução
1. Identifique SGBD, volume, transações ativas, versões coexistentes, dependências ORM e estratégia de deploy; não presuma zero downtime sem observar infraestrutura.
2. Meça baseline: consultas, locks, replication lag, índice/tabela, latências p95/p99, backups e testes de restauração; classifique operações de lock/rewrite conforme versão do banco.
3. EXPAND: adicione novo campo/tabela/índice de forma backward-compatible, preferindo criação concorrente de índice quando suportada; inclua controle de versão e feature flag.
4. Faça backfill em lotes limitados por pressão de IO, com checkpoint reentrante, verificação de contagem/checksum e limites de rate; não use transação única em dados grandes.
5. Troque leituras progressivamente, assegure compatibilidade entre versões em produção e monitore erro, divergência de dados e métricas de lock.
6. CONTRACT só após confirmar remoção de consumidores antigos e janela de observação; alterações destrutivas requerem aprovação, backup e plano de rollback distinguindo reversão de software da reversão de dados.
7. Verifique idempotência de migração, execução repetida, falha no meio, restart, replicação e cenários de deploy parcial.

## Verificações e critérios de aceitação
- Testes de schema antigo/novo, comandos de migração `--dry-run` se disponíveis, fluxo de restore em staging, amostras de integridade pré/pós; não execute DDL em produção por conta própria.
- Regras de parada: lock prolongado, lag acima do orçamento, checksum divergente, p99 regressivo.

## Entrega obrigatória
Plano expand/backfill/switch/contract; tabela de compatibilidade; rollback viável; SQL real revisado; evidências com timestamps e métricas.
Se impossível medir em ambiente real, marque como plano não validado.

Para toda entrega, anote: escopo, arquivos relevantes, baseline, alteração ou recomendação, teste realmente executado (com resultado), riscos restantes e próximos passos. Nunca afirme validação, resultado quantitativo ou ausência de falhas sem evidência.

## Restrições específicas
Proibido criar migração destrutiva ou operar banco real sem autorização específica; preserve PII e integridade referencial.

## Ferramentas/comandos candidatos (não executar automaticamente)
psql EXPLAIN; ferramentas oficiais do ORM; métricas do SGBD; gh-ost/pt-online-schema-change somente quando aplicáveis.

## Referência para consulta e checagem de versão
- https://www.postgresql.org/docs/current/sql-createindex.html

> Este playbook foi redigido para uso interno; não implica certificação, suporte oficial do fornecedor nem execução prévia de testes.
