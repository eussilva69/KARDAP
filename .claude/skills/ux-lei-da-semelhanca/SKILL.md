---
name: ux-lei-da-semelhanca
description: "Auditar e melhorar interfaces aplicando Lei da Semelhança: detectar fricções reais, propor correções proporcionais e validar usabilidade sem gerar padrões genéricos."
---

# Lei da Semelhança | Skill de auditoria e implementação

> Procedimento operacional para Claude Code, Gemini CLI e Codex. Aplicar somente quando a tarefa envolver o princípio ou houver evidência de problema relacionado.

## Princípio e contexto

Elementos com características visuais semelhantes tendem a ser percebidos como relacionados.

**Onde investigar:** Componentes de design system, estados de interface, ações, ícones e tabelas.

## Sinais concretos a procurar

1. Mesma ação possui estilos diferentes em páginas equivalentes.
2. Ação destrutiva parece idêntica à principal.
3. Itens relacionados usam estilos totalmente distintos.
4. Cards de categorias distintas parecem ter a mesma função.
5. Estilos visuais indicam estados que não correspondem a semânticas reais.

## Correções técnicas e de interação recomendadas

1. Defina variantes por função: primária, secundária, destrutiva, neutra e indisponível.
2. Reutilize tokens e componentes para tipos semânticos equivalentes.
3. Diferencie controles com comportamento distinto, mesmo quando próximos.
4. Não dependa só da cor: inclua rótulos, ícones úteis e feedback adequado.
5. Padronize estados de hover, active, focus e disabled.
6. Audite consistência cross-page e prioridade visual de estados críticos.

## Exemplo contextual

**Antes:** Botão azul significa “Salvar” numa tela e “Excluir” em outra.

**Depois:** Salvamento usa variante primária e exclusão usa variante destrutiva, com rótulos inequívocos.

## Procedimento de auditoria e implementação

1. Identifique a jornada real, o perfil do usuário e o contexto específico da tela; levante componentes e estados relacionados.
2. Reúna evidência verificável: rota, arquivo/componente, reprodução do problema, frequência e impacto sobre a tarefa.
3. Registre alternativas, benefícios esperados, riscos e impacto sobre ações adjacentes ou sobre componentes compartilhados.
4. Implemente a menor mudança que trate a causa, preserve convenções e utilize padrões existentes no repositório.
5. Verifique estados, responsividade, acessibilidade, dados reais, regressões e consistência entre páginas relacionadas.
6. Se o teste dependente de navegador, usuários ou infraestrutura não for viável, declare como pendência em vez de afirmar sucesso.

## Validação obrigatória quando aplicável

- Compare instâncias do mesmo componente em diferentes telas.
- Valide significado dos estados sem explicação inicial.
- Teste acessibilidade de estados independentemente da cor.

## Indicadores de impacto (selecionar os adequados)

- Consistência de variantes
- Confusão entre ações
- Erros de execução
- Reuso de componentes

## Limites, riscos e interpretações incorretas

Semelhança estética nunca deve falsear diferenças de função ou status. Não pinte tudo igual por “consistência”.

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

- [Laws of UX: Law of Similarity](https://lawsofux.com/law-of-similarity/)
- [WCAG 2.2 (W3C)](https://www.w3.org/TR/WCAG22/)
- [Documentação de skills do Gemini CLI](https://geminicli.com/docs/cli/tutorials/skills-getting-started/)
- [Skills do Codex/OpenAI](https://developers.openai.com/blog/skills-agents-sdk)
