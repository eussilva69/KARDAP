---
name: ux-lei-de-miller
description: "Auditar e melhorar interfaces aplicando Lei de Miller: detectar fricções reais, propor correções proporcionais e validar usabilidade sem gerar padrões genéricos."
---

# Lei de Miller | Skill de auditoria e implementação

> Procedimento operacional para Claude Code, Gemini CLI e Codex. Aplicar somente quando a tarefa envolver o princípio ou houver evidência de problema relacionado.

## Princípio e contexto

A memória de curto prazo tem capacidade limitada para manter unidades de informação simultâneas.

**Onde investigar:** Formulários multietapas, menus densos, instruções, painéis e decisões dependentes de memória.

## Sinais concretos a procurar

1. O usuário precisa memorizar informações de uma tela para outra.
2. Listas extensas não têm categorias compreensíveis.
3. Instruções importantes desaparecem depois de um passo.
4. Códigos, requisitos ou seleções não permanecem visíveis durante o fluxo.
5. O sistema espera que a pessoa lembre parâmetros escolhidos anteriormente.

## Correções técnicas e de interação recomendadas

1. Transforme informações dispersas em agrupamentos com significado real (chunking).
2. Mantenha seleções, valores e contexto visíveis nas etapas subsequentes.
3. Ofereça revisão final e resumos contextuais quando necessários.
4. Use reconhecimento: histórico, sugestões e rótulos persistentes.
5. Divida processos grandes conforme dependências lógicas, sem fragmentar demais.
6. Evite exigir memorização de códigos ou documentos quando puder pré-preencher com segurança.

## Exemplo contextual

**Antes:** Usuário escolhe parâmetros na tela A e precisa lembrar cinco valores na tela B.

**Depois:** Tela B apresenta um resumo editável dos parâmetros anteriores durante o preenchimento.

## Procedimento de auditoria e implementação

1. Identifique a jornada real, o perfil do usuário e o contexto específico da tela; levante componentes e estados relacionados.
2. Reúna evidência verificável: rota, arquivo/componente, reprodução do problema, frequência e impacto sobre a tarefa.
3. Registre alternativas, benefícios esperados, riscos e impacto sobre ações adjacentes ou sobre componentes compartilhados.
4. Implemente a menor mudança que trate a causa, preserve convenções e utilize padrões existentes no repositório.
5. Verifique estados, responsividade, acessibilidade, dados reais, regressões e consistência entre páginas relacionadas.
6. Se o teste dependente de navegador, usuários ou infraestrutura não for viável, declare como pendência em vez de afirmar sucesso.

## Validação obrigatória quando aplicável

- Execute fluxo com uma pausa entre etapas e observe erros de memória.
- Verifique se a tarefa pode ser concluída sem voltar para consultar dados anteriores.
- Inspecione chunking sem criar passos adicionais desnecessários.

## Indicadores de impacto (selecionar os adequados)

- Retornos por esquecimento
- Erros de memória
- Tempo entre etapas
- Número de informações exigidas de memória

## Limites, riscos e interpretações incorretas

“7 ± 2” descreve uma tradição de pesquisa específica, não uma regra para número de itens de menu. Estudos posteriores apontam limites menores em condições particulares.

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

- [Laws of UX: Miller’s Law](https://lawsofux.com/millers-law/)
- [WCAG 2.2 (W3C)](https://www.w3.org/TR/WCAG22/)
- [Documentação de skills do Gemini CLI](https://geminicli.com/docs/cli/tutorials/skills-getting-started/)
- [Skills do Codex/OpenAI](https://developers.openai.com/blog/skills-agents-sdk)
- [Cowan (2001): limites de memória de curto prazo](https://pubmed.ncbi.nlm.nih.gov/11515286/)
