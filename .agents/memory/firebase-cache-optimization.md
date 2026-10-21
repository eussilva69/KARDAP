# Otimização Firebase e cache

- Adotar implantação incremental por domínio, preservando o tempo real do PDV.
- Persistir em IndexedDB somente catálogo, categorias e configurações não sensíveis.
- Pedidos, clientes, pagamentos, saldos e financeiro ficam fora do cache persistente e nunca são fonte de verdade local.
- Isolar toda chave de cache por usuário e `restaurantId`; invalidar dados privados no logout ou troca de conta.
- Medir chamadas/listeners/documentos processados com instrumentação local reproduzível quando métricas do Console não estiverem disponíveis.
- Preferir mecanismos oficiais do Firestore e infraestrutura compartilhada existente, sem biblioteca de cache adicional.
