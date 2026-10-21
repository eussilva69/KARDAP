import assert from "node:assert/strict";
import { test } from "node:test";
import { mercadoPagoIdempotencyKey, mercadoPagoStatus, shouldActivateOrder } from "../lib/delivery/checkout-lifecycle.ts";

test("Pix aprovado libera o pedido ao PDV", () => assert.equal(shouldActivateOrder("pix_online", mercadoPagoStatus("approved")), true));
test("Pix pendente ou expirado não libera o pedido", () => {
  assert.equal(shouldActivateOrder("pix_online", mercadoPagoStatus("pending")), false);
  assert.equal(shouldActivateOrder("pix_online", mercadoPagoStatus("cancelled")), false);
});
test("cartão aprovado libera e cartão recusado não libera", () => {
  assert.equal(shouldActivateOrder("cartao_online", mercadoPagoStatus("approved")), true);
  assert.equal(shouldActivateOrder("cartao_online", mercadoPagoStatus("rejected")), false);
});
test("pagamento na entrega libera após a confirmação final", () => {
  assert.equal(shouldActivateOrder("dinheiro", "pendente"), true);
  assert.equal(shouldActivateOrder("cartao_credito", "pendente"), true);
});
test("reenvio usa a mesma chave e outro pedido usa chave diferente", () => {
  assert.equal(mercadoPagoIdempotencyKey("pedido-1", "pix_online"), mercadoPagoIdempotencyKey("pedido-1", "pix_online"));
  assert.notEqual(mercadoPagoIdempotencyKey("pedido-1", "pix_online"), mercadoPagoIdempotencyKey("pedido-2", "pix_online"));
});
test("webhook atrasado preserva estado pendente até a aprovação", () => {
  assert.equal(mercadoPagoStatus("in_process"), "pendente");
  assert.equal(mercadoPagoStatus("approved"), "aprovado");
});
test("estorno e chargeback não reativam pedido", () => {
  assert.equal(shouldActivateOrder("pix_online", mercadoPagoStatus("refunded")), false);
  assert.equal(shouldActivateOrder("cartao_online", mercadoPagoStatus("charged_back")), false);
});
