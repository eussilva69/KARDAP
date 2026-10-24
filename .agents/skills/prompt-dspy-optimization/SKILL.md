---
name: prompt-dspy-optimization
description: Otimização orientada a dados de prompts e pipelines com DSPy ou metodologia equivalente, evitando overfit.
---

# prompt-dspy-optimization

## Quando ativar
Quando um pipeline de LLM possui dataset, objetivo mensurável e orçamento de testes controlado.

## Resultado e limites
Esta skill transforma uma tarefa pontual em um procedimento reproduzível. Não determina a stack nem concede acesso a serviços; comece identificando o que está implementado, permissões e ambiente. Evite executar o workflow se ele não for aplicável ao repositório.

## Preparação mínima
1. Ler `CONTEXTO_PROJETO.md` e a seção necessária de `AI_RULES.md` quando disponíveis; validar informações contra o código.
2. Inspecionar `git status` sem sobrescrever modificações existentes e mapear fluxo, dependências, risco e comando de teste real.
3. Distinguir: confirmado no código, observado por teste, hipótese, não verificável. Registrar baseline antes de editar.
4. Ações destrutivas, produção, compras/custos externos, migrações irreversíveis e leitura de dados sensíveis exigem autorização explícita.

## Protocolo de execução
1. Defina tarefa, assinatura de entrada/saída, critérios de sucesso, riscos de segurança e validação de contexto.
2. Crie treino, validação e teste com separação por origem/tempo para evitar contaminação e vazamento de exemplares.
3. Escolha métrica operacional composta: correção, aderência de schema, abstention, custo e latência.
4. Estabeleça baseline de prompt manual e pipeline sem otimização; fixe versões e seed quando suportado.
5. Configure otimizador DSPy apropriado ou busca limitada de few-shots; controle número de chamadas e orçamento.
6. Avalie somente no conjunto de validação durante a busca; use conjunto de teste intocado no final.
7. Inspecione exemplos escolhidos quanto a PII, regressões, prompt injection, custo e plausibilidade causal.

## Verificações e critérios de aceitação
- Registro de configurações, split de dados, mediana de múltiplas execuções, métricas por segmento e teste held-out.
- Não afirmar ganho estável com uma única execução.

## Entrega obrigatória
Prompt/pipeline final, diff e justificativa, métricas treino/validação/teste, custo, regressões e rollback.

Para toda entrega, anote: escopo, arquivos relevantes, baseline, alteração ou recomendação, teste realmente executado (com resultado), riscos restantes e próximos passos. Nunca afirme validação, resultado quantitativo ou ausência de falhas sem evidência.

## Restrições específicas
Sem dataset rotulado, priorize criar avaliação antes de otimizar; evitar vazamento de dados em exemplos.

## Ferramentas/comandos candidatos (não executar automaticamente)
DSPy quando já disponível; scripts locais de avaliação.

## Referência para consulta e checagem de versão
- https://dspy.ai/

> Este playbook foi redigido para uso interno; não implica certificação, suporte oficial do fornecedor nem execução prévia de testes.
