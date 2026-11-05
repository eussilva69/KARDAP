---
name: skill-ingestion-and-unification
description: "Protocolo de ingestão, análise de conflitos, deduplicação e unificação de skills e agentes para a frota Antigravity. Analisa fontes externas (GitHub, URLs, pastas locais) e fortalece skills existentes sem gerar concorrência ou dualidade."
when_to_use: "Sempre que o usuário enviar links de repositórios, sites ou pastas locais de novas skills/agentes para adicionar ao Kit Base e à frota."
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
version: 1.0.0
priority: HIGH
---

# Skill Ingestion & Unification Protocol | Antigravity

> **Princípio Central:** Mais skills não significa melhor assistência se houver duplicidade ou redundância. Toda nova skill deve passar pelo filtro de dualidade: se já existir algo similar, **unifique e torne a skill existente mais forte**.

---

## 1. Passo a Passo de Ingestão

### Passo 1: Inspeção e Triagem
- Baixar ou inspecionar o conteúdo da fonte (URL ou pasta local).
- Extrair o princípio central, intenção do usuário, ferramentas necessárias e seções operacionais.

### Passo 2: Matriz Forense de Conflito e Dualidade
Compare a nova skill contra o catálogo existente no `AI_RULES.md`:
- **Existe skill com o mesmo nome?** (Ex: `brainstorming` novo vs antigo) -> **Unificação Obrigatória**. Fundir os melhores pontos, elevar a versão e manter um único diretório.
- **Existe skill com o mesmo propósito técnico?** (Ex: anti-slop novo vs `frontend-design`, ou lazy-dev novo vs `clean-code`) -> **Incorporação Modular**. Adicionar os novos padrões como referências complementares (`references/`) ou elevar o escopo da skill existente.
- **É uma expansão de escopo?** (Ex: Playwright E2E completo substituindo apenas flaky test elimination) -> **Substituição e Evolução**. Atualizar o nome e o escopo para cobrir o ciclo completo.
- **É uma capacidade genuinamente nova?** (Ex: GSAP, Three.js/WebGL, Graphify, Humanizer, 18 Leis de UX) -> **Criação de Nova Skill**. Criar pasta com frontmatter padronizado.

### Passo 3: Padronização de Frontmatter
Toda skill deve conter rigorosamente:
```yaml
---
name: nome-da-skill
description: "Descrição de alto sinal com gatilhos claros de ativação."
when_to_use: "Critérios objetivos de quando o agente deve acionar esta skill."
allowed-tools: Read, Write, Edit, Glob, Grep
version: 1.0.0
---
```

### Passo 4: Atualização da Matriz de Despacho (`AI_RULES.md`)
Adicionar imediatamente na tabela de despacho do `AI_RULES.md`:
`| **Palavras-chave e Intenção** | agente-especialista | .agents/skills/nome-da-skill/SKILL.md |`

### Passo 5: Propagação para o Kit Base e Frota
- Gravar no Kit Base (`.agents/skills` e `.claude/skills`).
- Executar `python scripts/sync_fleet.py` e `python scripts/push_fleet.py`.
