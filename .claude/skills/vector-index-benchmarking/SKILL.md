---
name: vector-index-benchmarking
description: Benchmark de ANN/HNSW/IVF e busca híbrida com recall@k, latência, memória e freshness.
---

# vector-index-benchmarking

## Quando ativar
Quando trocar banco vetorial, índice ANN, embedding ou estratégia de ranking.

## Resultado e limites
Esta skill transforma uma tarefa pontual em um procedimento reproduzível. Não determina a stack nem concede acesso a serviços; comece identificando o que está implementado, permissões e ambiente. Evite executar o workflow se ele não for aplicável ao repositório.

## Preparação mínima
1. Ler `CONTEXTO_PROJETO.md` e a seção necessária de `AI_RULES.md` quando disponíveis; validar informações contra o código.
2. Inspecionar `git status` sem sobrescrever modificações existentes e mapear fluxo, dependências, risco e comando de teste real.
3. Distinguir: confirmado no código, observado por teste, hipótese, não verificável. Registrar baseline antes de editar.
4. Ações destrutivas, produção, compras/custos externos, migrações irreversíveis e leitura de dados sensíveis exigem autorização explícita.

## Protocolo de execução
1. Fixe dataset e consultas representativas; inclua idiomas, rare terms, no-answer, distribuições e ground truth.
2. Documente modelo de embedding, normalização, dimensão, métrica (cosine/dot/L2), filtros e tipo de índice.
3. Compute exaustivo/brute-force em subset manejável para obter referência de recall; não compare índices com embeddings distintos sem isolar fator.
4. Teste parâmetros efSearch/efConstruction, nprobe e quantização; rode warm/cold com replicação e ingestão.
5. Meça recall@k/MRR/NDCG, p50/p95/p99, QPS, uso de RAM/disk, tempo build, custo e atualização de índices.
6. Analise segmentação por filtros, cardinalidade e skew; avalie busca híbrida/reranking com peso no custo.
7. Escolha Pareto frontier de qualidade/latência/custo em vez de um valor isolado.

## Verificações e critérios de aceitação
- Dataset versionado, parâmetros, hardware, números por fatia, curvas recall-latência e query traces com texto minimizado.

## Entrega obrigatória
Matriz comparativa reproduzível, configuração recomendada, trade-offs e rollout com rollback.

Para toda entrega, anote: escopo, arquivos relevantes, baseline, alteração ou recomendação, teste realmente executado (com resultado), riscos restantes e próximos passos. Nunca afirme validação, resultado quantitativo ou ausência de falhas sem evidência.

## Restrições específicas
Não prometer qualidade de resposta RAG apenas por recall alto.

## Ferramentas/comandos candidatos (não executar automaticamente)
Faiss, pgvector, Qdrant, Milvus conforme projeto.

## Referência para consulta e checagem de versão
- https://github.com/pgvector/pgvector

> Este playbook foi redigido para uso interno; não implica certificação, suporte oficial do fornecedor nem execução prévia de testes.
