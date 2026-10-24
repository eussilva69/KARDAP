---
name: dependency-security-remediation
description: Triagem e correção de dependências vulneráveis baseada em exposição real, sem atualizar tudo cegamente.
---

# dependency-security-remediation

## Quando ativar
Quando alertas de CVE/advisories, lockfiles desatualizados, supply chain ou atualizações de segurança aparecerem.

## Resultado e limites
Esta skill transforma uma tarefa pontual em um procedimento reproduzível. Não determina a stack nem concede acesso a serviços; comece identificando o que está implementado, permissões e ambiente. Evite executar o workflow se ele não for aplicável ao repositório.

## Preparação mínima
1. Ler `CONTEXTO_PROJETO.md` e a seção necessária de `AI_RULES.md` quando disponíveis; validar informações contra o código.
2. Inspecionar `git status` sem sobrescrever modificações existentes e mapear fluxo, dependências, risco e comando de teste real.
3. Distinguir: confirmado no código, observado por teste, hipótese, não verificável. Registrar baseline antes de editar.
4. Ações destrutivas, produção, compras/custos externos, migrações irreversíveis e leitura de dados sensíveis exigem autorização explícita.

## Protocolo de execução
1. Identifique ecossistema, lockfile, versões resolvidas, ambiente e dependências transitivas.
2. Classifique cada advisory por explorabilidade, reachability, severidade, exposição em runtime/build e possibilidade de mitigação.
3. Consulte advisory oficial, changelog e breaking changes; prefira patch de menor risco, overrides temporários documentados ou mitigação de configuração.
4. Atualize em branch isolada, sem regenerar lockfile inteiro sem motivo; não execute scripts de pacote não confiáveis em ambiente privilegiado.
5. Rode testes funcionais, security audit e build; verifique mudança de APIs, bundles e licenças.
6. Se vulnerabilidade não puder ser corrigida, documente aceitação temporária, responsável, prazo e controles compensatórios.
7. Reavalie advisories sem supor que zero alertas significa ausência de riscos.

## Verificações e critérios de aceitação
- Comandos do gerenciador realmente usado; diff do lockfile; evidência do advisory resolvido; smoke-test de rotas afetadas.
- Reinspecione CI e dependências transitivas.

## Entrega obrigatória
Inventário CVE/componente/impacto; versão corrigida; testes; riscos residuais; registro de exceções.

Para toda entrega, anote: escopo, arquivos relevantes, baseline, alteração ou recomendação, teste realmente executado (com resultado), riscos restantes e próximos passos. Nunca afirme validação, resultado quantitativo ou ausência de falhas sem evidência.

## Restrições específicas
Nunca publique secretos ao relatar scanner; evite auto-upgrade major massivo.

## Ferramentas/comandos candidatos (não executar automaticamente)
npm audit; pip-audit; cargo audit; osv-scanner onde instalados.

## Referência para consulta e checagem de versão
- https://osv.dev/

> Este playbook foi redigido para uso interno; não implica certificação, suporte oficial do fornecedor nem execução prévia de testes.


## Exemplos e Implementações de Produção

### 1. Resolução Forçada de Vulnerabilidades em Dependências Transitivas
#### package.json (npm / pnpm / yarn)
```json
{
  "dependencies": {
    "express": "^4.21.0"
  },
  "overrides": {
    "send": ">=0.19.0",
    "cookie": ">=0.7.0"
  },
  "pnpm": {
    "overrides": {
      "send": ">=0.19.0"
    }
  }
}
```

### 2. Script de Auditoria e Triage Automatizada de CVEs no CI
```bash
# Executa auditoria quebrando apenas em vulnerabilidades High ou Critical
npm audit --audit-level=high

# Se houver falsos positivos ou correções inviáveis no curto prazo, documente em .nsprc ou audit-ci.json
```
