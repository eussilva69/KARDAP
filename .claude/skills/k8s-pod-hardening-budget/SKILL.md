---
name: k8s-pod-hardening-budget
description: Proteção operacional de pods Kubernetes com PDBs, probes, limites e políticas de segurança.
---

# k8s-pod-hardening-budget

## Quando ativar
Quando projetar ou corrigir Deployment/StatefulSet e disponibilidade sob manutenção/escala.

## Resultado e limites
Esta skill transforma uma tarefa pontual em um procedimento reproduzível. Não determina a stack nem concede acesso a serviços; comece identificando o que está implementado, permissões e ambiente. Evite executar o workflow se ele não for aplicável ao repositório.

## Preparação mínima
1. Ler `CONTEXTO_PROJETO.md` e a seção necessária de `AI_RULES.md` quando disponíveis; validar informações contra o código.
2. Inspecionar `git status` sem sobrescrever modificações existentes e mapear fluxo, dependências, risco e comando de teste real.
3. Distinguir: confirmado no código, observado por teste, hipótese, não verificável. Registrar baseline antes de editar.
4. Ações destrutivas, produção, compras/custos externos, migrações irreversíveis e leitura de dados sensíveis exigem autorização explícita.

## Protocolo de execução
1. Identifique workload, réplicas, criticidade, tolerância a indisponibilidade, autoscaler, cluster e permissões.
2. Especifique readiness (receber tráfego), liveness (recovery) e startup (inicialização lenta) com rotas baratas e thresholds medidos.
3. Configure requests/limits baseada em métricas; cuidado com throttling CPU/OOM por limites arbitrários.
4. Defina PDB coerente com réplicas e drain, sem bloquear manutenção por orçamento impossível.
5. Aplique securityContext (runAsNonRoot, readOnlyRootFilesystem quando compatível, drop caps) e service account mínima.
6. Defina deployment strategy, graceful termination, preStop apenas se necessário e connection draining.
7. Valide manifests em dry-run/staging e simule restart/drain/rollout de forma autorizada; meça disponibilidade.

## Verificações e critérios de aceitação
- Validadores de manifest, testes de rollout controlados, logs saneados e comportamento de probe/PDB; marcar itens não exercitados.

## Entrega obrigatória
Manifests/Helm diff, racional de probes/PDB e evidências de saúde/resiliência.

Para toda entrega, anote: escopo, arquivos relevantes, baseline, alteração ou recomendação, teste realmente executado (com resultado), riscos restantes e próximos passos. Nunca afirme validação, resultado quantitativo ou ausência de falhas sem evidência.

## Restrições específicas
Não aplicar alterações em clusters de produção sem autorização; probes falhas podem criar loop.

## Ferramentas/comandos candidatos (não executar automaticamente)
kubectl diff --server-side; kubectl apply --dry-run=server quando autorizado.

## Referência para consulta e checagem de versão
- https://kubernetes.io/docs/concepts/workloads/pods/disruptions/

> Este playbook foi redigido para uso interno; não implica certificação, suporte oficial do fornecedor nem execução prévia de testes.


## Exemplos e Implementações de Produção

### 1. PodDisruptionBudget (Garante Alta Disponibilidade Durante Drenagens)
```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: api-service-pdb
  namespace: production
spec:
  minAvailable: 2 # Garante que no mínimo 2 réplicas fiquem ativas durante updates de nós
  selector:
    matchLabels:
      app: api-service
```

### 2. Deployment Kubernetes com SecurityContext Hardened (Non-Root)
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-service
  namespace: production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-service
  template:
    metadata:
      labels:
        app: api-service
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 10001
        runAsGroup: 10001
        fsGroup: 10001
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: app
          image: myregistry.com/app:v1.2.0
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop:
                - ALL
          resources:
            requests:
              cpu: "100m"
              memory: "128Mi"
            limits:
              cpu: "500m"
              memory: "512Mi"
          volumeMounts:
            - mountPath: /tmp
              name: temp-dir
      volumes:
        - name: temp-dir
          emptyDir: {}
```
