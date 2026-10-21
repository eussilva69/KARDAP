# Base global inteligente de cidades e bairros

## Objetivo
Centralizar e reutilizar bairros por código IBGE, com importação incremental segura e integração direta ao editor existente.

## Tarefas
- [x] Auditar fontes, cache atual, regras e persistência de áreas privadas.
- [x] Definir modelo global, normalização, estados, TTL e lease de importação.
- [x] Implementar serviço backend idempotente com batch e reutilização cache-first.
- [x] Integrar endpoint e editor de áreas sem sobrescrever taxas locais.
- [x] Registrar candidatos incrementais validados sem publicação automática insegura.
- [x] Preservar integralmente as regras existentes; consultas atuais não exigem índice composto adicional.
- [x] Testar primeira importação, reutilização, concorrência, incremento e isolamento.
- [x] Validar lint, tipos, testes e build; documentar operação.

## Concluído quando
- [x] Segunda loja reutiliza a cidade sem consultar fonte externa.
- [x] Concorrência não dispara importações duplicadas.
- [x] Novos bairros globais aparecem desativados para cada restaurante.
- [x] Taxas e configurações nunca cruzam restaurantes.
