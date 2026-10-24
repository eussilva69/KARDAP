---
name: agent-context-compression
description: Compactação verificável de histórico, memória e contexto de agentes sem perder decisões e restrições críticas.
---

# agent-context-compression

## Quando ativar
Quando conversas e documentos excedem orçamento de tokens ou há perda de contexto em tarefas longas.

## Resultado e limites
Esta skill transforma uma tarefa pontual em um procedimento reproduzível. Não determina a stack nem concede acesso a serviços; comece identificando o que está implementado, permissões e ambiente. Evite executar o workflow se ele não for aplicável ao repositório.

## Preparação mínima
1. Ler `CONTEXTO_PROJETO.md` e a seção necessária de `AI_RULES.md` quando disponíveis; validar informações contra o código.
2. Inspecionar `git status` sem sobrescrever modificações existentes e mapear fluxo, dependências, risco e comando de teste real.
3. Distinguir: confirmado no código, observado por teste, hipótese, não verificável. Registrar baseline antes de editar.
4. Ações destrutivas, produção, compras/custos externos, migrações irreversíveis e leitura de dados sensíveis exigem autorização explícita.

## Protocolo de execução
1. Meça consumo de tokens por sistema, ferramentas, documentos, mensagens e resultados; identifique repetição e contexto obsoleto.
2. Classifique informações: invariantes de segurança/negócio, decisões aprovadas, estado verificável, dados recuperáveis e material transitório.
3. Resuma hierarquicamente por tarefa/época, preservando IDs, status de decisão, premissas, citações, TODOs e instruções de segurança sem paráfrase arriscada.
4. Guarde ponteiros para artefatos originais e hashes para permitir recuperação; não use resumo como única fonte para decisões críticas.
5. Crie testes com perguntas de recuperação, regressão de decisões e checagens de fatos sensíveis.
6. Ajuste windowing, truncamento de logs e recuperação sob demanda; evite carregar 30 skills integralmente em toda tarefa.
7. Monitore custo, latência, respostas incorretas por esquecimento e divergências de resumo.

## Verificações e critérios de aceitação
- Comparar respostas com contexto inteiro versus comprimido em conjunto de perguntas; registrar taxa de perda factual e tamanho.
- Testar promessas/estado de commit contra fontes reais.

## Entrega obrigatória
Estratégia de resumo, esquema de memória, testes de recall, economia medida e falhas conhecidas.

Para toda entrega, anote: escopo, arquivos relevantes, baseline, alteração ou recomendação, teste realmente executado (com resultado), riscos restantes e próximos passos. Nunca afirme validação, resultado quantitativo ou ausência de falhas sem evidência.

## Restrições específicas
Não retenha segredos/PII em resumo; privilégios e proibições nunca podem ser comprimidos a ponto de mudar sentido.

## Ferramentas/comandos candidatos (não executar automaticamente)
Contador de tokens, testes de recuperação, versionamento de memória.

## Referência para consulta e checagem de versão
- https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

> Este playbook foi redigido para uso interno; não implica certificação, suporte oficial do fornecedor nem execução prévia de testes.


## Context-Compression Heuristics (Merged)
---
name: context-compression
description: Manage and compress conversation context in long sessions. Detect when context is growing large, summarize completed work phases, archive old findings while preserving key decisions. Prevents context degradation.
when_to_use: "When a session has 20+ turns, when context feels repetitive, when the agent is losing track of earlier work, or when the user says 'summarize what we've done'. NOT for short sessions."
allowed-tools: Read, Write, Grep
version: 1.0.0
effort: low
---

# Context Compression — Long Session Management

> Keep sessions productive by compressing completed work while preserving key decisions.

## Overview

Long sessions (30+ turns) cause context degradation — the AI loses track of earlier work, repeats itself, or forgets decisions. Context compression proactively summarizes completed phases so the context window stays focused on active work.

**Token Impact:** Recovers 5,000-15,000 tokens in long sessions by replacing verbose tool outputs with semantic summaries.

---

## When to Compress

