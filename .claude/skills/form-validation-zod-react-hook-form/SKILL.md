---
name: form-validation-zod-react-hook-form
description: "Projetar formulários robustos com Zod/React Hook Form quando a stack justificar, validação cliente-servidor e acessibilidade."
---

# form-validation-zod-react-hook-form

## Quando usar
React com formulários complexos, campos condicionais, regras assíncronas, duplicidade e problemas de UX na validação.

## Informações necessárias
Schema/backend, React stack e bibliotecas já instaladas, estados, tipos de dados, fluxos de erro e submissão.

## Procedimento de execução
1. Examine se Zod e React Hook Form já são usados; se não, avalie custo/benefício e preserve soluções adequadas existentes.
2. Defina schema com validação de tipo, formato, limites e campos condicionais; backend valida **novamente** tudo com regras autoritativas.
3. Inputs devem ter label visível, `autocomplete`/`inputMode` apropriado, instruções e associação programática de erros (`aria-describedby`, `aria-invalid`).
4. Use validação após blur ou submit conforme fricção, com debounce apenas em verificações custosas como nome/e-mail disponíveis.
5. Faça cancelamento ou versionamento de requisições assíncronas para impedir resposta antiga de sobrescrever estado atual.
6. Preserve valores e contexto em erro, impeça double submit, anuncie resultado ao leitor de tela e foque primeiro erro quando útil.
7. Modele estados idle/submitting/success/error, timeout/retry e tratamento de falha de conexão.
8. Segurança de persistência: evite gravar CPF, senhas, tokens, documentos e outras PII em storage sem necessidade/autorização.

## Casos de teste e validação
- Campos inválidos mostram erro específico e acionável sem bloquear digitação.
- Seleção de teclado mobile, zoom nativo e navegação TAB/SHIFT-TAB funcionam.
- Screen reader lê labels, erros e status; foco volta corretamente após modais.
- Respostas assíncronas fora de ordem não alteram validação de valor mais recente.
- Falha backend preserva input sem duplicar operação; backend rejeita entrada inválida.
- Validação de formulário complexo não aciona rerenders excessivos em cada tecla.

## Evidências e entregáveis
Schema, componentes acessíveis, provas de integração API, testes de teclado e erro, análise de bundle caso nova dependência.

## Antipadrões e limites
Não tratar `type=number` como escolha automática para documento/telefone, onde zeros à esquerda importam; não remover validação do servidor.


## Regras operacionais transversais
- Primeiro confira se o fluxo realmente existe e se a skill é pertinente. Não introduza tecnologia só para executar o playbook.
- Consulte documentação oficial e versão atual da biblioteca/serviço quando o comportamento for volátil.
- Use somente ambientes e recursos autorizados; produção exige escopo explícito e rollback.
- Preserve mudanças locais, contratos públicos, dados e regras de negócio; não exponha segredos.
- Não declare sucesso com base em intenção. Registre comandos, resultados, evidências e pendências.
- Ao concluir, apresente fatos confirmados, hipótese testável, diff ou plano, validação executada e riscos remanescentes.
