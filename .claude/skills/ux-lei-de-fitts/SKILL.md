---
name: ux-lei-de-fitts
description: "Auditar e melhorar interfaces aplicando Lei de Fitts: detectar fricções reais, propor correções proporcionais e validar usabilidade sem gerar padrões genéricos."
---

# Lei de Fitts | Skill de auditoria e implementação

> Procedimento operacional para Claude Code, Gemini CLI e Codex. Aplicar somente quando a tarefa envolver o princípio ou houver evidência de problema relacionado.

## Princípio e contexto

A rapidez para alcançar um alvo depende principalmente de seu tamanho efetivo e da distância que o usuário precisa percorrer até ele.

**Onde investigar:** Botões, ícones clicáveis, ações de lista, controles mobile, menus flutuantes e interfaces com ponteiro.

## Sinais concretos a procurar

1. Alvos pequenos causam erros frequentes de toque.
2. Controles relacionados ao conteúdo aparecem distantes dele.
3. Ações primárias disputam espaço com controles secundários minúsculos.
4. Ícones têm área visível de 16 px e hit-area igualmente pequena.
5. Ações destrutivas estão próximas de comandos comuns sem separação suficiente.

## Correções técnicas e de interação recomendadas

1. Aumente a área clicável real usando padding ou dimensões mínimas, não apenas o ícone.
2. Posicione a ação perto do objeto e do próximo passo do fluxo, observando ergonomia em telas pequenas.
3. Use áreas de toque confortáveis como alvo de projeto, frequentemente 44–48 CSS px, ajustadas ao contexto.
4. Garanta separação de alvos adjacentes para evitar seleção incorreta, sobretudo perto de ações destrutivas.
5. Preserve foco visível e nome acessível; o tamanho do botão não substitui semântica.
6. Considere barras fixas somente quando ajudam, sem encobrir conteúdo ou teclado virtual.

## Exemplo contextual

**Antes:** A ação de excluir uma linha fica em um ícone de 14 px encostado no botão editar.

**Depois:** Ambas têm hit-area ampliada, espaçamento seguro, rótulos acessíveis e confirmação contextual para exclusão.

## Procedimento de auditoria e implementação

1. Identifique a jornada real, o perfil do usuário e o contexto específico da tela; levante componentes e estados relacionados.
2. Reúna evidência verificável: rota, arquivo/componente, reprodução do problema, frequência e impacto sobre a tarefa.
3. Registre alternativas, benefícios esperados, riscos e impacto sobre ações adjacentes ou sobre componentes compartilhados.
4. Implemente a menor mudança que trate a causa, preserve convenções e utilize padrões existentes no repositório.
5. Verifique estados, responsividade, acessibilidade, dados reais, regressões e consistência entre páginas relacionadas.
6. Se o teste dependente de navegador, usuários ou infraestrutura não for viável, declare como pendência em vez de afirmar sucesso.

## Validação obrigatória quando aplicável

- Teste toques com uma mão em 320, 375 e 430 CSS px.
- Use tabulação e leitor de tela para garantir alvos identificáveis.
- Inspecione sobreposição de áreas clicáveis e erros de toque em dispositivos reais quando disponíveis.

## Indicadores de impacto (selecionar os adequados)

- Taxa de toques incorretos
- Tempo para alcançar o comando
- Tamanho efetivo de alvos
- Taxa de conclusão por mobile

## Limites, riscos e interpretações incorretas

WCAG 2.2 AA estabelece 24 × 24 CSS px ou exceções no critério 2.5.8; 44–48 px é uma meta ergonômica frequente, não um requisito universal AA.

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

- [Laws of UX: Fitts’s Law](https://lawsofux.com/fittss-law/)
- [WCAG 2.2 (W3C)](https://www.w3.org/TR/WCAG22/)
- [Documentação de skills do Gemini CLI](https://geminicli.com/docs/cli/tutorials/skills-getting-started/)
- [Skills do Codex/OpenAI](https://developers.openai.com/blog/skills-agents-sdk)
