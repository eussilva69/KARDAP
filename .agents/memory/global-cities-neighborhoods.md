# Base global de cidades e bairros

- Usar `global_cities/{ibgeCode}` como catálogo geográfico compartilhado; configurações e taxas continuam privadas por restaurante.
- OSM e IBGE são fontes persistíveis primárias; Google serve para validar endereço/município e descobrir candidatos.
- Bairros confirmados por OSM/IBGE podem ficar ativos; entradas manuais ou descobertas apenas pelo Google ficam pendentes até confirmação confiável.
- Cidade pronta é reutilizada imediatamente e revalidada em segundo plano após TTL de 30 dias.
- Escrita global somente pelo backend Admin SDK, com importação idempotente, lease de concorrência e estados pending/importing/ready/failed.
- Novos bairros globais nunca ativam entrega nem sobrescrevem taxas locais automaticamente.
