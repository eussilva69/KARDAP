---
name: playwright-flaky-test-elimination
description: Diagnóstico e redução de flakiness em testes E2E Playwright, com sincronização por estado e isolamento.
---

# playwright-flaky-test-elimination

## Quando ativar
Quando testes E2E passam localmente e falham em CI de maneira intermitente.

## Resultado e limites
Esta skill transforma uma tarefa pontual em um procedimento reproduzível. Não determina a stack nem concede acesso a serviços; comece identificando o que está implementado, permissões e ambiente. Evite executar o workflow se ele não for aplicável ao repositório.

## Preparação mínima
1. Ler `CONTEXTO_PROJETO.md` e a seção necessária de `AI_RULES.md` quando disponíveis; validar informações contra o código.
2. Inspecionar `git status` sem sobrescrever modificações existentes e mapear fluxo, dependências, risco e comando de teste real.
3. Distinguir: confirmado no código, observado por teste, hipótese, não verificável. Registrar baseline antes de editar.
4. Ações destrutivas, produção, compras/custos externos, migrações irreversíveis e leitura de dados sensíveis exigem autorização explícita.

## Protocolo de execução
1. Reproduza flake com vários runs usando a mesma configuração, trace/video/screenshot e dados isolados; registre frequência em vez de afirmar 100% de eliminação.
2. Classifique causa: race de UI/API, seletor instável, animação, clock, rede, compartilhamento de fixture, paralelismo, backend ou dependência externa.
3. Troque sleeps arbitrários por assertions Playwright auto-wait e eventos observáveis; use roles e labels, não CSS frágil.
4. Intercepte somente dependências externas adequadas; evite mocks que escondem bugs de integração.
5. Isole storage state, usuários e dados por worker; garanta cleanup idempotente.
6. Verifique timeouts diferenciados, waiting de request relevante, critérios estáveis após loading e configurações de retry sem encobrir falhas.
7. Execute lote repetido em CI com trace on first retry, reporte antes/depois e distribuição de falhas.

## Verificações e critérios de aceitação
- Série de runs comparável (ex. 20+ se custo permitir), taxa de falha, trace e teste assertivo que falha quando comportamento de negócio falha.
- Não conte retry bem sucedido como teste estável.

## Entrega obrigatória
Root cause, diff do teste, séries antes/depois, efeitos sobre tempo de suíte e riscos não reproduzidos.

Para toda entrega, anote: escopo, arquivos relevantes, baseline, alteração ou recomendação, teste realmente executado (com resultado), riscos restantes e próximos passos. Nunca afirme validação, resultado quantitativo ou ausência de falhas sem evidência.

## Restrições específicas
Não desabilite teste nem aumente timeout indiscriminadamente apenas para passar.

## Ferramentas/comandos candidatos (não executar automaticamente)
npx playwright test --repeat-each=20 --workers=2 --trace=on-first-retry

## Referência para consulta e checagem de versão
- https://playwright.dev/docs/actionability

> Este playbook foi redigido para uso interno; não implica certificação, suporte oficial do fornecedor nem execução prévia de testes.


## Webapp Testing Principles (Merged)
---
name: webapp-testing
description: Web application testing principles. E2E, Playwright, deep audit strategies.
when_to_use: "When writing E2E tests with Playwright, performing deep web app audits, or testing user flows. Use with /test workflow."
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
version: 1.0.0
---

# Web App Testing

> Discover and test everything. Leave no route untested.

## 🔧 Runtime Scripts

**Execute these for automated browser testing:**

| Script | Purpose | Usage |
|--------|---------|-------|
| `scripts/playwright_runner.py` | Basic browser test | `python scripts/playwright_runner.py https://example.com` |
| | With screenshot | `python scripts/playwright_runner.py <url> --screenshot` |
| | Accessibility check | `python scripts/playwright_runner.py <url> --a11y` |

**Requires:** `pip install playwright && playwright install chromium`

---

## 1. Deep Audit Approach

### Discovery First

| Target | How to Find |
|--------|-------------|
| Routes | Scan app/, pages/, router files |
| API endpoints | Grep for HTTP methods |
| Components | Find component directories |
| Features | Read documentation |

### Systematic Testing

1. **Map** - List all routes/APIs
2. **Scan** - Verify they respond
3. **Test** - Cover critical paths

---

## 2. Testing Pyramid for Web

```
        /\          E2E (Few)
       /  \         Critical user flows
      /----\
     /      \       Integration (Some)
    /--------\      API, data flow
   /          \
  /------------\    Component (Many)
                    Individual UI pieces
```

---

## 3. E2E Test Principles

