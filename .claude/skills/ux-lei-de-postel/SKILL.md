---
name: ux-lei-de-postel
description: "Auditar e melhorar interfaces aplicando Lei de Postel: detectar fricções reais, propor correções proporcionais e validar usabilidade sem gerar padrões genéricos."
---

# Lei de Postel | Skill de auditoria e implementação

> Procedimento operacional para Claude Code, Gemini CLI e Codex. Aplicar somente quando a tarefa envolver o princípio ou houver evidência de problema relacionado.

## Princípio e contexto

Princípio histórico de robustez que recomenda tolerância a entradas válidas variadas e saída consistente.

**Onde investigar:** Formulários, internacionalização, formatos de texto e interfaces tolerantes a variações benignas.

## Sinais concretos a procurar

1. Campos falham por espaços extras ou formatação comum.
2. Interface força um formato específico quando normalização segura seria possível.
3. Mensagens de erro não explicam o formato esperado.
4. Sistema apresenta saídas diferentes para o mesmo tipo de dado.
5. Aceitação permissiva de payloads ambíguos abre risco de segurança.

## Correções técnicas e de interação recomendadas

1. Aceite variantes benignas de entrada explicitamente suportadas, como espaços ao redor de e-mail quando seguro.
2. Normalize somente com regras testadas e transparência sobre transformações.
3. Mantenha validação de esquema estrita em APIs, autorização, pagamentos e dados sensíveis.
4. Produza saídas coerentes, bem formatadas e compatíveis com contratos documentados.
5. Rejeite entradas ambíguas ou perigosas com mensagens precisas.
6. Adicione testes de bordas, unicode, locale e dados malformados.

## Exemplo contextual

**Antes:** Campo de telefone rejeita número válido porque veio com espaços e separadores comuns.

**Depois:** Frontend admite formatos usuais do contexto, normaliza de modo seguro e backend valida o número final.

## Procedimento de auditoria e implementação

1. Identifique a jornada real, o perfil do usuário e o contexto específico da tela; levante componentes e estados relacionados.
2. Reúna evidência verificável: rota, arquivo/componente, reprodução do problema, frequência e impacto sobre a tarefa.
3. Registre alternativas, benefícios esperados, riscos e impacto sobre ações adjacentes ou sobre componentes compartilhados.
4. Implemente a menor mudança que trate a causa, preserve convenções e utilize padrões existentes no repositório.
5. Verifique estados, responsividade, acessibilidade, dados reais, regressões e consistência entre páginas relacionadas.
6. Se o teste dependente de navegador, usuários ou infraestrutura não for viável, declare como pendência em vez de afirmar sucesso.

## Validação obrigatória quando aplicável

- Teste entradas benignas variantes e entradas malformadas.
- Confirme contratos API e validação server-side.
- Teste tentativas de bypass, tipos errados, permissões e dados duplicados.

## Indicadores de impacto (selecionar os adequados)

- Rejeições indevidas
- Erros de validação
- Bugs de interoperabilidade
- Aceitação de entradas não autorizadas

## Limites, riscos e interpretações incorretas

A tolerância indiscriminada é perigosa: em protocolos, autenticação e segurança, parsing estrito e contratos explícitos são preferíveis.

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

- [Laws of UX: Postel’s Law](https://lawsofux.com/postels-law/)
- [WCAG 2.2 (W3C)](https://www.w3.org/TR/WCAG22/)
- [Documentação de skills do Gemini CLI](https://geminicli.com/docs/cli/tutorials/skills-getting-started/)
- [Skills do Codex/OpenAI](https://developers.openai.com/blog/skills-agents-sdk)
