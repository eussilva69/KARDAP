---
name: property-based-testing
description: Testes generativos por propriedades/invariantes com shrinking e seeds reprodutíveis.
---

# property-based-testing

## Quando ativar
Quando há parsers, transformações, regras numéricas, permissões ou estados com combinatória elevada.

## Resultado e limites
Esta skill transforma uma tarefa pontual em um procedimento reproduzível. Não determina a stack nem concede acesso a serviços; comece identificando o que está implementado, permissões e ambiente. Evite executar o workflow se ele não for aplicável ao repositório.

## Preparação mínima
1. Ler `CONTEXTO_PROJETO.md` e a seção necessária de `AI_RULES.md` quando disponíveis; validar informações contra o código.
2. Inspecionar `git status` sem sobrescrever modificações existentes e mapear fluxo, dependências, risco e comando de teste real.
3. Distinguir: confirmado no código, observado por teste, hipótese, não verificável. Registrar baseline antes de editar.
4. Ações destrutivas, produção, compras/custos externos, migrações irreversíveis e leitura de dados sensíveis exigem autorização explícita.

## Protocolo de execução
1. Defina invariantes de domínio sem implementar a própria lógica como oráculo (ex.: valor total invariável sob reordenação).
2. Defina geradores de entradas válidas e inválidas, limites, unicode, timezone, precision e casos degenerados.
3. Inclua preconditions mínimas, evitando `assume` excessivo que descarte cenários difíceis.
4. Rode gerador com seed e número de casos registrados; persista exemplos que causarem falha.
5. Faça shrinking até contraexemplo mínimo e crie regressão determinística.
6. Verifique erros de overflow, race e idempotência quando aplicáveis.
7. Integre no CI com duração previsível; mantenha execução longa separada para nightly quando necessário.

## Verificações e critérios de aceitação
- Falha reproduzível por seed, novo teste de regressão, cobertura de limites e verificação de falsos positivos do oráculo.

## Entrega obrigatória
Propriedades, geradores, seeds, contraexemplos, correções e testes executados.

Para toda entrega, anote: escopo, arquivos relevantes, baseline, alteração ou recomendação, teste realmente executado (com resultado), riscos restantes e próximos passos. Nunca afirme validação, resultado quantitativo ou ausência de falhas sem evidência.

## Restrições específicas
Não aplique à UI sem invariantes observáveis; cuidado com geradores que acionem APIs externas.

## Ferramentas/comandos candidatos (não executar automaticamente)
Hypothesis, fast-check ou QuickCheck compatível com stack.

## Referência para consulta e checagem de versão
- https://hypothesis.readthedocs.io/

> Este playbook foi redigido para uso interno; não implica certificação, suporte oficial do fornecedor nem execução prévia de testes.
