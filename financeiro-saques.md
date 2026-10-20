# Financeiro e saques

## Goal
Implementar o ciclo auditável de vendas Mercado Pago, liberação individual em 15 dias e saques solicitados pelo dono.

## Tasks
- [x] Corrigir o modelo financeiro para registrar confirmação, liquidação e liberação individual.
- [x] Criar rotas Owner e Admin com autorização separada e transações atômicas.
- [x] Conectar o webhook Mercado Pago e rotina protegida de liberação.
- [x] Adicionar a página Financeiro ao painel do restaurante e a ação de saque integral.
- [x] Validar regras puras, lint e tipos.

## Done When
- [x] Nenhum cliente manipula saldo, saque ou data de liberação.
- [x] Saques duplicados e antecipados são rejeitados pelo backend.
