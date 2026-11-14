---
name: double-entry-accounting-ledger
description: "Projetar e validar livro-razão de partidas dobradas para pagamentos, saldos, estornos e conciliação; usar quando dinheiro muda de titularidade."
---

# double-entry-accounting-ledger

## Quando usar
Há carteiras, saldos de contas, pagamentos, transferências, taxas ou reembolsos sujeitos a concorrência.

## Informações necessárias
Modelo atual de contas/transações, moedas, PSP, invariantes de negócio, política de estorno e requisitos de auditoria.

## Procedimento de execução
1. Trace o **fluxo de fundos** e separe intenção do pagamento, autorização, captura, liquidação, estorno e lançamento contábil.
2. Defina contas com moeda explícita e tipo (ativo, passivo, receita, despesa, compensação). Use valor inteiro em unidade mínima, não float.
3. Crie `journal_entries` imutáveis com `posting_lines` de conta, direção e montante positivo; imponha **somatório de débitos = somatório de créditos** e uma moeda por entrada (ou registro de câmbio explícito).
4. Faça gravação de todas as linhas e lançamento da mesma operação em **uma transação ACID**, com constraints/locks conforme o banco. A regra de balanço entre várias linhas pode exigir trigger deferred ou transação que só publica o lançamento quando equilibrado.
5. Crie chave de idempotência única por `(tenant, tipo_operacao, chave)` e associe também um hash estável dos parâmetros; mesmo token com payload diferente deve ser rejeitado.
6. Implemente correção por **lançamento reverso** e não por edição/exclusão de histórico; concilie somas por account_id/tenant/currency periodicamente.
7. Planeje migração compatível de saldo legado com comparações pré e pós, reconciliação e aprovação antes de modificar dados financeiros.
8. Documente ledger imutável, materialized balances como projeção, read model e isolamento de concorrência para impedir saldo negativo quando o produto não permite.

## Casos de teste e validação
- Duas solicitações com a mesma chave geram um único lançamento e devolvem resultado consistente; chave com payload divergente falha.
- Falha entre escrita das linhas faz rollback integral.
- Débito e crédito sempre totalizam zero; montantes negativos/sem moeda são rejeitados.
- Estorno parcial, taxas, arredondamentos e múltiplas moedas respeitam invariantes.
- Corridas concorrentes não geram double spend; verifique isolamento e locking.
- Saldos de projeção reproduzem journal entries; desacordo é investigado sem alteração manual.

## Evidências e entregáveis
Diagrama contábil, migration/DDL revisável, testes de concorrência e reconciliação, lista de mudanças autorizadas e rollback.

## Antipadrões e limites
NÃO gerar lançamentos em teste com dinheiro real; NÃO armazenar cartões; NÃO tratar conformidade PCI como obtida por testes de código.

## Exemplo/nota técnica
Exemplo SQL conceitual (PostgreSQL; a checagem cross-row deve acontecer no fechamento transacional):
```sql
CREATE TABLE ledger_entry (
  id uuid PRIMARY KEY,
  operation_key text NOT NULL UNIQUE,
  currency char(3) NOT NULL,
  posted_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ledger_line (
  entry_id uuid NOT NULL REFERENCES ledger_entry(id),
  line_no integer NOT NULL,
  account_id uuid NOT NULL,
  side text NOT NULL CHECK (side IN ('debit','credit')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  PRIMARY KEY (entry_id, line_no)
);
-- Não publique a entrada até assegurar que SUM(debit)=SUM(credit).
```
**Não é uma implementação pronta:** falta controle de fechamento, tenancy, permissão e integridade de moeda/conta.


## Regras operacionais transversais
- Primeiro confira se o fluxo realmente existe e se a skill é pertinente. Não introduza tecnologia só para executar o playbook.
- Consulte documentação oficial e versão atual da biblioteca/serviço quando o comportamento for volátil.
- Use somente ambientes e recursos autorizados; produção exige escopo explícito e rollback.
- Preserve mudanças locais, contratos públicos, dados e regras de negócio; não exponha segredos.
- Não declare sucesso com base em intenção. Registre comandos, resultados, evidências e pendências.
- Ao concluir, apresente fatos confirmados, hipótese testável, diff ou plano, validação executada e riscos remanescentes.
