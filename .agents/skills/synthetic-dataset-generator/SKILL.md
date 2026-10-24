---
name: synthetic-dataset-generator
description: Geração de datasets sintéticos representativos com diversidade, controles de privacidade e validação de domínio.
---

# synthetic-dataset-generator

## Quando ativar
Quando faltam exemplos para testar fluxos, prompts, classificadores ou validações sem utilizar dados pessoais reais.

## Resultado e limites
Esta skill transforma uma tarefa pontual em um procedimento reproduzível. Não determina a stack nem concede acesso a serviços; comece identificando o que está implementado, permissões e ambiente. Evite executar o workflow se ele não for aplicável ao repositório.

## Preparação mínima
1. Ler `CONTEXTO_PROJETO.md` e a seção necessária de `AI_RULES.md` quando disponíveis; validar informações contra o código.
2. Inspecionar `git status` sem sobrescrever modificações existentes e mapear fluxo, dependências, risco e comando de teste real.
3. Distinguir: confirmado no código, observado por teste, hipótese, não verificável. Registrar baseline antes de editar.
4. Ações destrutivas, produção, compras/custos externos, migrações irreversíveis e leitura de dados sensíveis exigem autorização explícita.

## Protocolo de execução
1. Defina a finalidade: teste, avaliação, treinamento ou stress; não trate sintético como substituto de dado real em decisões de produção.
2. Enumere schema, invariantes, distribuição esperada, casos raros, limites, localidades e grupos de erro.
3. Crie seed reproduzível e partições; gere dados plausíveis e adversariais sem reutilizar identificadores reais.
4. Evite memorizar/amostrar registros pessoais; procure vazamento por similaridade e regras de unicidade.
5. Valide constraints do banco, encoding, consistência temporal, dependências entre entidades e balanceamento dos casos.
6. Para uso em eval, mantenha benchmarks controlados; marque que outputs de IA não equivalem a labels humanos.
7. Documente gerador, configuração, seed, licença das fontes e limitações de representatividade.

## Verificações e critérios de aceitação
- Testes de schema, duplicidade, distribuição marginal, cobertura de casos extremos, privacy screening e determinismo.
- Conferir ausência de credenciais realistas e URLs de endpoints sensíveis.

## Entrega obrigatória
Dataset gerado, manifest com proveniência, seed, resultados dos validadores e limitações de uso.

Para toda entrega, anote: escopo, arquivos relevantes, baseline, alteração ou recomendação, teste realmente executado (com resultado), riscos restantes e próximos passos. Nunca afirme validação, resultado quantitativo ou ausência de falhas sem evidência.

## Restrições específicas
Não inserir dados sintéticos em produção por padrão; nunca simular pagamentos reais ou contas identificáveis.

## Ferramentas/comandos candidatos (não executar automaticamente)
Faker ou factory/builder já presentes, testes de schema.

## Referência para consulta e checagem de versão
- https://docs.python.org/3/library/random.html

> Este playbook foi redigido para uso interno; não implica certificação, suporte oficial do fornecedor nem execução prévia de testes.
