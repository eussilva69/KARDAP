---
name: ux-lei-da-proximidade
description: "Auditar e melhorar interfaces aplicando Lei da Proximidade: detectar fricções reais, propor correções proporcionais e validar usabilidade sem gerar padrões genéricos."
---

# Lei da Proximidade | Skill de auditoria e implementação

> Procedimento operacional para Claude Code, Gemini CLI e Codex. Aplicar somente quando a tarefa envolver o princípio ou houver evidência de problema relacionado.

## Princípio e contexto

Elementos espacialmente próximos tendem a ser percebidos como pertencentes ao mesmo grupo.

**Onde investigar:** Cards, formulários, preços e unidades, tabelas, filtros, painéis e conteúdo editorial.

## Sinais concretos a procurar

1. Label fica visualmente mais perto do campo seguinte do que de seu input.
2. Um CTA está separado do conteúdo ao qual se refere.
3. O espaçamento entre itens relacionados é igual ao espaçamento entre grupos.
4. Informações de produtos distintos parecem pertencer ao mesmo cartão.
5. Erros de validação aparecem longe do campo correspondente.

## Correções técnicas e de interação recomendadas

1. Mapeie relações semânticas reais antes de alterar gaps.
2. Aplique espaçamento interno menor do que a separação entre grupos independentes.
3. Aproxime títulos de sua seção, valores de unidades e avisos de seus controles.
4. Use CSS gap/tokens consistentes nos componentes compartilhados.
5. Evite inserir borda ao redor de tudo quando o espaçamento sozinho basta.
6. Preserve a ordem de leitura e associação semântica no DOM e em mobile.

## Exemplo contextual

**Antes:** Título do produto, preço, descrição e botão apresentam a mesma distância vertical.

**Depois:** Preço e unidade ficam juntos; título e preço formam o grupo principal; o CTA acompanha a seleção do produto.

## Procedimento de auditoria e implementação

1. Identifique a jornada real, o perfil do usuário e o contexto específico da tela; levante componentes e estados relacionados.
2. Reúna evidência verificável: rota, arquivo/componente, reprodução do problema, frequência e impacto sobre a tarefa.
3. Registre alternativas, benefícios esperados, riscos e impacto sobre ações adjacentes ou sobre componentes compartilhados.
4. Implemente a menor mudança que trate a causa, preserve convenções e utilize padrões existentes no repositório.
5. Verifique estados, responsividade, acessibilidade, dados reais, regressões e consistência entre páginas relacionadas.
6. Se o teste dependente de navegador, usuários ou infraestrutura não for viável, declare como pendência em vez de afirmar sucesso.

## Validação obrigatória quando aplicável

- Inspecione agrupamentos em desktop, mobile e zoom de 200%.
- Peça que usuários identifiquem a qual campo pertence cada mensagem de erro.
- Confira ordem de leitura no leitor de tela e espaçamentos dos estados vazios.

## Indicadores de impacto (selecionar os adequados)

- Erros de associação visual
- Tempo de leitura
- Reconhecimento de grupos
- Retrabalho no preenchimento

## Limites, riscos e interpretações incorretas

Proximidade visual não substitui labels, fieldsets e relações semânticas acessíveis.

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

- [Laws of UX: Law of Proximity](https://lawsofux.com/law-of-proximity/)
- [WCAG 2.2 (W3C)](https://www.w3.org/TR/WCAG22/)
- [Documentação de skills do Gemini CLI](https://geminicli.com/docs/cli/tutorials/skills-getting-started/)
- [Skills do Codex/OpenAI](https://developers.openai.com/blog/skills-agents-sdk)
