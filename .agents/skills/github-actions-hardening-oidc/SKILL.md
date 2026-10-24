---
name: github-actions-hardening-oidc
description: "Revisar segurança de GitHub Actions com permissions mínimas, OIDC, pinagem de dependências e proteção de supply chain."
---

# github-actions-hardening-oidc

## Quando usar
Workflows GitHub Actions fazem deploy, acessam cloud, usam secrets, publicam pacotes ou recebem PRs externos.

## Informações necessárias
Arquivos .github/workflows, ambientes, atores, eventos, permissões, provedores cloud e secrets atuais.

## Procedimento de execução
1. Liste triggers (`pull_request`, `pull_request_target`, `workflow_run`, `push`, cron), forks e trust boundaries.
2. Defina `permissions: {}` na raiz ou mínimo necessário por job; `id-token: write` apenas no job OIDC com justificativa.
3. Prefira **federated identity/OIDC** com subject/audience restritos a branch, repo, environment e provider; elimine segredos long-lived apenas após teste e aprovação.
4. Use environments protegidos, approvals para produção e concurrency groups seguros para deploys.
5. Fixe ações terceiras em SHAs completos verificados ou policy lockfile disponível, sem inventar SHA; aplique revisão de origem e atualizações controladas.
6. Evite execução de código não confiável em contexto privilegiado: tenha cuidado extra com `pull_request_target`, `workflow_run`, interpolação em `run:` e artefatos/inputs de PR.
7. Faça hardening de cache/artifacts e PR permissions; não exponha `GITHUB_TOKEN` com write em jobs que processam conteúdo não confiável.
8. Verifique política de retenção, logs e monitoramento de supply chain.

## Casos de teste e validação
- Valide YAML/workflow com actionlint ou ferramenta instalada.
- Simule PR de fork sem receber credenciais/deploy privileges.
- Teste OIDC em ambiente staging e verifique claims sem exibir tokens.
- Garanta que branches protegidas e environments restringem deploy.
- Documente ação SHA, origem e processo de atualização.

## Evidências e entregáveis
Matriz eventos×trust×permissões, workflow revisado, evidência de pipeline staging, checklist de segurança.

## Antipadrões e limites
Nunca aumentar escopos só para pipeline passar, nem publicar tokens/claims sensíveis; não executar deploy de produção sem aprovação.


## Regras operacionais transversais
- Primeiro confira se o fluxo realmente existe e se a skill é pertinente. Não introduza tecnologia só para executar o playbook.
- Consulte documentação oficial e versão atual da biblioteca/serviço quando o comportamento for volátil.
- Use somente ambientes e recursos autorizados; produção exige escopo explícito e rollback.
- Preserve mudanças locais, contratos públicos, dados e regras de negócio; não exponha segredos.
- Não declare sucesso com base em intenção. Registre comandos, resultados, evidências e pendências.
- Ao concluir, apresente fatos confirmados, hipótese testável, diff ou plano, validação executada e riscos remanescentes.
