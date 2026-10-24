---
name: ux-efeito-von-restorff
description: "Auditar e melhorar interfaces aplicando Efeito Von Restorff: detectar fricções reais, propor correções proporcionais e validar usabilidade sem gerar padrões genéricos."
---

# Efeito Von Restorff | Skill de auditoria e implementação

> Procedimento operacional para Claude Code, Gemini CLI e Codex. Aplicar somente quando a tarefa envolver o princípio ou houver evidência de problema relacionado.

## Princípio e contexto

Um elemento que se distingue de outros semelhantes tende a ser mais lembrado.

**Onde investigar:** CTAs, avisos importantes, seleção de planos, ações perigosas e indicadores de status.

## Sinais concretos a procurar

1. Todos os botões possuem o mesmo destaque cromático.
2. Ações secundárias competem visualmente com a principal.
3. Destaques surgem por decoração sem relação com tarefas.
4. Avisos críticos se parecem com notas triviais.
5. Muitos elementos usam badges e cores fortes ao mesmo tempo.

## Correções técnicas e de interação recomendadas

1. Defina qual informação ou ação merece destaque conforme a jornada.
2. Use contraste localizado por escala, peso, forma e posição, sem depender apenas de cor.
3. Diminua competição ao redor do destaque em vez de adicionar efeitos.
4. Use semântica própria para risco, erro, sucesso e atenção.
5. Valide que destaque não manipula escolhas de preço ou privacidade.
6. Cheque legibilidade e foco em modos claro/escuro e alto contraste.

## Exemplo contextual

**Antes:** Um cartão possui cinco botões roxos de peso igual.

**Depois:** A ação principal recebe destaque; secundárias usam tratamento discreto e ação destrutiva é claramente identificada.

## Procedimento de auditoria e implementação

1. Identifique a jornada real, o perfil do usuário e o contexto específico da tela; levante componentes e estados relacionados.
2. Reúna evidência verificável: rota, arquivo/componente, reprodução do problema, frequência e impacto sobre a tarefa.
3. Registre alternativas, benefícios esperados, riscos e impacto sobre ações adjacentes ou sobre componentes compartilhados.
4. Implemente a menor mudança que trate a causa, preserve convenções e utilize padrões existentes no repositório.
5. Verifique estados, responsividade, acessibilidade, dados reais, regressões e consistência entre páginas relacionadas.
6. Se o teste dependente de navegador, usuários ou infraestrutura não for viável, declare como pendência em vez de afirmar sucesso.

## Validação obrigatória quando aplicável

- Teste identificação da ação primária em poucos segundos.
- Valide legibilidade com contraste e sem percepção de cor.
- Confirme que destaque comercial não oculta informação essencial.

## Indicadores de impacto (selecionar os adequados)

- Reconhecimento da ação
- Cliques incorretos
- Compreensão de estados
- Taxa de conversão sem aumento de erro

## Limites, riscos e interpretações incorretas

Destaque não autoriza dark patterns; avisos, acessibilidade e opções legítimas não podem ser escondidos para aumentar conversão.

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

- [Laws of UX: Von Restorff Effect](https://lawsofux.com/von-restorff-effect/)
- [WCAG 2.2 (W3C)](https://www.w3.org/TR/WCAG22/)
- [Documentação de skills do Gemini CLI](https://geminicli.com/docs/cli/tutorials/skills-getting-started/)
- [Skills do Codex/OpenAI](https://developers.openai.com/blog/skills-agents-sdk)
