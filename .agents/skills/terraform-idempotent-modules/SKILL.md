---
name: terraform-idempotent-modules
description: Módulos IaC Terraform/OpenTofu reutilizáveis com state locking, idempotência e prevenção de drift.
---

# terraform-idempotent-modules

## Quando ativar
Quando criar ou ajustar infraestrutura declarativa e reduzir mudanças não planejadas.

## Resultado e limites
Esta skill transforma uma tarefa pontual em um procedimento reproduzível. Não determina a stack nem concede acesso a serviços; comece identificando o que está implementado, permissões e ambiente. Evite executar o workflow se ele não for aplicável ao repositório.

## Preparação mínima
1. Ler `CONTEXTO_PROJETO.md` e a seção necessária de `AI_RULES.md` quando disponíveis; validar informações contra o código.
2. Inspecionar `git status` sem sobrescrever modificações existentes e mapear fluxo, dependências, risco e comando de teste real.
3. Distinguir: confirmado no código, observado por teste, hipótese, não verificável. Registrar baseline antes de editar.
4. Ações destrutivas, produção, compras/custos externos, migrações irreversíveis e leitura de dados sensíveis exigem autorização explícita.

## Protocolo de execução
1. Descubra provider, workspace, backend state, versões e dependências; não inicialize em cloud real sem autorização.
2. Defina inputs/outputs com tipos, validação, defaults seguros e documentação das preconditions.
3. Proteja state com backend remoto, locking quando suportado, permissões mínimas e política de acesso; state frequentemente contém dados sensíveis.
4. Pinar versões de provider e módulos com intervalo suportado; evitar `latest` não testado.
5. Execute fmt/validate e plan somente em ambiente autorizado; trate drift separadamente de feature change.
6. Adicione testes de módulo isolado e políticas de segurança; documente recursos substituídos/destruídos no plan.
7. Faça rollout por ambiente, revisões e aprovação explícita para apply; preserve rollback e backup de state.

## Verificações e critérios de aceitação
- terraform fmt -check, validate, plan em ambiente apropriado, diff do state previsto, documentação das versões e recursos impactados.

## Entrega obrigatória
Módulo e README, riscos de state/locks, plan saneado e critérios de aprovação.

Para toda entrega, anote: escopo, arquivos relevantes, baseline, alteração ou recomendação, teste realmente executado (com resultado), riscos restantes e próximos passos. Nunca afirme validação, resultado quantitativo ou ausência de falhas sem evidência.

## Restrições específicas
Nunca terraform apply/destroy/import/state rm em produção sem autorização explícita.

## Ferramentas/comandos candidatos (não executar automaticamente)
terraform fmt -check; terraform validate; terraform plan (se autorizado).

## Referência para consulta e checagem de versão
- https://developer.hashicorp.com/terraform/language/modules

> Este playbook foi redigido para uso interno; não implica certificação, suporte oficial do fornecedor nem execução prévia de testes.
