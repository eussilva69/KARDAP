---
name: docker-multi-stage-distroless
description: Hardening e redução de imagens Docker com multi-stage e runtime mínimo sem root.
---

# docker-multi-stage-distroless

## Quando ativar
Quando otimizar deploy de container ou reduzir superfície de ataque e tamanho de imagem.

## Resultado e limites
Esta skill transforma uma tarefa pontual em um procedimento reproduzível. Não determina a stack nem concede acesso a serviços; comece identificando o que está implementado, permissões e ambiente. Evite executar o workflow se ele não for aplicável ao repositório.

## Preparação mínima
1. Ler `CONTEXTO_PROJETO.md` e a seção necessária de `AI_RULES.md` quando disponíveis; validar informações contra o código.
2. Inspecionar `git status` sem sobrescrever modificações existentes e mapear fluxo, dependências, risco e comando de teste real.
3. Distinguir: confirmado no código, observado por teste, hipótese, não verificável. Registrar baseline antes de editar.
4. Ações destrutivas, produção, compras/custos externos, migrações irreversíveis e leitura de dados sensíveis exigem autorização explícita.

## Protocolo de execução
1. Identifique stack, runtime e restrições de compilação; meça tamanho, CVEs reais e start-up antes.
2. Separe build/test/runtime com multi-stage, copie só artefatos necessários e lockfiles verificáveis.
3. Prefira imagens base suportadas, fixadas por digest quando operacionalmente possível; avalie distroless apenas se debugging/exec/CA certs permitem.
4. Execute como usuário não-root, restrinja filesystem/capabilities e cuide de diretórios de escrita e certificados TLS.
5. Use .dockerignore para excluir .env, .git, credenciais, testes e artefatos; não ponha segredos em ARG/ENV persistentes.
6. Faça smoke-test real do container, healthcheck/restart e testes de sinais (SIGTERM), timezone, DNS, recursos e observabilidade.
7. Gere SBOM e scan de imagem quando infraestrutura permite; compare performance/tamanho/vulnerabilidades.

## Verificações e critérios de aceitação
- docker build/run em ambiente disponível, usuário efetivo, scan/SBOM, tamanho antes/depois e regressões de runtime.

## Entrega obrigatória
Dockerfile, .dockerignore, decisão da base, riscos, resultados de teste e plano de rollback.

Para toda entrega, anote: escopo, arquivos relevantes, baseline, alteração ou recomendação, teste realmente executado (com resultado), riscos restantes e próximos passos. Nunca afirme validação, resultado quantitativo ou ausência de falhas sem evidência.

## Restrições específicas
Não exigir distroless em todos os produtos; evitar suprimir shell necessário à operação sem plano.

## Ferramentas/comandos candidatos (não executar automaticamente)
Docker buildx, Trivy/Grype, Syft se instalados.

## Referência para consulta e checagem de versão
- https://docs.docker.com/build/building/multi-stage/

> Este playbook foi redigido para uso interno; não implica certificação, suporte oficial do fornecedor nem execução prévia de testes.
