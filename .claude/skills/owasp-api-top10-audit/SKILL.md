---
name: owasp-api-top10-audit
description: Auditoria defensiva das categorias OWASP API Security Top 10 em APIs autorizadas.
---

# owasp-api-top10-audit

## Quando ativar
Quando revisar autenticação/autorização, APIs públicas, multi-tenancy e endpoints sensíveis.

## Resultado e limites
Esta skill transforma uma tarefa pontual em um procedimento reproduzível. Não determina a stack nem concede acesso a serviços; comece identificando o que está implementado, permissões e ambiente. Evite executar o workflow se ele não for aplicável ao repositório.

## Preparação mínima
1. Ler `CONTEXTO_PROJETO.md` e a seção necessária de `AI_RULES.md` quando disponíveis; validar informações contra o código.
2. Inspecionar `git status` sem sobrescrever modificações existentes e mapear fluxo, dependências, risco e comando de teste real.
3. Distinguir: confirmado no código, observado por teste, hipótese, não verificável. Registrar baseline antes de editar.
4. Ações destrutivas, produção, compras/custos externos, migrações irreversíveis e leitura de dados sensíveis exigem autorização explícita.

## Protocolo de execução
1. Confirme autorização de teste e ambiente isolado; obtenha inventário de rotas, verbos, auth middleware, dados e papéis.
2. Mapeie cada endpoint para objeto, dono, tenant, ação e campo sensível; verifique decisões de autorização no servidor.
3. Crie testes controlados de acesso cruzado BOLA/IDOR, permissões por função, mass assignment, autenticação e consumo de recursos.
4. Verifique validação de input, SSRF indireto, CORS/CSRF conforme arquitetura, rate limiting e erros que revelam infraestrutura.
5. Examine fluxo de pagamento/webhook, idempotência, redirects, logs, caches e endpoints não documentados.
6. Reproduza achados somente com contas e dados de teste, sem persistir dados de terceiros; documente request/response saneados.
7. Corrija controles na camada certa, rode testes positivos/negativos e preserve integrações.
8. Distingua cobertura estática, dinâmica em staging e itens não testados.

## Verificações e critérios de aceitação
- Matriz endpoint x ameaça, testes de autorização por tenant/papel, evidências redigidas, correções e reteste.

## Entrega obrigatória
Achados por gravidade com cenário, patch e risco residual. Não declarar auditoria completa se ambiente não permite testes.

Para toda entrega, anote: escopo, arquivos relevantes, baseline, alteração ou recomendação, teste realmente executado (com resultado), riscos restantes e próximos passos. Nunca afirme validação, resultado quantitativo ou ausência de falhas sem evidência.

## Restrições específicas
Somente teste defensivo autorizado. Não executar exploração massiva, evasão de WAF ou brute force em produção.

## Ferramentas/comandos candidatos (não executar automaticamente)
pytest/Playwright/API integration tests; OWASP ZAP em staging se autorizado.

## Referência para consulta e checagem de versão
- https://owasp.org/API-Security/editions/2023/en/0x11-t10/

> Este playbook foi redigido para uso interno; não implica certificação, suporte oficial do fornecedor nem execução prévia de testes.
