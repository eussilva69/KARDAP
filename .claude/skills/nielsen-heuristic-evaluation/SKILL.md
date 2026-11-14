---
name: nielsen-heuristic-evaluation
description: Auditoria de usabilidade baseada nas 10 heurísticas de Nielsen com severidade e evidência por fluxo.
---

# nielsen-heuristic-evaluation

## Quando ativar
Quando avaliar jornadas, componentes, telas ou uma solicitação explícita de auditoria UX.

## Resultado e limites
Esta skill transforma uma tarefa pontual em um procedimento reproduzível. Não determina a stack nem concede acesso a serviços; comece identificando o que está implementado, permissões e ambiente. Evite executar o workflow se ele não for aplicável ao repositório.

## Preparação mínima
1. Ler `CONTEXTO_PROJETO.md` e a seção necessária de `AI_RULES.md` quando disponíveis; validar informações contra o código.
2. Inspecionar `git status` sem sobrescrever modificações existentes e mapear fluxo, dependências, risco e comando de teste real.
3. Distinguir: confirmado no código, observado por teste, hipótese, não verificável. Registrar baseline antes de editar.
4. Ações destrutivas, produção, compras/custos externos, migrações irreversíveis e leitura de dados sensíveis exigem autorização explícita.

## Protocolo de execução
1. Identifique personas/tarefas verificáveis, páginas existentes, dispositivos e fluxos prioritários.
2. Observe os 10 princípios: status; linguagem do usuário; controle; consistência; prevenção; reconhecimento; eficiência; minimalismo; recuperação; ajuda.
3. Para cada problema capture estado atual, expectativa do usuário, evidência, localização e impacto sobre a tarefa.
4. Classifique severidade por frequência, impacto e persistência (0 sem problema, 1 cosmético, 2 menor, 3 grave, 4 crítico), justificando.
5. Proponha mudança mínima que resolva causa e preserve identidade e regras de negócio; diferencie problemas de preferências visuais.
6. Se permitido, implemente mudanças priorizadas em componentes compartilhados; valide navegação, keyboard, touch, formulários e feedback.
7. Faça segunda passada e relacione achados que ficaram pendentes com limitação de evidência.

## Verificações e critérios de aceitação
- Capturas/screenshots e reprodução quando ferramentas disponíveis; checklist por heurística; acessibilidade automática + teste manual onde possível.

## Entrega obrigatória
Matriz tela/heurística/evidência/severidade/correção/teste; maior impacto e pendências.

Para toda entrega, anote: escopo, arquivos relevantes, baseline, alteração ou recomendação, teste realmente executado (com resultado), riscos restantes e próximos passos. Nunca afirme validação, resultado quantitativo ou ausência de falhas sem evidência.

## Restrições específicas
Não atribua nota a telas inacessíveis; avaliação heurística não equivale a pesquisa com usuários.

## Ferramentas/comandos candidatos (não executar automaticamente)
Browser DevTools, Playwright, axe quando existentes.

## Referência para consulta e checagem de versão
- https://www.nngroup.com/articles/ten-usability-heuristics/

> Este playbook foi redigido para uso interno; não implica certificação, suporte oficial do fornecedor nem execução prévia de testes.


## Exemplos e Implementações de Produção

### Matriz de Avaliação Heurística de Nielsen (Escala 0 a 4)

| Heurística | Pergunta de Verificação | Sintoma de Violação |
|---|---|---|
| **1. Visibilidade do Status** | O usuário sabe o que está acontecendo agora? | Carregamentos sem spinner/skeleton, ações sem toast de confirmação |
| **2. Correspondência com o Mundo Real** | A linguagem usa jargão técnico ou termos do usuário? | Erros técnicos (`500 NullPointerException`), ícones obscuros |
| **3. Controle e Liberdade do Usuário** | Existe saída de emergência ("Desfazer")? | Ações irreversíveis sem confirmação, falta de botão fechar/voltar |
| **4. Consistência e Padrões** | A mesma palavra/ícone significa a mesma coisa em todas as telas? | Botão "Salvar" verde em uma tela e azul em outra |
| **5. Prevenção de Erros** | O design previne que o erro aconteça? | Formatar inputs com máscara (CPF, CEP, telefone) antes do submit |
| **6. Reconhecimento em vez de Memorização** | As instruções e opções estão visíveis? | Formulários multi-etapas que não mostram resumo dos passos anteriores |
| **7. Flexibilidade e Eficiência de Uso** | Usuários experientes têm atalhos? | Falta de atalhos de teclado (Enter para submit, Esc para fechar modal) |
| **8. Estética e Design Minimalista** | Há excesso de informação irrelevante? | Páginas sobrecarregadas com banners conflitantes |
| **9. Auxiliar a Reconhecer e Recuperar de Erros** | As mensagens de erro explicam como resolver? | Mensagens vagas ("Ocorreu um erro"). Prefira ("E-mail já cadastrado. Deseja recuperar a senha?") |
| **10. Ajuda e Documentação** | A documentação é fácil de buscar e focada na tarefa? | Tooltips contextuais em campos complexos |

**Escala de Severidade:**  
- **0:** Apenas cosmético  
- **1:** Problema superficial  
- **2:** Problema menor (baixa frequência)  
- **3:** Problema maior (alta fricção, bloqueia parte dos usuários)  
- **4:** Catástrofe de usabilidade (impede conclusão de compra/tarefa principal)
