# AGENTS.md | Instruções do OpenAI Codex para este repositório

> Este arquivo é lido automaticamente pelo Codex quando encontrado na hierarquia do repositório. **Codex não importa automaticamente `AI_RULES.md` pelo texto `@./AI_RULES.md`.** Por isso, esta instrução solicita sua leitura explícita no início de cada tarefa.

## 1. Início obrigatório de cada tarefa

1. **Leia `AI_RULES.md`** na raiz do repositório antes de propor ou editar código. Ele contém as regras permanentes compartilhadas com Claude Code e Gemini CLI. Se não conseguir ler o arquivo, informe a limitação e siga as regras mínimas deste `AGENTS.md`.
2. **Leia `CONTEXTO_PROJETO.md`**, se existir, para entender o produto, os usuários, as restrições e as decisões conhecidas. Nunca trate campos não preenchidos, exemplos ou hipóteses como fatos.
3. Confirme o escopo do pedido. Para correção localizada, investigue apenas o necessário e os seus efeitos colaterais; não execute auditoria global por iniciativa própria.
4. Observe o estado do Git e identifique a stack, os padrões, os comandos de teste existentes e os pontos de integração antes de modificar arquivos.

## 2. Regras de execução de alta prioridade

- Preserve autenticação, autorização, regras de negócio, contratos de API, pagamentos, dados, integrações e modificações preexistentes de terceiros.
- Não invente funcionalidades, provas sociais, métricas, obrigações legais, resultados de testes, detalhes do negócio ou tecnologias não confirmadas.
- Prefira soluções verificáveis, específicas do produto, acessíveis, mobile-first, enxutas e consistentes com o código existente.
- Não faça redesign por tendência estética, nem instale dependências sem necessidade demonstrada.
- Mudanças irreversíveis, alterações em banco ou produção, migrações arriscadas, cobranças reais, exclusões de dados, deploy e ações externas de alto risco requerem autorização apropriada.
- Nunca exponha tokens, segredos, dados pessoais ou caminhos sensíveis em código, logs, testes ou relatórios.
- Faça mudanças localizadas, valide os fluxos impactados e revise o diff. Não declare testes que não executou.

## 3. Guias sob demanda

- **Auditoria geral explícita:** leia `AUDITORIA_GERAL.md` integralmente, consulte as seções necessárias de `GUIA_TECNICO_DETALHADO.md` e cumpra o protocolo de inventário, severidade, implementação, evidência e relatório.
- **Tarefa especializada:** consulte apenas as seções pertinentes de `GUIA_TECNICO_DETALHADO.md` para UX/UI, Nielsen, Norman Door, autenticidade visual, design system, mobile, WCAG, SEO, LGPD, segurança, performance ou processamento assíncrono/jobs.
- **Tarefa comum:** siga `AI_RULES.md` e `CONTEXTO_PROJETO.md` sem abrir documentos extensos desnecessariamente.

## 4. Validação e entrega

- Execute apenas scripts reais encontrados no repositório (lint, typecheck, testes, build e testes relevantes). Faça testes adicionais quando ferramentas e acesso permitirem.
- Separe resultados **inspecionados**, **alterados**, **testados**, **pendentes** e **não verificáveis**.
- Resuma: problema resolvido, arquivos alterados, verificações realizadas, resultado e limitações. Em auditoria completa, siga a matriz e o formato do `AUDITORIA_GERAL.md`.
- Nunca faça commit, push ou deploy por conta própria sem solicitação.

## 5. Revisão de código (Codex)

Ao revisar um diff, priorize bugs reais, regressões, segurança, privacidade, integridade de dados, permissões, concorrência/idempotência, falta de tratamento de erro, acessibilidade, problemas mobile, SEO público e testes relevantes. Cite arquivo/trecho e cenário reproduzível; não confunda gosto visual com defeito comprovado. Considere os critérios do `AI_RULES.md` e evite sugestões especulativas.

## 6. Verificação das instruções

Em uma sessão nova do Codex iniciada na raiz do repositório, solicite: **"Informe quais arquivos de instrução do repositório você identificou e resuma as regras compartilhadas lidas de AI_RULES.md."** O Codex reconhecerá automaticamente `AGENTS.md`; a leitura dos demais arquivos é operacionalizada pelas instruções acima. A confirmação verbal não substitui teste da implementação.

## 7. Subagentes locais do Codex

Há 52 perfis de especialistas em `.codex/agents/*.toml` (consulte `GUIA_DE_AGENTES.md` para o catálogo completo); `.codex/config.toml` habilita delegação e limita a três threads concorrentes. Use especialistas para análise e trabalho isolados, sem custo/complexidade extra em tarefas simples. Roles de auditoria têm restrição comportamental de leitura, **não** um sandbox independente: permissões e isolamento são herdados da sessão principal. Delegue QA/revisão independente após implementação; não edite o mesmo arquivo em paralelo e não execute ações destrutivas sem autorização.
