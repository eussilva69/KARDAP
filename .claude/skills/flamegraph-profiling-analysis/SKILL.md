---
name: flamegraph-profiling-analysis
description: Investigação instrumentada de CPU, heap e flamegraphs para localizar hotspots reais.
---

# flamegraph-profiling-analysis

## Quando ativar
Quando há CPU elevada, latência de request, renderização lenta ou regressão de throughput sem causa conhecida.

## Resultado e limites
Esta skill transforma uma tarefa pontual em um procedimento reproduzível. Não determina a stack nem concede acesso a serviços; comece identificando o que está implementado, permissões e ambiente. Evite executar o workflow se ele não for aplicável ao repositório.

## Preparação mínima
1. Ler `CONTEXTO_PROJETO.md` e a seção necessária de `AI_RULES.md` quando disponíveis; validar informações contra o código.
2. Inspecionar `git status` sem sobrescrever modificações existentes e mapear fluxo, dependências, risco e comando de teste real.
3. Distinguir: confirmado no código, observado por teste, hipótese, não verificável. Registrar baseline antes de editar.
4. Ações destrutivas, produção, compras/custos externos, migrações irreversíveis e leitura de dados sensíveis exigem autorização explícita.

## Protocolo de execução
1. Estabeleça hipótese, versão do código, hardware, carga, perfil da requisição e baseline p50/p95/p99.
2. Reproduza com cenário determinístico, dados representativos e profiling com overhead controlado; capture CPU e stack em ambiente permitido.
3. Leia largura dos stacks, hot path, inclusive vs self-time, trabalho de GC, lock contention, I/O e custos induzidos pelo profiler.
4. Correlacione hotspot com chamadas específicas e spans de tracing. Separe CPU-bound de rede/banco e de impacto de alocação.
5. Priorize uma otimização por vez, calcule complexidade, custo de caching e risco de regressão; não use microbenchmark como proxy do sistema inteiro.
6. Reexecute mesma carga e configuração, com várias amostras, e compare mediana e variabilidade de latência/CPU/memória.
7. Remova instrumentação sensível ou temporária e documente incertezas.

## Verificações e critérios de aceitação
- Captura original e após a mudança identificadas com hash/commit e perfil da carga.
- Métricas de p95/p99, CPU, erro e throughput; teste funcional que protege comportamento.

## Entrega obrigatória
Top 3 stacks quentes com evidência, causa provável, mudança mensurada, custo/risco e próximo experimento.

Para toda entrega, anote: escopo, arquivos relevantes, baseline, alteração ou recomendação, teste realmente executado (com resultado), riscos restantes e próximos passos. Nunca afirme validação, resultado quantitativo ou ausência de falhas sem evidência.

## Restrições específicas
Não perfilar produção sem autorização e política de retenção; traces não devem conter tokens/PII.

## Ferramentas/comandos candidatos (não executar automaticamente)
perf, py-spy, node --cpu-prof, Chrome Performance quando disponíveis.

## Referência para consulta e checagem de versão
- https://www.brendangregg.com/flamegraphs.html

> Este playbook foi redigido para uso interno; não implica certificação, suporte oficial do fornecedor nem execução prévia de testes.


## Performance Profiling Principles (Merged)
---
name: performance-profiling
description: Performance profiling principles. Measurement, analysis, and optimization techniques.
when_to_use: "When diagnosing performance issues, running Lighthouse audits, analyzing bundle size, or optimizing Core Web Vitals."
allowed-tools: Read, Glob, Grep, Bash
version: 1.0.0
---

# Performance Profiling

> Measure, analyze, optimize - in that order.

## 🔧 Runtime Scripts

**Execute these for automated profiling:**

| Script | Purpose | Usage |
|--------|---------|-------|
| `scripts/lighthouse_audit.py` | Lighthouse performance audit | `python scripts/lighthouse_audit.py https://example.com` |

---

## 1. Core Web Vitals

### Targets

| Metric | Good | Poor | Measures |
|--------|------|------|----------|
| **LCP** | < 2.5s | > 4.0s | Loading |
| **INP** | < 200ms | > 500ms | Interactivity |
| **CLS** | < 0.1 | > 0.25 | Stability |

### When to Measure

| Stage | Tool |
|-------|------|
| Development | Local Lighthouse |
| CI/CD | Lighthouse CI |
| Production | RUM (Real User Monitoring) |

---

## 2. Profiling Workflow

### The 4-Step Process

```
1. BASELINE → Measure current state
2. IDENTIFY → Find the bottleneck
3. FIX → Make targeted change
4. VALIDATE → Confirm improvement
```

### Profiling Tool Selection

| Problem | Tool |
|---------|------|
| Page load | Lighthouse |
| Bundle size | Bundle analyzer |
| Runtime | DevTools Performance |
| Memory | DevTools Memory |
| Network | DevTools Network |

---

## 3. Bundle Analysis

### What to Look For

| Issue | Indicator |
|-------|-----------|
| Large dependencies | Top of bundle |
| Duplicate code | Multiple chunks |
| Unused code | Low coverage |
| Missing splits | Single large chunk |

### Optimization Actions

| Finding | Action |
|---------|--------|
| Big library | Import specific modules |
| Duplicate deps | Dedupe, update versions |
| Route in main | Code split |
| Unused exports | Tree shake |

---

## 4. Runtime Profiling

### Performance Tab Analysis

| Pattern | Meaning |
|---------|---------|
| Long tasks (>50ms) | UI blocking |
| Many small tasks | Possible batching opportunity |
| Layout/paint | Rendering bottleneck |
| Script | JavaScript execution |

### Memory Tab Analysis

| Pattern | Meaning |
|---------|---------|
| Growing heap | Possible leak |
| Large retained | Check references |
| Detached DOM | Not cleaned up |

---

## 5. Common Bottlenecks

### By Symptom

| Symptom | Likely Cause |
|---------|--------------|
| Slow initial load | Large JS, render blocking |
| Slow interactions | Heavy event handlers |
| Jank during scroll | Layout thrashing |
| Growing memory | Leaks, retained refs |

---

## 6. Quick Win Priorities

| Priority | Action | Impact |
|----------|--------|--------|
| 1 | Enable compression | High |
| 2 | Lazy load images | High |
| 3 | Code split routes | High |
| 4 | Cache static assets | Medium |
| 5 | Optimize images | Medium |

---

## 7. Anti-Patterns

| ❌ Don't | ✅ Do |
|----------|-------|
| Guess at problems | Profile first |
| Micro-optimize | Fix biggest issue |
| Optimize early | Optimize when needed |
| Ignore real users | Use RUM data |

---

> **Remember:** The fastest code is code that doesn't run. Remove before optimizing.
