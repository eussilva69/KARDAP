---
name: ux-limiar-de-doherty
description: "Auditar e melhorar interfaces aplicando Limiar de Doherty: detectar fricções reais, propor correções proporcionais e validar usabilidade sem gerar padrões genéricos."
---

# Limiar de Doherty | Skill de auditoria e implementação

> Procedimento operacional para Claude Code, Gemini CLI e Codex. Aplicar somente quando a tarefa envolver o princípio ou houver evidência de problema relacionado.

## Princípio e contexto

Interações percebidas como rápidas, com feedback oportuno, favorecem fluidez e produtividade.

**Onde investigar:** Navegação, pesquisas, filtros, envio de formulários, uploads, carregamento e mutações assíncronas.

## Sinais concretos a procurar

1. Botão parece inerte após toque.
2. Busca aguarda resposta da API sem indicar atividade.
3. Layout desloca elementos durante carregamento.
4. Usuário reenvia formulários por não saber se a ação começou.
5. Operações longas não apresentam estados ou recuperação.

## Correções técnicas e de interação recomendadas

1. Mostre resposta visual imediata à ação, independentemente da duração real do servidor.
2. Use skeleton para conteúdo previsível e progresso real quando mensurável.
3. Defina estados idle, pending, success, error e retry; evite mensagens falsas de progresso.
4. Evite bloquear a interface inteira quando somente um componente processa.
5. Aplique debounce em busca com critério, sem atraso perceptível excessivo.
6. Investigue gargalos reais com métricas de latência, INP e tempo até feedback.

## Exemplo contextual

**Antes:** Ao salvar, a tela permanece imóvel por três segundos e a pessoa clica novamente.

**Depois:** O botão informa “Salvando…”, impede duplicidade segura, preserva dados e confirma sucesso ou oferece retry.

## Procedimento de auditoria e implementação

1. Identifique a jornada real, o perfil do usuário e o contexto específico da tela; levante componentes e estados relacionados.
2. Reúna evidência verificável: rota, arquivo/componente, reprodução do problema, frequência e impacto sobre a tarefa.
3. Registre alternativas, benefícios esperados, riscos e impacto sobre ações adjacentes ou sobre componentes compartilhados.
4. Implemente a menor mudança que trate a causa, preserve convenções e utilize padrões existentes no repositório.
5. Verifique estados, responsividade, acessibilidade, dados reais, regressões e consistência entre páginas relacionadas.
6. Se o teste dependente de navegador, usuários ou infraestrutura não for viável, declare como pendência em vez de afirmar sucesso.

## Validação obrigatória quando aplicável

- Simule rede lenta, offline e HTTP 5xx.
- Meça tempo até feedback visível e tempo real de conclusão.
- Teste interrupção, retry e navegação durante a operação.

## Indicadores de impacto (selecionar os adequados)

- Tempo até feedback
- INP
- Latência de ações críticas
- Envios duplicados
- Taxa de retry bem-sucedido

## Limites, riscos e interpretações incorretas

O valor popular de ~400 ms é uma referência histórica de interação, não SLA universal nem obrigação de finalizar toda operação nesse período.

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

- [Laws of UX: Doherty Threshold](https://lawsofux.com/doherty-threshold/)
- [WCAG 2.2 (W3C)](https://www.w3.org/TR/WCAG22/)
- [Documentação de skills do Gemini CLI](https://geminicli.com/docs/cli/tutorials/skills-getting-started/)
- [Skills do Codex/OpenAI](https://developers.openai.com/blog/skills-agents-sdk)
