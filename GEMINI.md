# GEMINI.md | Instruções do Gemini CLI para este repositório

## Regras compartilhadas (importação automática)

@./AI_RULES.md

## Contexto do produto (importação automática)

@./CONTEXTO_PROJETO.md

## Como operar neste projeto

1. Considere `AI_RULES.md` o contrato de qualidade e de execução para este repositório. Mantenha este arquivo de entrada curto; não replique as regras comuns.
2. Utilize `CONTEXTO_PROJETO.md` apenas para fatos confirmados; se não estiver configurado, não deduza informações comerciais e verifique a stack no código. Ao iniciar uma tarefa de código, identifique tecnologias, arquivos, scripts, estado do Git e contexto indispensável. Não presuma stack ou integração.
3. Siga as regras pertinentes **ao escopo efetivamente solicitado**, não um mandato para alterar o site inteiro em cada interação.
4. Para tarefa especializada, consulte as seções aplicáveis de `GUIA_TECNICO_DETALHADO.md` quando necessário.
5. Quando for explicitamente solicitado fazer auditoria completa, revisão de ponta a ponta ou reestruturação global, leia `AUDITORIA_GERAL.md` e consulte `GUIA_TECNICO_DETALHADO.md`, aplicando inventário, prioridades, implementação, validação e relatório.
6. Não execute refatorações extensas, instalações de dependências, exclusões irreversíveis, alterações em produção ou operações externas sem necessidade e autorização apropriada.
7. Quando ferramentas de execução estiverem disponíveis, use-as para comprovar testes; caso contrário, diga que a verificação é apenas estática.
8. Ao concluir, informe mudanças implementadas, arquivos e evidências de testes, distinguindo implementado, validado e pendente.

## Quando houver conflito ou lacuna

Respeite o pedido atual e as restrições do ambiente. Preserve regras de negócio, dados, acessibilidade e segurança. Uma escolha de design só é adequada quando melhora o produto real, não por parecer uma tendência.

## Confirmar que este arquivo foi carregado

No Gemini CLI, use `/memory show` para visualizar o contexto carregado e `/memory reload` para recarregar instruções após atualizações, conforme suporte da versão instalada.

## Especialistas locais

Há 52 subagentes em `.gemini/agents/*.md` cobrindo orquestração, arquitetura, frontend, backend, bancos de dados, linguagens (Python, Go, TS), mobile, devops, SRE, QA, IA/LLMs, imagens e design. Consulte `GUIA_DE_AGENTES.md` para o catálogo completo. Delegue tarefas objetivas apenas se houver ganho real e evite que agentes editem os mesmos arquivos simultaneamente. Alguns agentes são explicitamente de leitura e outros de implementação; respeite os limites indicados nos arquivos. Conforme a versão do Gemini CLI, use `/agents` para conferir o registro e `@nome-do-agente` para solicitar delegação.
