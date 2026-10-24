---
name: llm-jailbreak-redteaming
description: Testes adversariais controlados de prompt injection, vazamento e separação de instruções de agentes LLM.
---

# llm-jailbreak-redteaming

## Quando ativar
Quando agentes consomem páginas, repositórios, PDFs, ferramentas ou saídas de RAG não confiáveis.

## Resultado e limites
Esta skill transforma uma tarefa pontual em um procedimento reproduzível. Não determina a stack nem concede acesso a serviços; comece identificando o que está implementado, permissões e ambiente. Evite executar o workflow se ele não for aplicável ao repositório.

## Preparação mínima
1. Ler `CONTEXTO_PROJETO.md` e a seção necessária de `AI_RULES.md` quando disponíveis; validar informações contra o código.
2. Inspecionar `git status` sem sobrescrever modificações existentes e mapear fluxo, dependências, risco e comando de teste real.
3. Distinguir: confirmado no código, observado por teste, hipótese, não verificável. Registrar baseline antes de editar.
4. Ações destrutivas, produção, compras/custos externos, migrações irreversíveis e leitura de dados sensíveis exigem autorização explícita.

## Protocolo de execução
1. Delimite modelo/sistema autorizado, instruções alvo de segurança, dados fictícios, ferramentas e escopo de teste.
2. Construa casos benignos e adversariais por vetor: documento recuperado, resultado de ferramenta, comentário de código, markdown e texto externo.
3. Defina métricas: taxa de obediência a texto não confiável, vazamento de marcadores sintéticos, chamadas de ferramentas indevidas e falsa recusa.
4. Execute payloads inofensivos e não destrutivos, incluindo marcações simuladas de role, base64 de texto benigno e instruções conflitantes sem conteúdo abusivo.
5. Verifique isolamento de ferramentas, permissões, confirmação humana de ações irreversíveis e sanitização de outputs.
6. Corrija via boundaries de confiança, validação de plano de ação e políticas de ferramentas; não dependa só de prompt “ignore ataques”.
7. Rode suíte de regressão com modelos/versões fixados; reporte failures e incertezas.

## Verificações e critérios de aceitação
- Dataset red team de baixo risco, transcripts minimizados, resultado por vetor, correção, reprodução e regressão.

## Entrega obrigatória
Matriz vetor x falha x controle, casos de regressão e risco residual em ferramentas externas.

Para toda entrega, anote: escopo, arquivos relevantes, baseline, alteração ou recomendação, teste realmente executado (com resultado), riscos restantes e próximos passos. Nunca afirme validação, resultado quantitativo ou ausência de falhas sem evidência.

## Restrições específicas
Nunca use credenciais reais, extraia prompts confidenciais de terceiros ou automatize exfiltração.

## Ferramentas/comandos candidatos (não executar automaticamente)
Harness de testes de prompts local ou framework já adotado.

## Referência para consulta e checagem de versão
- https://owasp.org/www-project-top-10-for-large-language-model-applications/

> Este playbook foi redigido para uso interno; não implica certificação, suporte oficial do fornecedor nem execução prévia de testes.
