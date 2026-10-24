---
name: incident-postmortem-rca
description: Postmortem técnico sem culpabilização com linha do tempo, impacto e causas sistêmicas.
---

# incident-postmortem-rca

## Quando ativar
Quando incidentes afetam disponibilidade, integridade, segurança ou experiência do usuário.

## Resultado e limites
Esta skill transforma uma tarefa pontual em um procedimento reproduzível. Não determina a stack nem concede acesso a serviços; comece identificando o que está implementado, permissões e ambiente. Evite executar o workflow se ele não for aplicável ao repositório.

## Preparação mínima
1. Ler `CONTEXTO_PROJETO.md` e a seção necessária de `AI_RULES.md` quando disponíveis; validar informações contra o código.
2. Inspecionar `git status` sem sobrescrever modificações existentes e mapear fluxo, dependências, risco e comando de teste real.
3. Distinguir: confirmado no código, observado por teste, hipótese, não verificável. Registrar baseline antes de editar.
4. Ações destrutivas, produção, compras/custos externos, migrações irreversíveis e leitura de dados sensíveis exigem autorização explícita.

## Protocolo de execução
1. Defina janela temporal, clientes afetados, SLI/SLO degradados e evidências originais.
2. Reconstrua timeline com timestamps e timezone: detecção, triagem, mitigação, resolução e comunicação.
3. Distinga causa imediata, fatores contribuintes, falha de detecção e condições sistêmicas; “erro humano” isolado não explica causa.
4. Use 5 Porquês como investigação, não como prova; confronte com logs, deploy diff, traces e configurações.
5. Quantifique impacto com dados: usuários, requests, duração, erro de pagamento, backlog ou dados afetados.
6. Desenhe ações preventivas verificáveis com owner, prazo, teste, métrica e dependência; distinga mitigação urgente de mudança estrutural.
7. Revise o aprendizado com equipe, valide closure de ações e armazene relatório com redaction de dados sensíveis.

## Verificações e critérios de aceitação
- Timeline verificável, hipóteses etiquetadas, SLO afetado, tickets e evidência de follow-up.

## Entrega obrigatória
Postmortem blameless, cinco principais ações priorizadas, riscos residuais e requisitos de observabilidade.

Para toda entrega, anote: escopo, arquivos relevantes, baseline, alteração ou recomendação, teste realmente executado (com resultado), riscos restantes e próximos passos. Nunca afirme validação, resultado quantitativo ou ausência de falhas sem evidência.

## Restrições específicas
Não inventar duração/causas; tratar incidente de segurança sob fluxo de resposta apropriado.

## Ferramentas/comandos candidatos (não executar automaticamente)
Incident timeline, Grafana/observability, deploy history, issue tracker.

## Referência para consulta e checagem de versão
- https://sre.google/sre-book/postmortem-culture/

> Este playbook foi redigido para uso interno; não implica certificação, suporte oficial do fornecedor nem execução prévia de testes.
