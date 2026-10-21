# Checkout do delivery ponta a ponta

## Objetivo
Impedir confirmações automáticas e separar preparação, pagamento, revisão, confirmação do cliente e aceite operacional do restaurante.

## Tarefas
- [x] Separar checkout preparado de pedido liberado ao PDV, com ativação idempotente.
- [x] Validar no servidor restaurante, produtos, preços, frete e meios habilitados.
- [x] Estruturar o frontend em carrinho/dados, entrega, pagamento e revisão final.
- [x] Tornar Pix e cartão recuperáveis, idempotentes e processados pelo Mercado Pago no backend.
- [x] Integrar Card Payment Brick sem armazenar dados sensíveis.
- [x] Liberar pagamentos online ao PDV somente após aprovação confirmada.
- [x] Exigir motivo ao recusar e refletir estados operacionais e financeiros no acompanhamento.
- [x] Adicionar testes dos fluxos críticos e executar lint, tipos e build.

## Concluído quando
- [x] Somente “Confirmar e enviar pedido” cria/prepara o checkout.
- [x] Continuar ou selecionar pagamento nunca envia pedido.
- [x] Pedido online não aparece no PDV antes da aprovação.
- [x] Reenvios não duplicam pedido ou cobrança.
- [x] Pagamentos e operação possuem estados independentes e verificáveis.
