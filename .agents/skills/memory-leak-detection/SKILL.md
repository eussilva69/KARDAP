---
name: memory-leak-detection
description: Rastreamento de vazamento de memória em frontend, serviços, workers e pools de conexões.
---

# memory-leak-detection

## Quando ativar
Quando RSS/heap cresce após GC, abas ficam lentas, há OOM, listeners órfãos ou processos reiniciam.

## Resultado e limites
Esta skill transforma uma tarefa pontual em um procedimento reproduzível. Não determina a stack nem concede acesso a serviços; comece identificando o que está implementado, permissões e ambiente. Evite executar o workflow se ele não for aplicável ao repositório.

## Preparação mínima
1. Ler `CONTEXTO_PROJETO.md` e a seção necessária de `AI_RULES.md` quando disponíveis; validar informações contra o código.
2. Inspecionar `git status` sem sobrescrever modificações existentes e mapear fluxo, dependências, risco e comando de teste real.
3. Distinguir: confirmado no código, observado por teste, hipótese, não verificável. Registrar baseline antes de editar.
4. Ações destrutivas, produção, compras/custos externos, migrações irreversíveis e leitura de dados sensíveis exigem autorização explícita.

## Protocolo de execução
1. Colete linha de base após aquecimento e defina ciclo reproduzível de uso com controle de carga.
2. Diferencie heap, RSS, mmap, cache intencional, leaks nativos, fragmentação e buffers; compare snapshots em momentos equivalentes após GC quando aplicável.
3. Identifique dominators, retaining paths, arrays sem limites, closures, timers, observadores, sockets, detached DOM ou conexões não liberadas.
4. Localize ownership e ciclo de vida; crie teste que repete criar/usar/desmontar componente ou job.
5. Corrija liberação e limites de retenção (dispose/unsubscribe/close/abort), sem ocultar leak forçando GC.
6. Repita séries longas, compare inclinação de memória e comportamento de p95/OOM; considere pools legítimos.
7. Documente condições ambientais, snapshots e possíveis falsos positivos.

## Verificações e critérios de aceitação
- Snapshot/serie de memória antes/depois, ciclo de reprodução, teste automatizado quando viável.
- Registrar se instrumento mede JS heap, RSS ou memória nativa.

## Entrega obrigatória
Reprodução, retaining path, correção, evidências comparáveis e regressões testadas.

Para toda entrega, anote: escopo, arquivos relevantes, baseline, alteração ou recomendação, teste realmente executado (com resultado), riscos restantes e próximos passos. Nunca afirme validação, resultado quantitativo ou ausência de falhas sem evidência.

## Restrições específicas
Não faça heap dump em produção sem autorização: snapshots podem conter credenciais/PII.

## Ferramentas/comandos candidatos (não executar automaticamente)
Chrome Memory, heap snapshots, tracemalloc, pprof, Valgrind/ASan conforme linguagem.

## Referência para consulta e checagem de versão
- https://developer.chrome.com/docs/devtools/memory-problems/

> Este playbook foi redigido para uso interno; não implica certificação, suporte oficial do fornecedor nem execução prévia de testes.
