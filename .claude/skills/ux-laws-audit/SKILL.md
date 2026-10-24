---
name: ux-laws-audit
description: Auditoria integrada de UX e psicologia cognitiva aplicando as 18 Leis de UX (Hick, Fitts, Jakob, Proximidade, Miller, Doherty, Von Restorff, Posicao Serial, Pico-Fim, Zeigarnik, Pragnanz, Semelhanca, Conectividade Uniforme, Tesler, Postel, Parkinson, Ockham e Pareto).
when_to_use: Quando o usuario solicitar auditoria completa de usabilidade, analise psicologica de interface, revisao heuristica de telas ou otimizacao de fluxos criticos.
allowed-tools: Read, Glob, Grep, Edit
version: 1.0.0
---

# Prompt de auditoria integrada | 18 princípios de UX/UI

Atue como engenheiro frontend sênior e especialista em UX, acessibilidade e design de interação. Analise o projeto disponível e aplique, **somente onde forem pertinentes**, as skills deste kit: Hick, Fitts, Jakob, Proximidade, Miller, Doherty, Von Restorff, Posição Serial, Pico-Fim, Zeigarnik, Prägnanz, Semelhança, Conectividade Uniforme, Tesler, Postel, Parkinson, Ockham e Pareto.

## Método

1. **Conhecer o produto:** inspecione estrutura, rotas, design system, fluxos e público identificável. Consulte `CONTEXTO_PROJETO.md` e regras compartilhadas quando existirem.
2. **Selecionar leis relevantes:** construa matriz associando lei, telas, evidência de falha e consequência prática. Não marque problema só porque a interface diverge de uma regra estética.
3. **Verificar de ponta a ponta:** menus, CTAs, fluxos críticos, ações em mobile, formulários, estados de loading/erro/sucesso, conclusão de jornada, SEO semântico e acessibilidade.
4. **Priorizar:** Crítico (bloqueia tarefa/segurança), alto (erro frequente ou grave), médio (fricção recorrente), baixo (melhoria localizada). Considere esforço e risco.
5. **Implementar:** altere código quando houver acesso e autorização. Preserve semântica, funcionalidades, APIs, segurança, regras de negócio e identidade do produto.
6. **Validar:** execute testes, lint, typecheck e build disponíveis; investigue teclado, touch, zoom, contraste, navegação e falhas assíncronas. Use navegador e ferramentas reais somente quando disponíveis; não invente resultados.
7. **Reauditar:** procure regressões, outros padrões genéricos e violações do objetivo das correções.

## Regras

- Não aplicar todas as leis mecanicamente. O contexto decide.
- Priorizar WCAG 2.2, integridade de dados, segurança e transparência quando houver conflito.
- Não adicionar efeitos visuais decorativos por tendência nem usar conteúdo, métricas ou depoimentos inventados.
- Não transformar simplificações em perda de descoberta, acessibilidade, autonomia ou honestidade.
- Distinguir fato no código, hipótese de usabilidade e resultado medido.

## Saída

A. Cobertura real: páginas/fluxos examinados e não examinados.
B. Matriz: princípio, localização, achado, evidência, severidade, correção e teste exigido.
C. Alterações realizadas: arquivos e comportamentos antes/depois.
D. Validação: comandos e resultados efetivos, testes não executados e limitações.
E. Pendências com prioridade, risco, esforço e dependências.

Não anuncie conformidade integral ou melhora estatística sem teste real. Se não tiver acesso ao código, entregue especificações de implementação e não simule alterações.
