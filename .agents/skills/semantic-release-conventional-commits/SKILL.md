---
name: semantic-release-conventional-commits
description: "Introduzir versionamento SemVer e geração de changelog/releases a partir de Conventional Commits, sem publicar versões incorretas."
---

# semantic-release-conventional-commits

## Quando usar
Projeto precisa automatizar tags, versões, changelog, releases e publicar pacotes a partir de Git.

## Informações necessárias
Modelo mono/polyrepo, pacotes, consumidores, versões atuais, changelog, branches protegidas, regras de aprovação.

## Procedimento de execução
1. Confirme se é aplicativo, biblioteca ou monorepo; avalie se versionamento semântico automatizado traz benefício real.
2. Inventarie tags, package versions, histórico de releases e políticas para breaking changes.
3. Defina convenção de commits consistente (feat=minor, fix=patch, BREAKING CHANGE=major, conforme política); documente exceções para 0.x.
4. Escolha semantic-release/Changesets/Release Please conforme ecossistema existente; não instalar por convenção se alternativa já funciona.
5. Separe fase de **dry-run**, geração de changelog, tag assinada quando aplicável, release e publicação de pacote com credenciais escopadas.
6. Proteja branches, evite duas releases concorrentes, confirme unicidade de tag e idempotência de job.
7. Produza notas legíveis sem divulgar segredos; revise migrações, dependências e downgrade/rollback para releases breaking.
8. Prepare gate humano quando releases puderem causar indisponibilidade ou cobrança.

## Casos de teste e validação
- Execute dry-run com commits fictícios/test branch para patch, minor e major.
- Reexecução do mesmo commit não cria tag duplicada.
- Release só dispara na branch/canal autorizado e não para PRs externos.
- Changelog resulta de commits reais e contém link de tag correto.
- Verifique pacotes versionados e consumidores críticos antes da primeira automação.

## Evidências e entregáveis
Política de commits, config de release, pipeline de dry-run, changelog de teste e estratégia de rollback.

## Antipadrões e limites
Não gerar release de produção como teste; não reescrever tags existentes; não dar token de write a PR externo.


## Regras operacionais transversais
- Primeiro confira se o fluxo realmente existe e se a skill é pertinente. Não introduza tecnologia só para executar o playbook.
- Consulte documentação oficial e versão atual da biblioteca/serviço quando o comportamento for volátil.
- Use somente ambientes e recursos autorizados; produção exige escopo explícito e rollback.
- Preserve mudanças locais, contratos públicos, dados e regras de negócio; não exponha segredos.
- Não declare sucesso com base em intenção. Registre comandos, resultados, evidências e pendências.
- Ao concluir, apresente fatos confirmados, hipótese testável, diff ou plano, validação executada e riscos remanescentes.


## Exemplos e Implementações de Produção

### Configuração do Semantic Release (.releaserc.json)
```json
{
  "branches": ["main"],
  "plugins": [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    [
      "@semantic-release/changelog",
      {
        "changelogFile": "CHANGELOG.md"
      }
    ],
    [
      "@semantic-release/npm",
      {
        "npmPublish": false
      }
    ],
    [
      "@semantic-release/git",
      {
        "assets": ["CHANGELOG.md", "package.json"],
        "message": "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}"
      }
    ],
    "@semantic-release/github"
  ]
}
```
