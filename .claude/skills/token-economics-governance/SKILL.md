---
name: token-economics-governance
description: "Governança e auditoria de consumo de tokens em ambientes agentic (Claude Code, Gemini CLI, Codex). Enforces Prompt Caching Invariant, Protocolo Zero-Chatter, Leitura Fatiada e bloqueios no .claudeignore para economizar até 90% em custos de tokens."
when_to_use: "Ao auditar arquivos de regras de IA, estruturar novos projetos, prevenir vazamentos de contexto ou otimizar a velocidade e custos de sessão de agentes de código."
allowed-tools: Read, Write, Edit, Glob, Grep
version: 1.0.0
priority: CRITICAL
---

# Token Economics Governance | Antigravity

> **Princípio Econômico:** Tokens de saída custam até 5x mais que tokens de entrada, e contexto poluído degrada a inteligência do modelo. O sistema deve operar com sinal máximo e ruído zero.

---

## 1. Os 5 Pilares de Economia de Tokens

### 1. Invariante de Prompt Caching (90% de Desconto)
- O arquivo `AI_RULES.md` e as instruções de sistema devem ser **estáticos**.
- Nunca injete variáveis dinâmicas (como `{{TIMESTAMP}}`, contadores em tempo real ou caminhos voláteis) no cabeçalho das regras.
- Se o prefixo for 100% estático, o provedor (Anthropic/Google/OpenAI) reaproveita o cache de prefixo, reduzindo o custo de leitura em 90%.

### 2. Protocolo Zero-Chatter (Corte de Conversa Vazia)
- É terminantemente proibido emitir saudações, desculpas, confirmações vazias ou parafrasear o pedido do usuário ("Com certeza!", "Entendido, vou agora criar o arquivo...").
- Inicie a resposta diretamente com o diff, ferramenta ou explicação técnica concisa.

### 3. Leitura Fatiada & 1-Step Scope
- Nunca leia arquivos de 500+ linhas inteiros se a modificação for em uma função específica. Use sempre leitura fatiada com `StartLine` e `EndLine`.
- Antes de procurar arquivos pelo disco, consulte o mapa rápido em `CONTEXTO_PROJETO.md`.

### 4. Lazy Loading de Skills
- NUNCA leia todas as skills da pasta `.agents/skills`.
- Consulte a Matriz de Despacho no `AI_RULES.md` e abra **exclusivamente** o `SKILL.md` direcionado para a tarefa do usuário.

### 5. Bloqueio no `.claudeignore`
Garantir que todo projeto bloqueie rigorosamente:
- Gerenciadores de pacote: `node_modules/`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lockb`.
- Builds e caches: `.next/`, `dist/`, `out/`, `build/`, `.turbo/`, `.cache/`.
- Mídias pesadas: vídeos (`*.mp4`, `*.webm`), zips e binários.
