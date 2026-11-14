---
name: ux-lei-de-pragnanz
description: "Auditar e melhorar interfaces aplicando Lei de Prägnanz: detectar fricções reais, propor correções proporcionais e validar usabilidade sem gerar padrões genéricos."
---

# Lei de Prägnanz | Skill de auditoria e implementação

> Procedimento operacional para Claude Code, Gemini CLI e Codex. Aplicar somente quando a tarefa envolver o princípio ou houver evidência de problema relacionado.

## Princípio e contexto

Na percepção visual, padrões ambíguos tendem a ser organizados em formas simples, regulares e estáveis.

**Onde investigar:** Composição visual, gráficos, identidade, organização de interface e mapas de informação.

## Sinais concretos a procurar

1. Elementos decorativos competem com os controles.
2. A estrutura é difícil de reconhecer sem bordas e efeitos.
3. Gráficos sobrepostos dão interpretações ambíguas.
4. Alinhamentos inconsistentes dificultam enxergar agrupamentos.
5. Metáforas visuais impedem leitura direta do conteúdo.

## Correções técnicas e de interação recomendadas

1. Simplifique a composição sem eliminar semântica ou informação essencial.
2. Prefira padrões de alinhamento e ritmo visual consistentes.
3. Use contraste e espaço para indicar estrutura e não ornamento.
4. Garanta que componentes tenham forma e affordance coerentes com sua ação.
5. Substitua composições decorativas por elementos específicos da tarefa.
6. Verifique se a simplificação funciona com conteúdo real e diferentes densidades.

## Exemplo contextual

**Antes:** Dashboard com blocos angulados, orbes e camadas translúcidas obscurece relações entre métricas.

**Depois:** Indicadores são agrupados por decisão operacional, com formas estáveis, rótulos e separação clara.

## Procedimento de auditoria e implementação

1. Identifique a jornada real, o perfil do usuário e o contexto específico da tela; levante componentes e estados relacionados.
2. Reúna evidência verificável: rota, arquivo/componente, reprodução do problema, frequência e impacto sobre a tarefa.
3. Registre alternativas, benefícios esperados, riscos e impacto sobre ações adjacentes ou sobre componentes compartilhados.
4. Implemente a menor mudança que trate a causa, preserve convenções e utilize padrões existentes no repositório.
5. Verifique estados, responsividade, acessibilidade, dados reais, regressões e consistência entre páginas relacionadas.
6. Se o teste dependente de navegador, usuários ou infraestrutura não for viável, declare como pendência em vez de afirmar sucesso.

## Validação obrigatória quando aplicável

- Teste leitura de estrutura em visão rápida e zoom.
- Apresente dados densos reais e verifique interpretação.
- Confirme que simplificação não cria ambiguidades de status ou escopo.

## Indicadores de impacto (selecionar os adequados)

- Tempo para localizar seções
- Erros de interpretação
- Consistência visual
- Clareza com dados reais

## Limites, riscos e interpretações incorretas

Simplicidade perceptiva não significa padronizar todas as telas nem remover informação indispensável.

## Regras universais para execução

1. **Audite antes de modificar:** identifique tecnologias, componentes reutilizáveis, páginas e jornadas reais. Nunca presuma a existência de problemas.
2. **Separe evidências de hipóteses:** cite arquivo/componente, estado atual, consequência para o usuário e justificativa; quando algo for apenas suspeita, declare.
3. **Priorize segurança, acessibilidade e continuidade:** preserve autenticação, autorização, dados, pagamentos, semântica HTML, regras de negócio e APIs.
4. **Intervenha de modo proporcional:** primeiro corrija causas em componentes compartilhados; evite refatorações e bibliotecas sem retorno demonstrável.
5. **Projete todos os estados relevantes:** padrão, foco, teclado, toque, carregamento, erro, sucesso, vazio e desabilitado conforme aplicável.
6. **Valide em mobile e desktop:** contraste, responsividade, zoom, teclado, leitor de tela quando disponível, rede lenta e dados reais quando relevantes.
7. **Não invente testes:** diferencie inspeção estática, teste automatizado, teste manual, pesquisa com usuários e medição real.
8. **Não aplique a lei isoladamente:** quando um princípio conflitar com acessibilidade, segurança, privacidade ou clareza, priorize estas necessidades e explicite o trade-off.


## Formato de entrega do agente

Apresente: **achado**, **evidência**, **gravidade**, **princípio envolvido**, **opções e trade-offs**, **alteração exata**, **arquivos afetados**, **testes executados e resultados**, **pendências**. Não confunda sugestão com implementação.

## Fontes de referência

- [Laws of UX: Law of Prägnanz](https://lawsofux.com/law-of-pragnanz/)
- [WCAG 2.2 (W3C)](https://www.w3.org/TR/WCAG22/)
- [Documentação de skills do Gemini CLI](https://geminicli.com/docs/cli/tutorials/skills-getting-started/)
- [Skills do Codex/OpenAI](https://developers.openai.com/blog/skills-agents-sdk)