| Signal | Action |
|---|---|
| Session has 20+ turns | Consider proactive compression |
| Agent repeats earlier suggestions | Context is saturated — compress now |
| User says "we already discussed this" | Compress immediately |
| Switching to a new phase of work | Compress the completed phase |
| Large tool output (500+ lines) | Micro-compact the output |

---

## Compression Levels

### Level 1: Micro-Compact (Tool Output)

Compress individual tool outputs while retaining semantic content:

```
❌ Before (raw grep output — 200 lines, ~4,000 tokens):
src/auth/jwt.ts:15: import { verify } from 'jsonwebtoken'
src/auth/jwt.ts:23: export function validateToken(token: string) {
src/auth/jwt.ts:24:   try {
src/auth/jwt.ts:25:     const decoded = verify(token, SECRET)
... (195 more lines)

✅ After (micro-compact — 5 lines, ~100 tokens):
Grep results for "jwt": Found 8 files, 42 matches.
Key files: src/auth/jwt.ts (main JWT logic), src/middleware/auth.ts (middleware),
src/api/login.ts (token creation). Token validation at jwt.ts:23-40.
Error handling at jwt.ts:42-55. Secret loaded from env at jwt.ts:8.
```

### Level 2: Phase Summary

Replace a completed work phase with a summary:

```
❌ Before (full research transcript — ~3,000 tokens):
[turn 1] Read package.json...
[turn 2] Read src/index.ts...
[turn 3] Grep for "auth"...
[turn 4] Found 8 files related to auth...
[turn 5] Read src/auth/jwt.ts...
... (10 more turns of exploration)

✅ After (phase summary — ~200 tokens):
## Research Phase Complete
- Project: Next.js 15 app with JWT auth
- Auth files: 8 files in src/auth/, src/middleware/, src/api/
- Token flow: login → create JWT → store in httpOnly cookie → validate in middleware
- Bug location: src/auth/jwt.ts:45 — expiry check uses `<` instead of `<=`
- Decision: Fix the comparison operator, add edge case test
```

### Level 3: Session Checkpoint

Full session summary for long-running work:

```markdown
## Session Checkpoint (Turn 35)

### Completed
- [x] Researched auth system (8 files, JWT flow mapped)
- [x] Fixed token expiry bug in jwt.ts:45
- [x] Added edge case test in jwt.test.ts
- [x] Verified: all 42 tests passing

### In Progress
- [ ] Update API documentation
- [ ] Review related middleware

### Key Decisions
1. Keep httpOnly cookies (not localStorage) for token storage
2. Use `<=` for expiry check to include exact-moment expiry
3. Add 5-minute grace period for clock skew

### Files Modified
- src/auth/jwt.ts (line 45: comparison fix)
- tests/auth/jwt.test.ts (added 3 edge case tests)
```

---

## Compression Protocol

### Step 1: Identify Completed Phases
```
What work is DONE and won't be revisited?
→ Research findings already synthesized
→ Implementation already verified
→ Decisions already made and applied
```

### Step 2: Extract Key Information
```
From the completed phase, preserve:
✅ Decisions made and WHY
✅ File paths and line numbers of changes
✅ Key findings that inform ongoing work
✅ Error messages or test results (summarized)

Discard:
❌ Step-by-step tool invocation details
❌ Full file contents that were read
❌ Exploratory dead-ends that didn't lead anywhere
❌ Verbose error stack traces (keep the message only)
```

### Step 3: Write Summary
```
Use the Phase Summary format above.
Keep to 100-300 tokens per completed phase.
Include enough detail to resume work without re-reading.
```

---

## Best Practices

1. **Compress phases, not facts** — Individual decisions should stay, full transcripts should go
2. **Preserve "why" over "what"** — Why a decision was made matters more than the exact commands run
3. **Never auto-compress** — Always tell the user "I'm summarizing the completed research phase to keep context focused"
4. **Keep file references** — Always preserve file paths and line numbers in summaries
5. **Checkpoint on phase transitions** — Natural compression point when switching from research to implementation
