---
name: stripe-webhook-reconciliation
description: "Processar webhooks Stripe e PSPs de forma autenticada, idempotente, resiliente e conciliável; usar quando pagamentos dependem de eventos assíncronos."
---

# stripe-webhook-reconciliation

## Quando usar
A aplicação recebe eventos de PSP, confirma pagamentos, assinaturas, estornos ou chargebacks via webhook.

## Informações necessárias
Versão oficial da API, endpoint, assinatura do webhook, modelo de estado, DB, worker e sandbox de PSP.

## Procedimento de execução
1. Identifique **qual PSP real** é usado; Stripe serve como exemplo, mas cada PSP tem cabeçalhos, assinatura e semantics próprias.
2. Configure endpoint HTTPS; valide assinatura com segredo armazenado no servidor e **bytes brutos** antes de parsear JSON. Rejeite eventos sem assinatura válida e segredos incorretos; trate rotação de segredos.
3. Persista `provider`, `event_id`, `event_type`, `resource_id`, timestamp e status mínimo com **constraint unique (provider,event_id)**. Um event_id repetido não aplica mutação novamente.
4. Responda sucesso logo após persistência durável e delegue processamento a fila (at-least-once). Nunca dependa de ordem de entrega; eventos podem chegar atrasados, duplicados ou reentregues.
5. Worker busca **estado autoritativo** na API do PSP quando necessário; aplica máquina de estados monotônica, valida valor/moeda/recurso e integra idempotência do ledger.
6. Distinga *evento técnico* de *evento de negócio*: eventos diferentes podem representar a mesma transição; idempotência requer também chave da operação de negócio.
7. Retry com backoff+jitter, dead-letter queue, alarmes e reprocessamento seguro de eventos falhos; cuidado com efeitos colaterais (e-mail, provisionamento).
8. Agende conciliação de transações locais contra relatório/API PSP; documente discrepância, chargeback, refund e perda de eventos.

## Casos de teste e validação
- Assinatura ausente/inválida é rejeitada, assinatura válida aceita; payload alterado falha.
- Dois webhooks simultâneos mesmo event_id produzem uma mutação de negócio.
- Sequência desordenada de eventos não regride estado (por exemplo, paid -> pending).
- Falha DB, fila, PSP indisponível e timeout preservam rastreabilidade e permitem retry.
- Replay de evento antigo idêntico não gera novo pagamento/benefício.
- Conciliação detecta transação ausente e diferença de moeda/valor.

## Evidências e entregáveis
Fluxograma webhook→inbox→worker→ledger, testes sandbox, esquema de unicidade, dashboards de DLQ/lag e relatório de conciliação.

## Antipadrões e limites
Nunca usar payload fornecido pelo cliente como status de pagamento; não acionar produção em testes; não armazenar segredos no frontend.

## Exemplo/nota técnica
Pseudofluxo seguro:
```text
POST /webhook (raw_body)
  -> verify_signature(raw_body, headers, secret)
  -> transaction: INSERT INTO webhook_inbox UNIQUE(provider,event_id)
  -> durable_enqueue_or_outbox(event_id)
  -> respond 2xx
worker(event_id)
  -> load inbox + fetch authoritative resource if needed
  -> transaction: validate transition + idempotent business change
  -> retry or dead-letter + alert when necessary
```
A ordem entre commit da inbox e enfileiramento deve ser atômica por outbox, ou ter recuperação explícita.


## Regras operacionais transversais
- Primeiro confira se o fluxo realmente existe e se a skill é pertinente. Não introduza tecnologia só para executar o playbook.
- Consulte documentação oficial e versão atual da biblioteca/serviço quando o comportamento for volátil.
- Use somente ambientes e recursos autorizados; produção exige escopo explícito e rollback.
- Preserve mudanças locais, contratos públicos, dados e regras de negócio; não exponha segredos.
- Não declare sucesso com base em intenção. Registre comandos, resultados, evidências e pendências.
- Ao concluir, apresente fatos confirmados, hipótese testável, diff ou plano, validação executada e riscos remanescentes.
