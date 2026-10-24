---
name: ux-principio-de-pareto
description: "Auditar e melhorar interfaces aplicando Princípio de Pareto: detectar fricções reais, propor correções proporcionais e validar usabilidade sem gerar padrões genéricos."
---

# Princípio de Pareto | Skill de auditoria e implementação

> Procedimento operacional para Claude Code, Gemini CLI e Codex. Aplicar somente quando a tarefa envolver o princípio ou houver evidência de problema relacionado.

## Princípio e contexto

Em vários contextos, uma parcela pequena de causas responde por grande parte dos efeitos, sem proporção universal exata.

**Onde investigar:** Priorização de backlog, auditorias, uso de funcionalidades, defeitos, performance e suporte.

## Sinais concretos a procurar

1. Equipe investe igual esforço em problemas de impactos muito diferentes.
2. Mudanças estéticas precedem falhas em fluxos essenciais.
3. Não existe evidência de frequência e gravidade por módulo.
4. Uma lista de 100 melhorias é tratada como 100 prioridades iguais.
5. Partes raramente usadas consomem mais investimento que tarefas críticas sem justificativa.

## Correções técnicas e de interação recomendadas

1. Colete dados de uso, falhas, conversão, reclamações e custos quando disponíveis.
2. Ordene problemas por severidade, frequência, risco e esforço, evitando métrica única.
3. Identifique intervenções com alto impacto e escopo localizado.
4. Implemente e valide melhorias de maior retorno antes de retoques cosméticos.
5. Reserve capacidade para vulnerabilidades críticas, mesmo que pouco frequentes.
6. Reavalie prioridades periodicamente com dados novos e limitações explicitadas.

## Exemplo contextual

**Antes:** Backlog prioriza refinamento de cartões enquanto falhas em checkout continuam sem diagnóstico.

**Depois:** Equipe mede impactos, corrige bloqueios de pagamento primeiro e agenda melhorias visuais proporcionais.

## Procedimento de auditoria e implementação

1. Identifique a jornada real, o perfil do usuário e o contexto específico da tela; levante componentes e estados relacionados.
2. Reúna evidência verificável: rota, arquivo/componente, reprodução do problema, frequência e impacto sobre a tarefa.
3. Registre alternativas, benefícios esperados, riscos e impacto sobre ações adjacentes ou sobre componentes compartilhados.
4. Implemente a menor mudança que trate a causa, preserve convenções e utilize padrões existentes no repositório.
5. Verifique estados, responsividade, acessibilidade, dados reais, regressões e consistência entre páginas relacionadas.
6. Se o teste dependente de navegador, usuários ou infraestrutura não for viável, declare como pendência em vez de afirmar sucesso.

## Validação obrigatória quando aplicável

- Compare métricas antes e depois das intervenções priorizadas.
- Cheque se problemas raros, mas críticos, estão escalados adequadamente.
- Revise representatividade e qualidade das amostras de uso.

## Indicadores de impacto (selecionar os adequados)

- Impacto por esforço
- Falhas resolvidas
- Taxa de conclusão de jornadas essenciais
- Severidade residual

## Limites, riscos e interpretações incorretas

80/20 é aproximação descritiva, não lei matemática inevitável. Não ignore grupos minoritários, acessibilidade ou segurança por terem baixo volume.

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

- [Laws of UX: Pareto Principle](https://lawsofux.com/pareto-principle/)
- [WCAG 2.2 (W3C)](https://www.w3.org/TR/WCAG22/)
- [Documentação de skills do Gemini CLI](https://geminicli.com/docs/cli/tutorials/skills-getting-started/)
- [Skills do Codex/OpenAI](https://developers.openai.com/blog/skills-agents-sdk)
