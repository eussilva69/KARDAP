# Remover página Pedidos dos painéis

## Objetivo
Remover a interface operacional de pedidos dos painéis, mantendo dados, APIs, integrações e regras compartilhadas disponíveis ao PDV.

## Tarefas
- [x] Remover o item Pedidos da navegação e a rota do painel do lojista. → Verificar ausência de `/dashboard/pedidos` no roteador e menus.
- [x] Remover o componente operacional da página e atalhos residuais. → Verificar que nenhuma UI dos painéis aponta para a rota removida.
- [x] Preservar métricas, APIs, banco, billing e integrações do PDV/marketplaces. → Verificar que nenhum módulo de servidor ou integração foi alterado.
- [x] Executar TypeScript, lint e build. → Verificar compilação sem regressões.

## Pronto quando
- [x] Não existe acesso à página Pedidos nos painéis administrativo e do lojista.
- [x] PDV, delivery, iFood, 99Food, Keeta e dados existentes permanecem intactos.

## Notas
- Indicadores e relatórios de leitura continuam disponíveis; somente o gerenciamento operacional sai do painel.
