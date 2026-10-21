# Otimização de leituras, escritas e cache do Firebase

## Objetivo
Reduzir leituras e escritas do Firestore e tornar a navegação cache-first sem persistir dados sensíveis nem comprometer o PDV.

## Tarefas
- [x] Mapear consultas, listeners, recargas completas e escritas redundantes; registrar baseline estático.
- [x] Definir política de cache, TTL, isolamento e invalidação por domínio.
- [x] Configurar persistência oficial do Firestore com fallback seguro e limpeza no logout.
- [x] Criar cache SWR compartilhado por usuário/restaurante e deduplicar requisições/listeners.
- [x] Migrar catálogo, configurações, painel, delivery e PDV incrementalmente.
- [x] Aplicar paginação, patches otimistas, debounce e escrita condicional onde comprovado.
- [x] Adicionar instrumentação e testes de isolamento, TTL, deduplicação e rollback.
- [x] Validar tipos, lint, segurança, fluxos críticos e build; produzir relatório comparativo.

## Concluído quando
- [x] Navegação repetida exibe dados não sensíveis imediatamente sem nova carga completa.
- [x] Pedidos ativos preservam atualização em tempo real com um listener compartilhado.
- [x] Logout/troca de restaurante não reutiliza dados privados de outro contexto.
- [x] Relatório apresenta baseline, resultado e limitações da medição.
