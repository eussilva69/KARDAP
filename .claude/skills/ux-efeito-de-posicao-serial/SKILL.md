---
name: ux-efeito-de-posicao-serial
description: "Auditar e melhorar interfaces aplicando Efeito de Posição Serial: detectar fricções reais, propor correções proporcionais e validar usabilidade sem gerar padrões genéricos."
---

# Efeito de Posição Serial | Skill de auditoria e implementação

> Procedimento operacional para Claude Code, Gemini CLI e Codex. Aplicar somente quando a tarefa envolver o princípio ou houver evidência de problema relacionado.

## Princípio e contexto

Itens no início e no final de uma sequência podem ser lembrados melhor que os posicionados no meio.

**Onde investigar:** Navegação, listas de instruções, etapas, resumos, comparações e onboarding.

## Sinais concretos a procurar

1. Passos críticos aparecem no meio de listas longas sem destaque.
2. Resumo final não contém decisão ou ação relevante.
3. Itens de navegação muito usados estão enterrados entre ações raras.
4. Um fluxo começa sem explicar o objetivo e termina sem confirmação.
5. A ordem de apresentação não segue a sequência real da tarefa.

## Correções técnicas e de interação recomendadas

1. Coloque o objetivo e a orientação inicial no começo do fluxo.
2. Use o final para revisão, próximos passos e confirmação clara.
3. Ordene menus por tarefa e frequência, respeitando grupos semânticos.
4. Agrupe itens do meio e utilize subtítulos para melhorar escaneabilidade.
5. Reduza sequências longas quando houver barreiras cognitivas reais.
6. Teste consistência da ordem entre desktop e mobile.

## Exemplo contextual

**Antes:** Instrução obrigatória de confirmação está perdida no quinto item de uma lista de nove.

**Depois:** A instrução relevante aparece no contexto da decisão e é repetida no resumo final, sem redundância excessiva.

## Procedimento de auditoria e implementação

1. Identifique a jornada real, o perfil do usuário e o contexto específico da tela; levante componentes e estados relacionados.
2. Reúna evidência verificável: rota, arquivo/componente, reprodução do problema, frequência e impacto sobre a tarefa.
3. Registre alternativas, benefícios esperados, riscos e impacto sobre ações adjacentes ou sobre componentes compartilhados.
4. Implemente a menor mudança que trate a causa, preserve convenções e utilize padrões existentes no repositório.
5. Verifique estados, responsividade, acessibilidade, dados reais, regressões e consistência entre páginas relacionadas.
6. Se o teste dependente de navegador, usuários ou infraestrutura não for viável, declare como pendência em vez de afirmar sucesso.

## Validação obrigatória quando aplicável

- Faça teste de recordação das etapas críticas.
- Observe erros em itens posicionados no meio da jornada.
- Verifique se a ordem visual mantém o foco e a ordem semântica.

## Indicadores de impacto (selecionar os adequados)

- Recordação de passos
- Taxa de erro por etapa
- Conclusão do fluxo
- Tempo de navegação

## Limites, riscos e interpretações incorretas

Não reorganize informação apenas para aproveitar primazia ou recência; prioridade operacional e acessibilidade vêm primeiro.

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

- [Laws of UX: Serial Position Effect](https://lawsofux.com/serial-position-effect/)
- [WCAG 2.2 (W3C)](https://www.w3.org/TR/WCAG22/)
- [Documentação de skills do Gemini CLI](https://geminicli.com/docs/cli/tutorials/skills-getting-started/)
- [Skills do Codex/OpenAI](https://developers.openai.com/blog/skills-agents-sdk)
