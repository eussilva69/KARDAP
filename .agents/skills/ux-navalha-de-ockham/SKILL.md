---
name: ux-navalha-de-ockham
description: "Auditar e melhorar interfaces aplicando Navalha de Ockham: detectar fricções reais, propor correções proporcionais e validar usabilidade sem gerar padrões genéricos."
---

# Navalha de Ockham | Skill de auditoria e implementação

> Procedimento operacional para Claude Code, Gemini CLI e Codex. Aplicar somente quando a tarefa envolver o princípio ou houver evidência de problema relacionado.

## Princípio e contexto

Entre explicações ou soluções que atendem igualmente aos requisitos e evidências, prefira a de menor complexidade desnecessária.

**Onde investigar:** Arquitetura frontend, design system, seleção de componentes, fluxos e decisões técnicas.

## Sinais concretos a procurar

1. Novas dependências foram adicionadas para efeitos simples.
2. Uma interação básica depende de múltiplos estados e wrappers.
3. Layout depende de ornamentos para comunicar hierarquia.
4. Há padrões duplicados para a mesma função.
5. Abstrações antecipadas complicam mudança localizada.

## Correções técnicas e de interação recomendadas

1. Explicite requisitos e restrições antes de comparar alternativas.
2. Escolha a implementação com menor custo total quando o resultado e a segurança forem equivalentes.
3. Reutilize HTML nativo, CSS e recursos do framework antes de trazer dependências.
4. Remova elementos decorativos que não melhoram compreensão, identidade ou função.
5. Prefira abstrações após evidência de repetição e não por previsão genérica.
6. Registre trade-offs quando solução simples implicar manutenção ou risco futuro.

## Exemplo contextual

**Antes:** Uma animação de botão introduz dependência pesada de motion e sistema global de eventos.

**Depois:** Transição CSS simples entrega o mesmo feedback com menos código e respeito a reduced motion.

## Procedimento de auditoria e implementação

1. Identifique a jornada real, o perfil do usuário e o contexto específico da tela; levante componentes e estados relacionados.
2. Reúna evidência verificável: rota, arquivo/componente, reprodução do problema, frequência e impacto sobre a tarefa.
3. Registre alternativas, benefícios esperados, riscos e impacto sobre ações adjacentes ou sobre componentes compartilhados.
4. Implemente a menor mudança que trate a causa, preserve convenções e utilize padrões existentes no repositório.
5. Verifique estados, responsividade, acessibilidade, dados reais, regressões e consistência entre páginas relacionadas.
6. Se o teste dependente de navegador, usuários ou infraestrutura não for viável, declare como pendência em vez de afirmar sucesso.

## Validação obrigatória quando aplicável

- Compare requisitos cumpridos pelas opções.
- Verifique bundle, legibilidade, testes, acessibilidade e manutenção.
- Procure efeitos colaterais após simplificar componentes.

## Indicadores de impacto (selecionar os adequados)

- Dependências desnecessárias
- Complexidade por componente
- Bundle e custo de manutenção
- Regressões após mudanças

## Limites, riscos e interpretações incorretas

A solução mais curta não é necessariamente a melhor; segurança, performance, acessibilidade e extensibilidade fazem parte do custo.

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

- [Laws of UX: Occam’s Razor](https://lawsofux.com/occams-razor/)
- [WCAG 2.2 (W3C)](https://www.w3.org/TR/WCAG22/)
- [Documentação de skills do Gemini CLI](https://geminicli.com/docs/cli/tutorials/skills-getting-started/)
- [Skills do Codex/OpenAI](https://developers.openai.com/blog/skills-agents-sdk)
