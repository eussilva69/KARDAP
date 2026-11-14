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


## Exemplos e Implementações de Produção

### 1. Algoritmo XFetch (Probabilistic Early Expiration)
Permite que o cache seja recalculado em background antes de expirar com probabilidade crescente:
```typescript
interface CachedItem<T> {
  value: T;
  delta: number;   // Tempo gasto na computação original (ms)
  expiry: number;  // Timestamp absoluto de expiração
}

export async function getWithXFetch<T>(
  redis: any,
  key: string,
  fetchFn: () => Promise<T>,
  ttlSeconds: number,
  beta: number = 1.0 // beta > 1 recalcula mais cedo; beta < 1 recalcula mais tarde
): Promise<T> {
  const raw = await redis.get(key);

  if (raw) {
    const item: CachedItem<T> = JSON.parse(raw);
    const now = Date.now();
    // Fórmula XFetch: -beta * delta * ln(random())
    const shouldRecompute = now - item.delta * beta * Math.log(Math.random()) >= item.expiry;

    if (!shouldRecompute) {
      return item.value;
    }
  }

  // Recalcula valor
  const start = Date.now();
  const value = await fetchFn();
  const delta = Date.now() - start;
  const expiry = Date.now() + ttlSeconds * 1000;

  const payload: CachedItem<T> = { value, delta, expiry };
  await redis.set(key, JSON.stringify(payload), 'EX', ttlSeconds);

  return value;
}
```

### 2. Lock Distribuído Simples (Set NX EX) para Prevenção de Stampede
```typescript
export async function getWithMutexLock<T>(
  redis: any,
  key: string,
  fetchFn: () => Promise<T>,
  ttlSeconds: number
): Promise<T> {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const lockKey = `lock:${key}`;
  const acquired = await redis.set(lockKey, 'locked', 'NX', 'EX', 10);

  if (acquired) {
    try {
      const freshData = await fetchFn();
      // Jitter para evitar expirações simultâneas
      const jitter = Math.floor(Math.random() * 30);
      await redis.set(key, JSON.stringify(freshData), 'EX', ttlSeconds + jitter);
      return freshData;
    } finally {
      await redis.del(lockKey);
    }
  } else {
    // Aguarda e tenta ler novamente
    await new Promise(r => setTimeout(r, 200));
    return getWithMutexLock(redis, key, fetchFn, ttlSeconds);
  }
}
```
