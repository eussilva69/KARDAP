---
name: secrets-zero-leakage-audit
description: Auditoria de segredos em código, histórico e logs, com plano de rotação e sem expor os valores.
---

# secrets-zero-leakage-audit

## Quando ativar
Quando preparar release, examinar repositórios públicos ou lidar com possível vazamento de credenciais.

## Resultado e limites
Esta skill transforma uma tarefa pontual em um procedimento reproduzível. Não determina a stack nem concede acesso a serviços; comece identificando o que está implementado, permissões e ambiente. Evite executar o workflow se ele não for aplicável ao repositório.

## Preparação mínima
1. Ler `CONTEXTO_PROJETO.md` e a seção necessária de `AI_RULES.md` quando disponíveis; validar informações contra o código.
2. Inspecionar `git status` sem sobrescrever modificações existentes e mapear fluxo, dependências, risco e comando de teste real.
3. Distinguir: confirmado no código, observado por teste, hipótese, não verificável. Registrar baseline antes de editar.
4. Ações destrutivas, produção, compras/custos externos, migrações irreversíveis e leitura de dados sensíveis exigem autorização explícita.

## Protocolo de execução
1. Confirme escopo e permissão para examinar histórico; evite enviar dados confidenciais a scanners externos.
2. Inventarie arquivos .env, configurações, histórico Git, CI, logs, Docker layers e artefatos, diferenciando public keys de credenciais privadas.
3. Execute scanner local confiável com redaction; analise somente fingerprints/metadados e valide manualmente falsos positivos.
4. Classifique exposição: commit público/privado, validade de token, privilégios, ambiente, data e possibilidade de abuso.
5. Priorize revogação/rotação junto ao responsável antes de reescrever histórico; remova referência ativa e substitua por secrets manager/env seguro.
6. Para histórico, proponha limpeza apenas com autorização e plano de coordenação; limpar Git não desfaz cópias já clonadas.
7. Reexecute scanners e teste aplicações sem logar segredos, confirmando política de CI e .gitignore.

## Verificações e critérios de aceitação
- Contagem por tipo, caminhos, status (sem valores), datas, plano de rotação, scanner versionado e verificação pós-correção.

## Entrega obrigatória
Relatório saneado, plano de resposta, patches, provas de ausência em paths verificados e limitações.

Para toda entrega, anote: escopo, arquivos relevantes, baseline, alteração ou recomendação, teste realmente executado (com resultado), riscos restantes e próximos passos. Nunca afirme validação, resultado quantitativo ou ausência de falhas sem evidência.

## Restrições específicas
Nunca imprimir segredo detectado nem alterar histórico/rotacionar credenciais sem aprovação.

## Ferramentas/comandos candidatos (não executar automaticamente)
Gitleaks, trufflehog ou equivalente local aprovado.

## Referência para consulta e checagem de versão
- https://github.com/gitleaks/gitleaks

> Este playbook foi redigido para uso interno; não implica certificação, suporte oficial do fornecedor nem execução prévia de testes.


## Exemplos e Implementações de Produção

### Configuração Gitleaks (.gitleaks.toml) & Pre-Commit Hook
```toml
title = "Gitleaks Anti-Leak Configuration"

[extend]
useDefault = true

[allowlist]
description = "Permite variáveis de exemplo e testes mock"
paths = [
  '''\.env\.example''',
  '''tests/mocks/.*''',
]
regexes = [
  '''test-token-.*''',
  '''dummy_key_.*''',
]
```

#### Pre-commit Hook (.husky/pre-commit)
```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

echo "🔍 Verificando segredos com Gitleaks..."
gitleaks protect --staged --verbose --redact
```
