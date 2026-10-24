---
name: ux-conectividade-uniforme
description: "Auditar e melhorar interfaces aplicando Lei da Conectividade Uniforme: detectar fricções reais, propor correções proporcionais e validar usabilidade sem gerar padrões genéricos."
---

# Lei da Conectividade Uniforme | Skill de auditoria e implementação

> Procedimento operacional para Claude Code, Gemini CLI e Codex. Aplicar somente quando a tarefa envolver o princípio ou houver evidência de problema relacionado.

## Princípio e contexto

Elementos visualmente conectados são percebidos como mais relacionados do que elementos sem conexão.

**Onde investigar:** Formulários, linhas de fluxo, árvores, etapas, grupos de filtros e controles vinculados.

## Sinais concretos a procurar

1. Filtros que alteram uma tabela parecem pertencer a outra seção.
2. Conexões de uma linha de processo são ambíguas.
3. Controles de uma entidade aparecem em painéis sem relação clara.
4. Muitos containers cercam elementos não relacionados.
5. Relações entre origem, destino e resultado não são mostradas.

## Correções técnicas e de interação recomendadas

1. Mapeie relações reais entre controle, informação e resultado.
2. Conecte visualmente somente elementos com vínculo funcional ou semântico.
3. Use linha, área comum, alinhamento ou agrupamento compartilhado quando ajudar.
4. Para etapas sequenciais, deixe claro o sentido e a ordem, sem depender só de setas.
5. Preserve separação de grupos distintos e evite bordas em todos os itens.
6. Use HTML semântico, fieldset/legend e associações programáticas equivalentes.

## Exemplo contextual

**Antes:** Um controle “Quantidade” fica próximo de vários itens e ninguém sabe a qual se refere.

**Depois:** O controle é integrado ao mesmo grupo do produto afetado, com associação semântica e feedback no total.

## Procedimento de auditoria e implementação

1. Identifique a jornada real, o perfil do usuário e o contexto específico da tela; levante componentes e estados relacionados.
2. Reúna evidência verificável: rota, arquivo/componente, reprodução do problema, frequência e impacto sobre a tarefa.
3. Registre alternativas, benefícios esperados, riscos e impacto sobre ações adjacentes ou sobre componentes compartilhados.
4. Implemente a menor mudança que trate a causa, preserve convenções e utilize padrões existentes no repositório.
5. Verifique estados, responsividade, acessibilidade, dados reais, regressões e consistência entre páginas relacionadas.
6. Se o teste dependente de navegador, usuários ou infraestrutura não for viável, declare como pendência em vez de afirmar sucesso.

## Validação obrigatória quando aplicável

- Peça que participantes identifiquem o elemento controlado sem interação.
- Teste a versão empilhada mobile para não romper conexões.
- Valide que a ordem do DOM mantém relações acessíveis.

## Indicadores de impacto (selecionar os adequados)

- Acerto de associação
- Erros em controles
- Tempo para localizar relações
- Consistência semântica

## Limites, riscos e interpretações incorretas

Linhas e containers não substituem rotulagem ou relações estruturais acessíveis. Use conexão apenas quando representar vínculo verdadeiro.

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

- [Laws of UX: Law of Uniform Connectedness](https://lawsofux.com/law-of-uniform-connectedness/)
- [WCAG 2.2 (W3C)](https://www.w3.org/TR/WCAG22/)
- [Documentação de skills do Gemini CLI](https://geminicli.com/docs/cli/tutorials/skills-getting-started/)
- [Skills do Codex/OpenAI](https://developers.openai.com/blog/skills-agents-sdk)
