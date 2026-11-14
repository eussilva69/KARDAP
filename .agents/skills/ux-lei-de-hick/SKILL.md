---
name: ux-lei-de-hick
description: "Auditar e melhorar interfaces aplicando Lei de Hick-Hyman: detectar fricções reais, propor correções proporcionais e validar usabilidade sem gerar padrões genéricos."
---

# Lei de Hick-Hyman | Skill de auditoria e implementação

> Procedimento operacional para Claude Code, Gemini CLI e Codex. Aplicar somente quando a tarefa envolver o princípio ou houver evidência de problema relacionado.

## Princípio e contexto

Quanto maior o número e a complexidade das alternativas percebidas, maior tende a ser o tempo necessário para decidir.

**Onde investigar:** Menus, escolha de planos, filtros, ações concorrentes, onboarding, decisões de checkout e configuração.

## Sinais concretos a procurar

1. Várias ações primárias disputam a atenção no mesmo contexto.
2. Usuários precisam ler todas as opções antes de identificar a próxima ação.
3. Filtros extensos aparecem sem agrupamentos úteis.
4. A mesma decisão é apresentada repetidas vezes durante um fluxo.
5. Menus extensos misturam ações frequentes com configurações raras.

## Correções técnicas e de interação recomendadas

1. Mapeie a tarefa dominante e a frequência de uso real antes de reduzir opções.
2. Agrupe escolhas por intenção, com rótulos reconhecíveis e categorias mutuamente compreensíveis.
3. Adote revelação progressiva apenas para opções secundárias; mantenha alternativas críticas descobríveis.
4. Mostre uma recomendação somente quando houver critério explicável e não houver manipulação comercial.
5. Para escolhas dependentes, organize etapas curtas com indicação de progresso e retorno.
6. Faça buscas e filtros encontrarem itens específicos sem abrir dezenas de menus.

## Exemplo contextual

**Antes:** Checkout apresenta oito botões com igual destaque: pagar, simular, favoritar, imprimir, compartilhar, salvar, voltar e ajuda.

**Depois:** Destaque “Continuar para pagamento”; agrupe ações secundárias com rótulos claros e preserve acesso à ajuda e ao retorno.

## Procedimento de auditoria e implementação

1. Identifique a jornada real, o perfil do usuário e o contexto específico da tela; levante componentes e estados relacionados.
2. Reúna evidência verificável: rota, arquivo/componente, reprodução do problema, frequência e impacto sobre a tarefa.
3. Registre alternativas, benefícios esperados, riscos e impacto sobre ações adjacentes ou sobre componentes compartilhados.
4. Implemente a menor mudança que trate a causa, preserve convenções e utilize padrões existentes no repositório.
5. Verifique estados, responsividade, acessibilidade, dados reais, regressões e consistência entre páginas relacionadas.
6. Se o teste dependente de navegador, usuários ou infraestrutura não for viável, declare como pendência em vez de afirmar sucesso.

## Validação obrigatória quando aplicável

- Observe se participantes identificam a próxima ação sem explicar a interface.
- Compare tempo de decisão e taxa de erro antes e depois em tarefas equivalentes.
- Verifique se a opção menos frequente continua facilmente encontrável por teclado e mobile.

## Indicadores de impacto (selecionar os adequados)

- Tempo até primeira ação correta
- Taxa de abandono em pontos de decisão
- Erros de seleção
- Conclusão do fluxo

## Limites, riscos e interpretações incorretas

Não existe número universal máximo de itens. Reduzir opções pode esconder funcionalidades ou aumentar cliques; valide pelo contexto e frequência de uso.

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

- [Laws of UX: Hick’s Law](https://lawsofux.com/hicks-law/)
- [WCAG 2.2 (W3C)](https://www.w3.org/TR/WCAG22/)
- [Documentação de skills do Gemini CLI](https://geminicli.com/docs/cli/tutorials/skills-getting-started/)
- [Skills do Codex/OpenAI](https://developers.openai.com/blog/skills-agents-sdk)
