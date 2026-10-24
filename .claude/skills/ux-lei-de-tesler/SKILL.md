---
name: ux-lei-de-tesler
description: "Auditar e melhorar interfaces aplicando Lei de Tesler: detectar fricções reais, propor correções proporcionais e validar usabilidade sem gerar padrões genéricos."
---

# Lei de Tesler | Skill de auditoria e implementação

> Procedimento operacional para Claude Code, Gemini CLI e Codex. Aplicar somente quando a tarefa envolver o princípio ou houver evidência de problema relacionado.

## Princípio e contexto

Em muitos problemas existe complexidade essencial que precisa ser tratada em algum ponto do sistema ou processo.

**Onde investigar:** Produtos financeiros, configuração avançada, checkout, cadastro, fluxos administrativos e APIs.

## Sinais concretos a procurar

1. Simplificação visual transfere esforço excessivo ao usuário.
2. Formulário curto omite informações necessárias e gera erros depois.
3. Configuração complexa exige repetir decisões técnicas.
4. Automação esconde estados importantes e torna correção impossível.
5. Falta caminho para usuário avançado executar exceções legítimas.

## Correções técnicas e de interação recomendadas

1. Separe complexidade essencial da complexidade acidental e remova a segunda.
2. Automatize padrões seguros com possibilidade de inspecionar e corrigir.
3. Apresente complexidade em camadas de acordo com perfil e etapa.
4. Ofereça valores padrão contextualizados, sem impor escolhas irreversíveis.
5. Mantenha explicações nas decisões de alto risco e log de ações quando pertinente.
6. Aloque validações ao backend sem remover feedback útil no frontend.

## Exemplo contextual

**Antes:** Sistema pede ao usuário preencher manualmente dez campos que já conhece via cadastro.

**Depois:** Pré-preenche campos autorizados, sinaliza a origem e permite revisão antes de confirmar.

## Procedimento de auditoria e implementação

1. Identifique a jornada real, o perfil do usuário e o contexto específico da tela; levante componentes e estados relacionados.
2. Reúna evidência verificável: rota, arquivo/componente, reprodução do problema, frequência e impacto sobre a tarefa.
3. Registre alternativas, benefícios esperados, riscos e impacto sobre ações adjacentes ou sobre componentes compartilhados.
4. Implemente a menor mudança que trate a causa, preserve convenções e utilize padrões existentes no repositório.
5. Verifique estados, responsividade, acessibilidade, dados reais, regressões e consistência entre páginas relacionadas.
6. Se o teste dependente de navegador, usuários ou infraestrutura não for viável, declare como pendência em vez de afirmar sucesso.

## Validação obrigatória quando aplicável

- Conte etapas e decisões manuais em cenários comuns e exceções.
- Teste capacidade de editar padrões e entender consequências.
- Garanta que campos automatizados não introduzem dados indevidos.

## Indicadores de impacto (selecionar os adequados)

- Decisões manuais por tarefa
- Erros de configuração
- Tempo de execução
- Taxa de correção posterior

## Limites, riscos e interpretações incorretas

A lei não significa que toda complexidade seja fixa; parte dela pode ser eliminada por melhor modelagem e arquitetura.

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

- [Laws of UX: Tesler’s Law](https://lawsofux.com/teslers-law/)
- [WCAG 2.2 (W3C)](https://www.w3.org/TR/WCAG22/)
- [Documentação de skills do Gemini CLI](https://geminicli.com/docs/cli/tutorials/skills-getting-started/)
- [Skills do Codex/OpenAI](https://developers.openai.com/blog/skills-agents-sdk)
