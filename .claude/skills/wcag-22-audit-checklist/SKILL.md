---
name: wcag-22-audit-checklist
description: Auditoria acessível WCAG 2.2 em fluxos, teclado, leitores de tela, touch e validações.
---

# wcag-22-audit-checklist

## Quando ativar
Quando melhorar acessibilidade, verificar componentes ou preparar conformidade técnica WCAG 2.2 AA.

## Resultado e limites
Esta skill transforma uma tarefa pontual em um procedimento reproduzível. Não determina a stack nem concede acesso a serviços; comece identificando o que está implementado, permissões e ambiente. Evite executar o workflow se ele não for aplicável ao repositório.

## Preparação mínima
1. Ler `CONTEXTO_PROJETO.md` e a seção necessária de `AI_RULES.md` quando disponíveis; validar informações contra o código.
2. Inspecionar `git status` sem sobrescrever modificações existentes e mapear fluxo, dependências, risco e comando de teste real.
3. Distinguir: confirmado no código, observado por teste, hipótese, não verificável. Registrar baseline antes de editar.
4. Ações destrutivas, produção, compras/custos externos, migrações irreversíveis e leitura de dados sensíveis exigem autorização explícita.

## Protocolo de execução
1. Defina páginas/fluxos e critério de conformidade solicitado; priorize WCAG 2.2 AA, não exija AAA universal por padrão.
2. Rode checks automáticos para semântica, labels, contraste e relacionamentos, mas reserve testes manuais para comportamento.
3. Navegue só com teclado, verifique ordem/foco/escape/trap de modais, skip link e estados de erro; não use ARIA se HTML nativo resolve.
4. Teste viewport móvel, zoom 200%/400% conforme SC, reflow, orientação e alvo de toque; diferencie mínimo AA de boa prática ampliada (48px).
5. Verifique contraste 4.5:1 para texto normal e 3:1 para texto grande/componentes não textuais quando critérios se aplicam.
6. Teste VoiceOver/NVDA/TalkBack quando disponível, nomes acessíveis, alertas de status e formulários.
7. Reproduza e corrija por causa; reteste com mesmas condições e documente SC correspondentes.

## Verificações e critérios de aceitação
- Matriz SC/tela/repro/gravidade/resultado, screenshots com foco, logs de axe, testes reais de leitor de tela ou limitação explícita.

## Entrega obrigatória
Checklist priorizado e arquivos alterados; critérios testados/não testados e justificativas.

Para toda entrega, anote: escopo, arquivos relevantes, baseline, alteração ou recomendação, teste realmente executado (com resultado), riscos restantes e próximos passos. Nunca afirme validação, resultado quantitativo ou ausência de falhas sem evidência.

## Restrições específicas
Não afirmar certificação por passar ferramenta automatizada; WCAG AAA não deve ser promessa genérica.

## Ferramentas/comandos candidatos (não executar automaticamente)
axe-core, Lighthouse accessibility, browser e leitor de tela real.

## Referência para consulta e checagem de versão
- https://www.w3.org/TR/WCAG22/

> Este playbook foi redigido para uso interno; não implica certificação, suporte oficial do fornecedor nem execução prévia de testes.


## Web Interface Guidelines Compliance (Merged)
---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
when_to_use: "When auditing web UI for best practices, checking accessibility, or reviewing design against Web Interface Guidelines."
allowed-tools: Read, Grep, Glob, WebFetch
version: 1.0.0
metadata:
  author: vercel
  version: "1.0.0"
  argument-hint: <file-or-pattern>
---

# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines.

## How It Works

1. Fetch the latest guidelines from the source URL below
2. Read the specified files (or prompt user for files/pattern)
3. Check against all rules in the fetched guidelines
4. Output findings in the terse `file:line` format

## Guidelines Source

Fetch fresh guidelines before each review:

```
https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
```

Use WebFetch to retrieve the latest rules. The fetched content contains all the rules and output format instructions.

## Usage

When a user provides a file or pattern argument:
1. Fetch guidelines from the source URL above
2. Read the specified files
3. Apply all rules from the fetched guidelines
4. Output findings using the format specified in the guidelines

If no files specified, ask the user which files to review.

---

## Related Skills

| Skill | When to Use |
|-------|-------------|
| **[frontend-design](../frontend-design/SKILL.md)** | Before coding - Learn design principles (color, typography, UX psychology) |
| **web-design-guidelines** (this) | After coding - Audit for accessibility, performance, and best practices |

## Design Workflow

```
1. DESIGN   → Read frontend-design principles
2. CODE     → Implement the design
3. AUDIT    → Run web-design-guidelines review ← YOU ARE HERE
4. FIX      → Address findings from audit
```
