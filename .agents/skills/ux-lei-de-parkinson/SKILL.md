---
name: ux-lei-de-parkinson
description: "Auditar e melhorar interfaces aplicando Lei de Parkinson: detectar fricções reais, propor correções proporcionais e validar usabilidade sem gerar padrões genéricos."
---

# Lei de Parkinson | Skill de auditoria e implementação

> Procedimento operacional para Claude Code, Gemini CLI e Codex. Aplicar somente quando a tarefa envolver o princípio ou houver evidência de problema relacionado.

## Princípio e contexto

Uma tarefa pode expandir-se até ocupar o tempo disponível, sobretudo quando não há foco e critérios de término claros.

**Onde investigar:** Fluxos operacionais, configuração, formulários, onboarding e gestão de tarefas no produto.

## Sinais concretos a procurar

1. Usuários não sabem quanto falta concluir.
2. Um fluxo contém etapas supérfluas e revisões desnecessárias.
3. Não existe critério claro de “concluído”.
4. Processos permitem repetição indefinida sem ganho.
5. Avisos pressionam artificialmente para criar urgência.

## Correções técnicas e de interação recomendadas

1. Defina sucesso operacional e critérios de conclusão da tarefa.
2. Remova passos repetidos sem sacrificar segurança ou tomada de decisão.
3. Agrupe dependências e estabeleça próximos passos claros.
4. Use progresso real em fluxos longos, sem cronômetros artificiais.
5. Ofereça salvamento e retorno para tarefas que legitimamente exigem reflexão.
6. Meça tempos por etapa e investigue retrabalho ou esperas desnecessárias.

## Exemplo contextual

**Antes:** Assistente de configuração com oito telas, três delas repetem informações já confirmadas.

**Depois:** Fluxo condensa etapas redundantes, mantém revisão e informa quando a configuração está pronta.

## Procedimento de auditoria e implementação

1. Identifique a jornada real, o perfil do usuário e o contexto específico da tela; levante componentes e estados relacionados.
2. Reúna evidência verificável: rota, arquivo/componente, reprodução do problema, frequência e impacto sobre a tarefa.
3. Registre alternativas, benefícios esperados, riscos e impacto sobre ações adjacentes ou sobre componentes compartilhados.
4. Implemente a menor mudança que trate a causa, preserve convenções e utilize padrões existentes no repositório.
5. Verifique estados, responsividade, acessibilidade, dados reais, regressões e consistência entre páginas relacionadas.
6. Se o teste dependente de navegador, usuários ou infraestrutura não for viável, declare como pendência em vez de afirmar sucesso.

## Validação obrigatória quando aplicável

- Cronometre tarefa ponta a ponta em cenários reais.
- Confirme que a redução de etapas não aumenta erros ou retrabalho.
- Valide que prazos, timers e urgências exibidos têm base real.

## Indicadores de impacto (selecionar os adequados)

- Tempo até conclusão
- Etapas por fluxo
- Taxa de retrabalho
- Abandono antes do término

## Limites, riscos e interpretações incorretas

Não use como justificativa para encurtar prazos necessários, criar escassez artificial ou punir pessoas com tarefas complexas.

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

- [Laws of UX: Parkinson’s Law](https://lawsofux.com/parkinsons-law/)
- [WCAG 2.2 (W3C)](https://www.w3.org/TR/WCAG22/)
- [Documentação de skills do Gemini CLI](https://geminicli.com/docs/cli/tutorials/skills-getting-started/)
- [Skills do Codex/OpenAI](https://developers.openai.com/blog/skills-agents-sdk)
