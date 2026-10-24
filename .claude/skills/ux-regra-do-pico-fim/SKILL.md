---
name: ux-regra-do-pico-fim
description: "Auditar e melhorar interfaces aplicando Regra do Pico-Fim: detectar fricções reais, propor correções proporcionais e validar usabilidade sem gerar padrões genéricos."
---

# Regra do Pico-Fim | Skill de auditoria e implementação

> Procedimento operacional para Claude Code, Gemini CLI e Codex. Aplicar somente quando a tarefa envolver o princípio ou houver evidência de problema relacionado.

## Princípio e contexto

A avaliação retrospectiva de uma experiência é influenciada por momentos emocionalmente intensos e pelo encerramento.

**Onde investigar:** Onboarding, pagamento, suporte, erro/recuperação, conclusão de cadastros e cancelamentos.

## Sinais concretos a procurar

1. O resultado de uma transação fica ambíguo.
2. A última etapa não oferece recibo, confirmação ou próximo passo.
3. Erros críticos apresentam tom hostil ou recuperação obscura.
4. A experiência celebra conclusão que ainda depende de processamento.
5. Após cancelar ou excluir, usuário não sabe o que aconteceu.

## Correções técnicas e de interação recomendadas

1. Mapeie os pontos de tensão e risco real ao longo do fluxo.
2. Torne momentos críticos previsíveis com linguagem clara e feedback proporcional.
3. Projete o encerramento com estado verdadeiro, identificador/recibo quando aplicável e próximos passos.
4. Facilite recuperação após falhas sem esconder detalhes operacionais relevantes.
5. Não crie “efeitos emocionais” artificiais que atrasem a tarefa.
6. Avalie impacto em percepção sem sacrificar desempenho objetivo.

## Exemplo contextual

**Antes:** Pagamento aprovado, mas a tela volta ao início sem confirmação nem instruções.

**Depois:** Tela de confirmação apresenta estado verificado, valor, referência e próximos passos de modo seguro.

## Procedimento de auditoria e implementação

1. Identifique a jornada real, o perfil do usuário e o contexto específico da tela; levante componentes e estados relacionados.
2. Reúna evidência verificável: rota, arquivo/componente, reprodução do problema, frequência e impacto sobre a tarefa.
3. Registre alternativas, benefícios esperados, riscos e impacto sobre ações adjacentes ou sobre componentes compartilhados.
4. Implemente a menor mudança que trate a causa, preserve convenções e utilize padrões existentes no repositório.
5. Verifique estados, responsividade, acessibilidade, dados reais, regressões e consistência entre páginas relacionadas.
6. Se o teste dependente de navegador, usuários ou infraestrutura não for viável, declare como pendência em vez de afirmar sucesso.

## Validação obrigatória quando aplicável

- Teste jornadas com sucesso e falha até o ponto final.
- Pergunte aos participantes qual foi o resultado da tarefa.
- Avalie satisfação ao fim e capacidade de retomar depois.

## Indicadores de impacto (selecionar os adequados)

- Confiança no estado final
- Recontatos ao suporte
- Erros pós-conclusão
- Satisfação após jornada

## Limites, riscos e interpretações incorretas

Não use essa regra para mascarar partes ruins do fluxo; a experiência completa deve ser funcional, transparente e segura.

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

- [Laws of UX: Peak-End Rule](https://lawsofux.com/peak-end-rule/)
- [WCAG 2.2 (W3C)](https://www.w3.org/TR/WCAG22/)
- [Documentação de skills do Gemini CLI](https://geminicli.com/docs/cli/tutorials/skills-getting-started/)
- [Skills do Codex/OpenAI](https://developers.openai.com/blog/skills-agents-sdk)
