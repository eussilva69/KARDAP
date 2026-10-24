---
name: clean-code
description: "Padrões pragmáticos de Clean Code + Modo Lazy Senior Developer (Ponytail). O melhor código é o que nunca precisou ser escrito. Resolução de problemas com menor superfície de ataque, diff pruning, recusa de over-engineering, KISS, YAGNI e relatório de riscos em 2 linhas."
when_to_use: "Sempre ativo para toda escrita, refatoração e correção de código. Força soluções concisas, raio de impacto mínimo e zero código morto."
allowed-tools: Read, Write, Edit, Glob, Grep
version: 2.6.0
priority: CRITICAL
---

# Clean Code & Lazy Senior Developer Protocol (Ponytail Core)

> **Regra de Ouro:** O melhor código é aquele que você não precisou escrever. Cada linha de código adicionada é uma linha a mais para ler, testar, debugar e manter. Resolva o problema por completo com a menor e mais elegante alteração possível.

---

## 1. Os 4 Princípios do Lazy Senior Dev

1. **Viés do Zero-Código:** Antes de criar uma função ou instalar uma dependência, investigue se APIs padrão da linguagem, componentes já existentes no repositório ou simplesmente remover código morto resolvem a demanda.
2. **Raio de Impacto Mínimo (Minimal Blast Radius):** Prefira edições cirúrgicas e localizadas em vez de refatorações abrangentes não solicitadas.
3. **Engenharia Não-Especulativa (YAGNI):** Nunca crie abstrações, interfaces genéricas ou parâmetros opcionais para casos de uso que não existem no presente.
4. **Diff-Pruning Pré-Commit:** Audite o `git diff` antes de finalizar. Se você adicionou 60 linhas onde 8 linhas resolveriam com a mesma qualidade, enxugue o diff imediatamente.

---

## 2. Tabela de Boas Práticas Operacionais

| Princípio | Aplicação Prática | O Que Evitar |
|---|---|---|
| **SRP** | Cada função/classe tem uma única responsabilidade clara | Funções "faz-tudo" de 150 linhas |
| **KISS** | Código imperativo simples e legível | Abstrações precoces com múltiplos níveis de indireção |
| **DRY Equilibrado** | Extrair lógica duplicada apenas na 3ª repetição (Rule of Three) | DRY prematuro que acopla domínios não correlatos |
| **Nomes Descritivos** | `calculateCartTotalWithCoupons()` | Variáveis de uma letra ou siglas obscuras (`calcTot()`) |
| **Boy Scout Rule** | Deixe o trecho tocado ligeiramente mais limpo do que encontrou | Tentar refatorar o arquivo inteiro fora do escopo |

---

## 3. Checklist de Auditoria Ponytail

Ao revisar ou finalizar um código, faça o auto-exame:
- [ ] Posso resolver isso sem adicionar nenhum arquivo novo?
- [ ] Removi todos os `console.log`, variáveis não utilizadas e imports mortos?
- [ ] Os tipos TypeScript estão explícitos e sem uso desnecessário de `any`?
- [ ] O código preserva o estilo, padrões e convenções já adotadas no projeto?

---

## 4. Conclusão Transparente (Protocolo de 2 Linhas)

Ao concluir qualquer alteração significativa, finalize o turno resumindo:
- **O que foi omitido/preservado:** Declare o que você optou por não mexer para evitar escopo desnecessário.
- **Riscos e pontos de atenção:** Qualquer caso de borda ou dependência que o usuário deva conhecer.
