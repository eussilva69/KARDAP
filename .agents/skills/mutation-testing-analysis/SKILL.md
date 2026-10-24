---
name: mutation-testing-analysis
description: Avaliar se testes detectam mutações de código semanticamente relevantes.
---

# mutation-testing-analysis

## Quando ativar
Quando cobertura de linhas é alta, mas bugs escapam, ou ao revisar regras de negócio críticas.

## Resultado e limites
Esta skill transforma uma tarefa pontual em um procedimento reproduzível. Não determina a stack nem concede acesso a serviços; comece identificando o que está implementado, permissões e ambiente. Evite executar o workflow se ele não for aplicável ao repositório.

## Preparação mínima
1. Ler `CONTEXTO_PROJETO.md` e a seção necessária de `AI_RULES.md` quando disponíveis; validar informações contra o código.
2. Inspecionar `git status` sem sobrescrever modificações existentes e mapear fluxo, dependências, risco e comando de teste real.
3. Distinguir: confirmado no código, observado por teste, hipótese, não verificável. Registrar baseline antes de editar.
4. Ações destrutivas, produção, compras/custos externos, migrações irreversíveis e leitura de dados sensíveis exigem autorização explícita.

## Protocolo de execução
1. Escolha pequeno módulo crítico com testes estáveis e duração aceitável; evite rodar mutação no monorepo inteiro de início.
2. Colete baseline de testes e coverage; confirme que todos passam antes de mutar.
3. Configure operadores pertinentes (condicional, limites, retorno, aritmética) e exclusões justificadas para código gerado.
4. Rode mutações em isolamento e capture killed/survived/timeout; diferencie mutantes equivalentes e ignorados.
5. Para sobreviventes, escreva asserts de comportamento/invariantes reais, não apenas snapshots frágeis.
6. Reexecute testes e mutação, compare score por módulo e regressão no tempo de CI.
7. Não maximize mutation score com testes que reproduzem implementação sem valor funcional.

## Verificações e critérios de aceitação
- Relatório survived/killed, lista de falsos positivos/equivalentes, testes adicionados e score comparável antes/depois.

## Entrega obrigatória
Top mutantes sobreviventes, lacunas de regra de negócio, correções e thresholds viáveis.

Para toda entrega, anote: escopo, arquivos relevantes, baseline, alteração ou recomendação, teste realmente executado (com resultado), riscos restantes e próximos passos. Nunca afirme validação, resultado quantitativo ou ausência de falhas sem evidência.

## Restrições específicas
Evite executar mutantes em banco/ambientes externos; rodar apenas isolamento de testes.

## Ferramentas/comandos candidatos (não executar automaticamente)
Stryker, mutmut, PIT conforme linguagem.

## Referência para consulta e checagem de versão
- https://stryker-mutator.io/

> Este playbook foi redigido para uso interno; não implica certificação, suporte oficial do fornecedor nem execução prévia de testes.
