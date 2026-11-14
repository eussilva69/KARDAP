---
name: ux-lei-de-jakob
description: "Auditar e melhorar interfaces aplicando Lei de Jakob: detectar fricções reais, propor correções proporcionais e validar usabilidade sem gerar padrões genéricos."
---

# Lei de Jakob | Skill de auditoria e implementação

> Procedimento operacional para Claude Code, Gemini CLI e Codex. Aplicar somente quando a tarefa envolver o princípio ou houver evidência de problema relacionado.

## Princípio e contexto

Pessoas transferem expectativas de sites e produtos que já utilizam para novas interfaces.

**Onde investigar:** Navegação, autenticação, carrinho, pagamentos, formulários, busca, ícones e convenções de plataforma.

## Sinais concretos a procurar

1. Elementos com aparência familiar executam ações inesperadas.
2. O botão Voltar tem comportamento inconsistente com o histórico do navegador.
3. Um ícone consagrado representa função diferente sem explicação.
4. Navegação principal muda arbitrariamente entre páginas.
5. Componentes visualmente semelhantes comportam-se de modo diferente.

## Correções técnicas e de interação recomendadas

1. Inventarie padrões de navegação e interação reconhecíveis pelo público-alvo.
2. Mantenha semântica de botão, link, input, abas e navegação compatível com convenções da plataforma.
3. Respeite o comportamento nativo de voltar, zoom, foco e teclado.
4. Quando houver inovação funcional legítima, introduza pistas claras e teste compreensão.
5. Padronize o mesmo comando e resultado entre módulos semelhantes.
6. Documente exceções a padrões conhecidos apenas quando houver benefício mensurável.

## Exemplo contextual

**Antes:** O logotipo abre um painel lateral, enquanto o título da página retorna à home.

**Depois:** O logotipo leva à página inicial; o painel é aberto por controle próprio e rotulado.

## Procedimento de auditoria e implementação

1. Identifique a jornada real, o perfil do usuário e o contexto específico da tela; levante componentes e estados relacionados.
2. Reúna evidência verificável: rota, arquivo/componente, reprodução do problema, frequência e impacto sobre a tarefa.
3. Registre alternativas, benefícios esperados, riscos e impacto sobre ações adjacentes ou sobre componentes compartilhados.
4. Implemente a menor mudança que trate a causa, preserve convenções e utilize padrões existentes no repositório.
5. Verifique estados, responsividade, acessibilidade, dados reais, regressões e consistência entre páginas relacionadas.
6. Se o teste dependente de navegador, usuários ou infraestrutura não for viável, declare como pendência em vez de afirmar sucesso.

## Validação obrigatória quando aplicável

- Peça a novos usuários que indiquem o que acontecerá ao clicar antes de testar.
- Teste as jornadas essenciais sem tutorial prévio.
- Valide comportamento de botões Voltar, links, downloads e atalhos comuns.

## Indicadores de impacto (selecionar os adequados)

- Previsão correta do resultado
- Erros por expectativa incorreta
- Tempo de aprendizado
- Chamados de suporte por navegação

## Limites, riscos e interpretações incorretas

Convenções não substituem necessidades específicas. Não copie um concorrente se o padrão prejudicar acesso, privacidade ou a tarefa real.

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

- [Laws of UX: Jakob’s Law](https://lawsofux.com/jakobs-law/)
- [WCAG 2.2 (W3C)](https://www.w3.org/TR/WCAG22/)
- [Documentação de skills do Gemini CLI](https://geminicli.com/docs/cli/tutorials/skills-getting-started/)
- [Skills do Codex/OpenAI](https://developers.openai.com/blog/skills-agents-sdk)
