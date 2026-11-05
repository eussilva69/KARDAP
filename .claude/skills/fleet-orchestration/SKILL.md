---
name: fleet-orchestration
description: "Protocolo de orquestração multi-repositório para a frota de 29 projetos (+ ever-gauzy) e Kit Base. Abrange sincronização de skills/agentes, commits com identidade eussilva69, push em branches dinâmicas e tratamento de sparse-checkout."
when_to_use: "Ao replicar alterações na frota de 29 projetos (+ ever-gauzy), verificar paridade de arquivos de IA, comitar alterações em múltiplos repositórios ou lidar com exclusões temporárias de projetos."
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
version: 1.0.0
priority: CRITICAL
---

# Fleet Orchestration Protocol | Centro de Comando Antigravity

> **Espopo:** Gestão sincronizada da frota de 29 projetos (+ ever-gauzy) em `D:\PROJETOS CLAUDE` e da fonte da verdade em `D:\AGENTE DE TAREFAS ANTIGRAVTY\KIT BASE AGENTES E .MD`.

---

## 1. Regras Fundamentais de Execução

1. **Identidade Obrigatória:** Todo commit em qualquer projeto da frota deve usar obrigatoriamente:
   `-c user.name=eussilva69 -c user.email=eussilva69@users.noreply.github.com`
2. **Respeito a Branches Ativas:** Nunca presumir que todos os projetos estão na branch `main`:
   - `GUI DZN` -> `origin/master`
   - `Metropoles Burger` -> `origin/CERTO-USAR-ESSA`
   - `RBR` -> `origin/rbr-novo`
   - Demais 19 projetos -> `origin/main`
3. **Sparse-Checkout em `THALITA LP`:**
   Ao adicionar ou modificar arquivos nas pastas `.agents` ou `.claude` em `THALITA LP`, execute antes de qualquer `git add`:
   ```bash
   git -C "D:\PROJETOS CLAUDE\THALITA LP" sparse-checkout add .agents .claude
   ```
4. **Política de Exclusões ("Hold"):**
   Se o usuário solicitar que um projeto não seja tocado (ex: "não mexa no da Thay por enquanto"), NUNCA comite ou altere arquivos nele. Conclua as alterações nos demais, e ao final apresente ao usuário o comando ou prompt exato para quando ele liberar o projeto em questão.

---

## 2. Fluxo Operacional Padrão

```
1. Consolidar no Kit Base
      │
2. Executar scripts/sync_fleet.py [--exclude "NOME"]
      │
3. Executar scripts/audit_fleet.py (Validar paridade 113 skills / 80 agentes)
      │
4. Executar scripts/push_fleet.py -m "mensagem" [--exclude "NOME"]
```

---

## 3. Utilitários Disponíveis

- `python scripts/audit_fleet.py`: Auditoria completa com tabela de status, branches, contagens e working tree.
- `python scripts/sync_fleet.py`: Propagação idempotente do Kit Base para os 29 projetos (+ ever-gauzy).
- `python scripts/push_fleet.py`: Staging (`git add -A`), commit configurado e push automático na branch remota.