### What to Test

| Priority | Tests |
|----------|-------|
| 1 | Happy path user flows |
| 2 | Authentication flows |
| 3 | Critical business actions |
| 4 | Error handling |

### E2E Best Practices

| Practice | Why |
|----------|-----|
| Use data-testid | Stable selectors |
| Wait for elements | Avoid flaky tests |
| Clean state | Independent tests |
| Avoid implementation details | Test user behavior |

---

## 4. Playwright Principles

### Core Concepts

| Concept | Use |
|---------|-----|
| Page Object Model | Encapsulate page logic |
| Fixtures | Reusable test setup |
| Assertions | Built-in auto-wait |
| Trace Viewer | Debug failures |

### Configuration

| Setting | Recommendation |
|---------|----------------|
| Retries | 2 on CI |
| Trace | on-first-retry |
| Screenshots | on-failure |
| Video | retain-on-failure |

---

## 5. Visual Testing

### When to Use

| Scenario | Value |
|----------|-------|
| Design system | High |
| Marketing pages | High |
| Component library | Medium |
| Dynamic content | Lower |

### Strategy

- Baseline screenshots
- Compare on changes
- Review visual diffs
- Update intentional changes

---

## 6. API Testing Principles

### Coverage Areas

| Area | Tests |
|------|-------|
| Status codes | 200, 400, 404, 500 |
| Response shape | Matches schema |
| Error messages | User-friendly |
| Edge cases | Empty, large, special chars |

---

## 7. Test Organization

### File Structure

```
tests/
├── e2e/           # Full user flows
├── integration/   # API, data
├── component/     # UI units
└── fixtures/      # Shared data
```

### Naming Convention

| Pattern | Example |
|---------|---------|
| Feature-based | `login.spec.ts` |
| Descriptive | `user-can-checkout.spec.ts` |

---

## 8. CI Integration

### Pipeline Steps

1. Install dependencies
2. Install browsers
3. Run tests
4. Upload artifacts (traces, screenshots)

### Parallelization

| Strategy | Use |
|----------|-----|
| Per file | Playwright default |
| Sharding | Large suites |
| Workers | Multiple browsers |

---

## 9. Anti-Patterns

| ❌ Don't | ✅ Do |
|----------|-------|
| Test implementation | Test behavior |
| Hardcode waits | Use auto-wait |
| Skip cleanup | Isolate tests |
| Ignore flaky tests | Fix root cause |

---

> **Remember:** E2E tests are expensive. Use them for critical paths only.


## Verification Through Execution Protocol (Merged)
---
name: verify-changes
description: Prove code works by running it, not just checking it exists. Verification through execution rather than inspection. Use after writing or modifying code to ensure it actually functions correctly.
when_to_use: "After writing code, completing a feature, or fixing a bug. When the user says 'does this work?', 'test this', 'verify', or when /verify workflow is invoked. NOT for writing new code — for proving existing code works."
allowed-tools: Read, Bash, Grep, Glob
version: 1.0.0
effort: medium
---

# Verify Changes — Prove Code Works

> "Code that exists" ≠ "Code that works." This skill ensures changes are verified through execution.

## Core Principle

```
❌ Verification by inspection:  "I can see the function exists, it should work"
❌ Verification by assumption:  "The types check out, so it's correct"
✅ Verification by execution:   "I ran it, here's the output, it works because [evidence]"
```

---

## Verification Protocol

### Step 1: Identify What Changed
```
- Which files were modified?
- What behavior should be different now?
- What was the original bug/requirement?
```

### Step 2: Determine Verification Method

| Change Type | Verification Method |
|---|---|
| **Bug fix** | Reproduce the original bug scenario → confirm it no longer occurs |
| **New feature** | Run the feature → confirm expected output |
| **Refactor** | Run existing tests → confirm nothing broke |
| **API change** | Call the endpoint → confirm response shape |
| **UI change** | Render the component → confirm visual output |
| **Config change** | Load the config → confirm values applied |
| **Build/infra** | Run build command → confirm success |

### Step 3: Execute Verification

```bash
# For Node.js projects
npm run build          # Does it compile?
npm run test           # Do tests pass?
npm run dev            # Does it start?

# For specific files
node -e "require('./path/to/module'); console.log('✅ Loads correctly')"

# For API endpoints
curl http://localhost:3000/api/endpoint

# For scripts
python script.py --test
```

### Step 4: Report Evidence

```markdown
## Verification Report

### What was changed
- [File list and summary]

### How it was verified
- [Exact commands run]

### Evidence
- Build: ✅ Compiled without errors
- Tests: ✅ 42/42 passing
- Runtime: ✅ Server starts, endpoint returns expected JSON
- Edge case: ✅ Empty input handled correctly

### Not yet verified
- [Anything that couldn't be tested automatically]
```

