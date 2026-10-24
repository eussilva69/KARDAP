---
name: event-sourcing-snapshotting
description: Snapshot e reconstrução segura de estado em event sourcing, com versionamento e idempotência.
---

# event-sourcing-snapshotting

## Quando ativar
Quando streams crescem, replays ficam caros ou mudanças de schema de eventos ameaçam compatibilidade.

## Resultado e limites
Esta skill transforma uma tarefa pontual em um procedimento reproduzível. Não determina a stack nem concede acesso a serviços; comece identificando o que está implementado, permissões e ambiente. Evite executar o workflow se ele não for aplicável ao repositório.

## Preparação mínima
1. Ler `CONTEXTO_PROJETO.md` e a seção necessária de `AI_RULES.md` quando disponíveis; validar informações contra o código.
2. Inspecionar `git status` sem sobrescrever modificações existentes e mapear fluxo, dependências, risco e comando de teste real.
3. Distinguir: confirmado no código, observado por teste, hipótese, não verificável. Registrar baseline antes de editar.
4. Ações destrutivas, produção, compras/custos externos, migrações irreversíveis e leitura de dados sensíveis exigem autorização explícita.

## Protocolo de execução
1. Identifique agregado, evento imutável, sequence/version e armazenamento; confirme que o projeto realmente usa event sourcing.
2. Meça custo de replay, tempo p95 e tamanho de streams; escolha ponto de corte com ROI.
3. Defina snapshot com aggregate ID, último sequence/version, versão do schema, checksum e referência de causalidade.
4. Faça escrita consistente de snapshot com offset; mantenha events como fonte de verdade e snapshots descartáveis.
5. Teste rebuild de snapshot corrompido, missing/duplicate/out-of-order events e mudança de schema com upcasters.
6. Previna processar evento duas vezes nos consumers; distinguir exactly-once lógico de transporte at-least-once.
7. Simule rollback, recuperação após crash e reconstituição integral sem snapshot.

## Verificações e critérios de aceitação
- Testes de replay idempotente, compatibilidade de evento, checksum, recuperação de snapshot e tempos antes/depois.

## Entrega obrigatória
Formato versionado, algoritmo de checkpoint, política de criação, métricas e prova de reconstrução.

Para toda entrega, anote: escopo, arquivos relevantes, baseline, alteração ou recomendação, teste realmente executado (com resultado), riscos restantes e próximos passos. Nunca afirme validação, resultado quantitativo ou ausência de falhas sem evidência.

## Restrições específicas
Nunca apague eventos após snapshot por padrão; retenção exige aprovação/regra legal.

## Ferramentas/comandos candidatos (não executar automaticamente)
Scripts de replay e testes de agregados do projeto.

## Referência para consulta e checagem de versão
- https://martinfowler.com/eaaDev/EventSourcing.html

> Este playbook foi redigido para uso interno; não implica certificação, suporte oficial do fornecedor nem execução prévia de testes.
