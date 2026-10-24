---
name: dbt-transformation-pipeline
description: "Construir pipeline dbt testável com fontes, staging, intermediate, marts, catálogo de métricas e data lineage."
---

# dbt-transformation-pipeline

## Quando usar
Projeto usa ou pretende usar dbt para warehouse, analytics e modelos métricos recorrentes.

## Informações necessárias
Warehouse, fontes e schemas, SLA de dados, grão de eventos, PII, métricas e ferramentas de orchestrator.

## Procedimento de execução
1. Confirme viabilidade dbt no projeto, o adapter e warehouse; evite introduzi-lo sem necessidade.
2. Documente `sources` com freshness, owners e campos sensíveis; use staging para normalizar types, timezone, nomenclatura e deduplicação.
3. Defina `intermediate` para regras reutilizáveis e `marts` com fatos/dimensões no grão definido; evite lógica duplicada em dashboards.
4. Para tabelas incrementais, defina unique_key, estratégia de backfill, tratamento de dados atrasados e reprocessamento idempotente.
5. Adicione testes `not_null`, `unique`, `relationships`, `accepted_values` e testes SQL de invariantes próprios; exceções documentadas.
6. Documente modelos, coluna, owner e lineage via docs; métricas devem declarar fórmula, filtros, dimensões e janela de tempo.
7. Garanta acesso mínimo a dados, anonimização quando cabível, controles de PII e ambientes isolados staging/prod.
8. Defina CI com parse/compile/test em schema isolado, alertas de freshness e benchmark/custos de consultas críticas.

## Casos de teste e validação
- `dbt parse` e `dbt compile` concluídos, se a ferramenta estiver disponível.
- `dbt test` executa testes escolhidos contra ambiente de teste; sem warehouse, marque como pendente.
- Duplicatas, chaves órfãs, valores nulos e datas inconsistentes são detectados.
- Marts batem com consultas de referência aprovadas pelo negócio.
- Backfill e execução incremental convergem para o mesmo resultado determinístico.

## Evidências e entregáveis
Estrutura staging/intermediate/marts, schema.yml e docs, testes e relatório de lineage/freshness.

## Antipadrões e limites
Não executar full-refresh em produção sem autorização; não presumir que dados ausentes representam zero; não acessar PII desnecessária.

## Exemplo/nota técnica
Exemplo mínimo de teste YAML (adaptar a versão dbt e naming em uso):
```yaml
models:
  - name: fct_orders
    columns:
      - name: order_id
        data_tests:
          - unique
          - not_null
      - name: customer_id
        data_tests:
          - relationships:
              arguments:
                to: ref('dim_customers')
                field: customer_id
```
A sintaxe de argumentos varia por versão; validar com `dbt parse`.


## Regras operacionais transversais
- Primeiro confira se o fluxo realmente existe e se a skill é pertinente. Não introduza tecnologia só para executar o playbook.
- Consulte documentação oficial e versão atual da biblioteca/serviço quando o comportamento for volátil.
- Use somente ambientes e recursos autorizados; produção exige escopo explícito e rollback.
- Preserve mudanças locais, contratos públicos, dados e regras de negócio; não exponha segredos.
- Não declare sucesso com base em intenção. Registre comandos, resultados, evidências e pendências.
- Ao concluir, apresente fatos confirmados, hipótese testável, diff ou plano, validação executada e riscos remanescentes.
