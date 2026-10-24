---
name: redis-cache-stampede-prevention
description: Desenho de cache com TTL, invalidação e mitigação de cache stampede/hot keys.
---

# redis-cache-stampede-prevention

## Quando ativar
Quando picos de miss sobrecarregam banco/API ou payloads cacheados ficam inconsistentes.

## Resultado e limites
Esta skill transforma uma tarefa pontual em um procedimento reproduzível. Não determina a stack nem concede acesso a serviços; comece identificando o que está implementado, permissões e ambiente. Evite executar o workflow se ele não for aplicável ao repositório.

## Preparação mínima
1. Ler `CONTEXTO_PROJETO.md` e a seção necessária de `AI_RULES.md` quando disponíveis; validar informações contra o código.
2. Inspecionar `git status` sem sobrescrever modificações existentes e mapear fluxo, dependências, risco e comando de teste real.
3. Distinguir: confirmado no código, observado por teste, hipótese, não verificável. Registrar baseline antes de editar.
4. Ações destrutivas, produção, compras/custos externos, migrações irreversíveis e leitura de dados sensíveis exigem autorização explícita.

## Protocolo de execução
1. Verifique se Redis/cache está em uso e qual objeto pode ser cacheado, classifique risco de stale data e PII.
2. Defina SLO de frescor, chave versionada, TTL e invalidação dependente de mutações; evite cache de autorização/per-user sem isolamento.
3. Meça hit/miss ratio, hot keys, evictions, latência e carga backend no cold start.
4. Escolha estratégia por caso: cache-aside, stale-while-revalidate, single-flight/mutex, jitter no TTL e early refresh probabilístico.
5. Implemente lock com lease, timeouts e deduplicação; não confunda SETNX ingênuo com correção distribuída garantida.
6. Simule simultaneidade de misses e falha do recomputador; garanta fallback e limite de recomputações.
7. Meça consistência após update, memória/eviction e impacto de cold starts com testes concorrentes.

## Verificações e critérios de aceitação
- Testes de burst, miss/stampede, stale data, lock expiry e falha de Redis; métricas de DB load e hit ratio.

## Entrega obrigatória
Decisão por tipo de dado, política de TTL/invalidação, testes de concorrência e métricas.

Para toda entrega, anote: escopo, arquivos relevantes, baseline, alteração ou recomendação, teste realmente executado (com resultado), riscos restantes e próximos passos. Nunca afirme validação, resultado quantitativo ou ausência de falhas sem evidência.

## Restrições específicas
Nunca cacheie segredos em chaves públicas; proteção de dados e multi-tenancy prevalecem sobre hit ratio.

## Ferramentas/comandos candidatos (não executar automaticamente)
Redis CLI (ambiente de teste), métricas cache e teste de carga controlado.

## Referência para consulta e checagem de versão
- https://redis.io/docs/latest/develop/

> Este playbook foi redigido para uso interno; não implica certificação, suporte oficial do fornecedor nem execução prévia de testes.
