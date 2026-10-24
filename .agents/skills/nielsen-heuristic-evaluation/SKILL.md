---
name: nielsen-heuristic-evaluation
description: Auditoria de usabilidade baseada nas 10 heurísticas de Nielsen com severidade e evidência por fluxo.
---

# nielsen-heuristic-evaluation

## Quando ativar
Quando avaliar jornadas, componentes, telas ou uma solicitação explícita de auditoria UX.

## Resultado e limites
Esta skill transforma uma tarefa pontual em um procedimento reproduzível. Não determina a stack nem concede acesso a serviços; comece identificando o que está implementado, permissões e ambiente. Evite executar o workflow se ele não for aplicável ao repositório.

## Preparação mínima
1. Ler `CONTEXTO_PROJETO.md` e a seção necessária de `AI_RULES.md` quando disponíveis; validar informações contra o código.
2. Inspecionar `git status` sem sobrescrever modificações existentes e mapear fluxo, dependências, risco e comando de teste real.
3. Distinguir: confirmado no código, observado por teste, hipótese, não verificável. Registrar baseline antes de editar.
4. Ações destrutivas, produção, compras/custos externos, migrações irreversíveis e leitura de dados sensíveis exigem autorização explícita.

## Protocolo de execução
1. Identifique personas/tarefas verificáveis, páginas existentes, dispositivos e fluxos prioritários.
2. Observe os 10 princípios: status; linguagem do usuário; controle; consistência; prevenção; reconhecimento; eficiência; minimalismo; recuperação; ajuda.
3. Para cada problema capture estado atual, expectativa do usuário, evidência, localização e impacto sobre a tarefa.
4. Classifique severidade por frequência, impacto e persistência (0 sem problema, 1 cosmético, 2 menor, 3 grave, 4 crítico), justificando.
5. Proponha mudança mínima que resolva causa e preserve identidade e regras de negócio; diferencie problemas de preferências visuais.
6. Se permitido, implemente mudanças priorizadas em componentes compartilhados; valide navegação, keyboard, touch, formulários e feedback.
7. Faça segunda passada e relacione achados que ficaram pendentes com limitação de evidência.

## Verificações e critérios de aceitação
- Capturas/screenshots e reprodução quando ferramentas disponíveis; checklist por heurística; acessibilidade automática + teste manual onde possível.

## Entrega obrigatória
Matriz tela/heurística/evidência/severidade/correção/teste; maior impacto e pendências.

Para toda entrega, anote: escopo, arquivos relevantes, baseline, alteração ou recomendação, teste realmente executado (com resultado), riscos restantes e próximos passos. Nunca afirme validação, resultado quantitativo ou ausência de falhas sem evidência.

## Restrições específicas
Não atribua nota a telas inacessíveis; avaliação heurística não equivale a pesquisa com usuários.

## Ferramentas/comandos candidatos (não executar automaticamente)
Browser DevTools, Playwright, axe quando existentes.

## Referência para consulta e checagem de versão
- https://www.nngroup.com/articles/ten-usability-heuristics/

> Este playbook foi redigido para uso interno; não implica certificação, suporte oficial do fornecedor nem execução prévia de testes.
