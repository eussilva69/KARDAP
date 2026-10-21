# Base global de cidades e bairros

## Estrutura

```text
global_cities/{ibgeCode}
  name, state, ibgeCode
  status: pending | importing | ready | failed
  partial, neighborhoodCount
  lastSyncedAt, expiresAt
  importToken, importLeaseUntil, importAttempts

global_cities/{ibgeCode}/neighborhoods/{slug}
  name, normalizedName
  source, sources[]
  status: verified | pending
  active
  createdAt, lastSeenAt
```

O código IBGE é a identidade canônica. A coleção global contém somente geografia; taxas e ativação permanecem em `restaurantes/{restaurantId}/delivery_areas/{ibgeCode}`.

## Fluxo

1. O painel solicita uma cidade pelo código IBGE.
2. O backend consulta `global_cities` antes de qualquer fonte externa.
3. Cidade `ready` dentro do TTL de 30 dias é reutilizada.
4. Ausência ou expiração tenta adquirir uma lease transacional de 45 segundos.
5. Apenas o detentor da lease consulta OSM e IBGE.
6. Bairros são gravados em batches idempotentes; a cidade termina como `ready` ou `failed`.
7. Um documento legado `geo_cache/bairros_{ibgeCode}` é migrado automaticamente na primeira leitura.

Uma base expirada ainda é devolvida imediatamente e revalidada em segundo plano. Importação parcial permanece marcada com `partial: true`.

## Confiança e atualização incremental

- OSM/IBGE: bairro `verified` e globalmente ativo.
- Google/manual: candidato `pending` e inativo.
- Uma confirmação posterior por OSM/IBGE promove o mesmo documento normalizado.
- Ao abrir uma cidade já configurada, novos bairros globais são acrescentados desativados, sem taxa e sem sobrescrever registros locais.
- Checkout registra candidato somente quando utilizou taxa padrão para um bairro ainda não configurado, evitando uma escrita em todo pedido.

## Segurança e custo

- A implementação não altera as regras existentes do Firestore. Importações e atualizações do catálogo são executadas pelo backend com o Admin SDK.
- A API aplica rate limit e valida o código contra a lista canônica do IBGE.
- Nenhuma taxa, cliente, pedido ou configuração comercial entra na base global.
- O navegador não chama mais Overpass diretamente.
- A lista nacional nunca é baixada; somente a cidade selecionada é consultada.

## Operação

```powershell
npm run seed:neighborhoods
npm run seed:neighborhoods:list
npm run seed:neighborhoods:force
npm run test:global-cities
```
