---
name: ux-efeito-zeigarnik
description: "Auditar e melhorar interfaces aplicando Efeito Zeigarnik: detectar fricções reais, propor correções proporcionais e validar usabilidade sem gerar padrões genéricos."
---

# Efeito Zeigarnik | Skill de auditoria e implementação

> Procedimento operacional para Claude Code, Gemini CLI e Codex. Aplicar somente quando a tarefa envolver o princípio ou houver evidência de problema relacionado.

## Princípio e contexto

Tarefas interrompidas ou inacabadas podem permanecer cognitivamente salientes em determinadas condições.

**Onde investigar:** Onboarding retomável, formulários longos, tarefas incompletas, rascunhos e fluxos com etapas.

## Sinais concretos a procurar

1. Usuário retorna e não vê o que ficou pendente.
2. Um processo perde progresso quando a sessão cai.
3. Um checklist de configuração mostra itens vagos ou manipulativos.
4. A interface comunica “incompleto” sem explicar ação necessária.
5. O usuário precisa reiniciar tarefas que poderiam ser retomadas.

## Correções técnicas e de interação recomendadas

1. Salve rascunhos quando permitido e seguro, evitando dados sensíveis em armazenamento impróprio.
2. Mostre progresso factual: concluído, pendente, bloqueado e próxima ação.
3. Permita retomar do último ponto sem forçar finalização imediata.
4. Indique dependências e critérios de conclusão verificáveis.
5. Ofereça pausas e abandono intencional sem punição artificial.
6. Use lembretes somente com consentimento e frequência proporcional.

## Exemplo contextual

**Antes:** Cadastro de cinco passos é perdido ao fechar o navegador e reinicia do zero.

**Depois:** Sistema oferece retomada segura, mostra dados já confirmados e identifica a etapa restante.

## Procedimento de auditoria e implementação

1. Identifique a jornada real, o perfil do usuário e o contexto específico da tela; levante componentes e estados relacionados.
2. Reúna evidência verificável: rota, arquivo/componente, reprodução do problema, frequência e impacto sobre a tarefa.
3. Registre alternativas, benefícios esperados, riscos e impacto sobre ações adjacentes ou sobre componentes compartilhados.
4. Implemente a menor mudança que trate a causa, preserve convenções e utilize padrões existentes no repositório.
5. Verifique estados, responsividade, acessibilidade, dados reais, regressões e consistência entre páginas relacionadas.
6. Se o teste dependente de navegador, usuários ou infraestrutura não for viável, declare como pendência em vez de afirmar sucesso.

## Validação obrigatória quando aplicável

- Interrompa fluxo e retome em outra sessão autorizada.
- Teste expiração de sessão sem perda indevida de dados permitidos.
- Confirme ausência de pressão manipulativa ou notificações indesejadas.

## Indicadores de impacto (selecionar os adequados)

- Taxa de retomada
- Conclusão após pausa
- Perda de progresso
- Reclamações de lembretes

## Limites, riscos e interpretações incorretas

O efeito não é universal nem justificativa para criar urgência, ansiedade ou loops de engajamento compulsivo.

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

- [Laws of UX: Zeigarnik Effect](https://lawsofux.com/zeigarnik-effect/)
- [WCAG 2.2 (W3C)](https://www.w3.org/TR/WCAG22/)
- [Documentação de skills do Gemini CLI](https://geminicli.com/docs/cli/tutorials/skills-getting-started/)
- [Skills do Codex/OpenAI](https://developers.openai.com/blog/skills-agents-sdk)