---

## Verification Checklist by Project Type

### Web Application
- [ ] `npm run build` — compiles without errors
- [ ] `npm run lint` — no linting errors
- [ ] `npm run test` — all tests pass
- [ ] Dev server starts successfully
- [ ] Changed pages render correctly
- [ ] No console errors in browser

### API / Backend
- [ ] Server starts without errors
- [ ] Changed endpoints respond correctly
- [ ] Error cases return appropriate status codes
- [ ] Database queries execute successfully

### CLI / Script
- [ ] Script runs without errors
- [ ] Expected output matches actual output
- [ ] Error handling works (bad input test)
- [ ] Help/usage text is correct

---

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Fix |
|---|---|---|
| "It should work" | No evidence | Run it and show output |
| Only checking happy path | Bugs hide in edge cases | Test error paths too |
| Verifying only compilation | Compiles ≠ correct | Test runtime behavior |
| Skipping verification for "trivial" changes | Trivial changes cause real bugs | Verify everything |

---

## Integration with Other Skills

| After Using | Verify With |
|---|---|
| `frontend-design` → UI changes | Render in browser, check console |
| `backend-specialist` → API changes | curl endpoints, check responses |
| `database-design` → Schema changes | Run migrations, query data |
| `testing-patterns` → New tests | Run test suite, check coverage |


## TDD Workflow Principles (Merged)
---
name: tdd-workflow
description: Test-Driven Development workflow principles. RED-GREEN-REFACTOR cycle.
when_to_use: "When practicing Test-Driven Development, following RED-GREEN-REFACTOR cycle, or writing tests before implementation."
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
version: 1.0.0
---

# TDD Workflow

> Write tests first, code second.

---

## 1. The TDD Cycle

```
🔴 RED → Write failing test
    ↓
🟢 GREEN → Write minimal code to pass
    ↓
🔵 REFACTOR → Improve code quality
    ↓
   Repeat...
```

---

## 2. The Three Laws of TDD

1. Write production code only to make a failing test pass
2. Write only enough test to demonstrate failure
3. Write only enough code to make the test pass

---

## 3. RED Phase Principles

### What to Write

| Focus | Example |
|-------|---------|
| Behavior | "should add two numbers" |
| Edge cases | "should handle empty input" |
| Error states | "should throw for invalid data" |

### RED Phase Rules

- Test must fail first
- Test name describes expected behavior
- One assertion per test (ideally)

---

## 4. GREEN Phase Principles

### Minimum Code

| Principle | Meaning |
|-----------|---------|
| **YAGNI** | You Aren't Gonna Need It |
| **Simplest thing** | Write the minimum to pass |
| **No optimization** | Just make it work |

### GREEN Phase Rules

- Don't write unneeded code
- Don't optimize yet
- Pass the test, nothing more

---

## 5. REFACTOR Phase Principles

### What to Improve

| Area | Action |
|------|--------|
| Duplication | Extract common code |
| Naming | Make intent clear |
| Structure | Improve organization |
| Complexity | Simplify logic |

### REFACTOR Rules

- All tests must stay green
- Small incremental changes
- Commit after each refactor

---

## 6. AAA Pattern

Every test follows:

| Step | Purpose |
|------|---------|
| **Arrange** | Set up test data |
| **Act** | Execute code under test |
| **Assert** | Verify expected outcome |

---

## 7. When to Use TDD

| Scenario | TDD Value |
|----------|-----------|
| New feature | High |
| Bug fix | High (write test first) |
| Complex logic | High |
| Exploratory | Low (spike, then TDD) |
| UI layout | Low |

---

## 8. Test Prioritization

| Priority | Test Type |
|----------|-----------|
| 1 | Happy path |
| 2 | Error cases |
| 3 | Edge cases |
| 4 | Performance |

---

## 9. Anti-Patterns

| ❌ Don't | ✅ Do |
|----------|-------|
| Skip the RED phase | Watch test fail first |
| Write tests after | Write tests before |
| Over-engineer initial | Keep it simple |
| Multiple asserts | One behavior per test |
| Test implementation | Test behavior |

---

## 10. AI-Augmented TDD

### Multi-Agent Pattern

| Agent | Role |
|-------|------|
| Agent A | Write failing tests (RED) |
| Agent B | Implement to pass (GREEN) |
| Agent C | Optimize (REFACTOR) |

---

> **Remember:** The test is the specification. If you can't write a test, you don't understand the requirement.
