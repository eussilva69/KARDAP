---
name: distributed-load-testing-k6
description: Testes de carga, stress, spike e soak com k6, limites de segurança e métricas de degradação.
---

# distributed-load-testing-k6

## Quando ativar
Quando estimar capacidade, validar SLO, investigar p95/p99 ou antecipar picos de tráfego.

## Resultado e limites
Esta skill transforma uma tarefa pontual em um procedimento reproduzível. Não determina a stack nem concede acesso a serviços; comece identificando o que está implementado, permissões e ambiente. Evite executar o workflow se ele não for aplicável ao repositório.

## Preparação mínima
1. Ler `CONTEXTO_PROJETO.md` e a seção necessária de `AI_RULES.md` quando disponíveis; validar informações contra o código.
2. Inspecionar `git status` sem sobrescrever modificações existentes e mapear fluxo, dependências, risco e comando de teste real.
3. Distinguir: confirmado no código, observado por teste, hipótese, não verificável. Registrar baseline antes de editar.
4. Ações destrutivas, produção, compras/custos externos, migrações irreversíveis e leitura de dados sensíveis exigem autorização explícita.

## Protocolo de execução
1. Confirme ambiente e autorização; jamais dispare carga em produção ou terceiros por padrão.
2. Defina workload realista por jornada e mistura de endpoints, com usuários, ramp-up e dados seguros.
3. Estabeleça objetivos (RPS, taxa de erro, p95, throughput, saturação) e limites de abort para proteger infraestrutura.
4. Faça baseline leve, depois etapas controladas: normal, spike, stress até threshold acordado e soak de duração limitada.
5. Relacione métricas cliente com servidor, banco, filas, rate limit e GC; não interprete 429 intencionais como bugs de aplicação sem contexto.
6. Faça análise de gargalos e teste regressão após uma correção por vez.
7. Documente recursos usados, horas de execução, custo e estado final do ambiente.

## Verificações e critérios de aceitação
- Scripts k6 com thresholds e tags, relatório p50/p95/p99, erro, vazão, saturação, cenário, dados de teste e evidência de interrupção segura.

## Entrega obrigatória
Perfil de carga, capacity estimate com incerteza, curvas de throughput/latência, gargalo e ações priorizadas.

Para toda entrega, anote: escopo, arquivos relevantes, baseline, alteração ou recomendação, teste realmente executado (com resultado), riscos restantes e próximos passos. Nunca afirme validação, resultado quantitativo ou ausência de falhas sem evidência.

## Restrições específicas
Sem autorização não executar tráfego significativo; nunca inserir pagamento real, exclusão ou upload custoso em carga.

## Ferramentas/comandos candidatos (não executar automaticamente)
k6 (se instalado) e métricas de observabilidade existentes.

## Referência para consulta e checagem de versão
- https://grafana.com/docs/k6/latest/

> Este playbook foi redigido para uso interno; não implica certificação, suporte oficial do fornecedor nem execução prévia de testes.
