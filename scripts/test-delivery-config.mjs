import assert from "node:assert/strict";
import { test } from "node:test";
import { centsToInput, parseMoneyCents } from "../lib/format.ts";
import { deliveryReadiness } from "../lib/delivery/readiness.ts";
import { DEFAULT_DELIVERY_CONFIG } from "../lib/delivery/types.ts";

test("valores em dinheiro digitados viram centavos", () => {
  assert.equal(parseMoneyCents("7,50"), 750);
  assert.equal(parseMoneyCents("R$ 5,00"), 500);
  assert.equal(parseMoneyCents("R$ 5.00"), 500);
  assert.equal(parseMoneyCents("1.200,90"), 120090);
  assert.equal(parseMoneyCents("50"), 5000);
  assert.equal(parseMoneyCents("0"), 0);
});

test("campo vazio é null e texto que não é valor é NaN (nunca vira R$ 0,00 sem aviso)", () => {
  assert.equal(parseMoneyCents(""), null);
  assert.equal(parseMoneyCents("   "), null);
  assert.ok(Number.isNaN(parseMoneyCents("1,2,3")));
});

test("centavos voltam ao formato do campo", () => {
  assert.equal(centsToInput(750), "7,50");
  assert.equal(centsToInput(0), "0,00");
  assert.equal(centsToInput(null), "");
});

const config = (patch = {}) => ({ ...DEFAULT_DELIVERY_CONFIG, ...patch });

test("configuração padrão com taxa fixa está pronta para receber pedidos", () => {
  assert.deepEqual(deliveryReadiness(config()), []);
});

test("sem forma de pagamento o checkout não fecha", () => {
  const issues = deliveryReadiness(config({ paymentMethods: [] }));
  assert.equal(issues.length, 1);
  assert.equal(issues[0].area, "payment");
});

test("só pagamento online, sem gateway configurado, também bloqueia", () => {
  assert.equal(deliveryReadiness(config({ paymentMethods: ["pix_online"] }), { onlineMethods: [] })[0]?.area, "payment");
  assert.deepEqual(deliveryReadiness(config({ paymentMethods: ["pix_online"] }), { onlineMethods: ["pix_online"] }), []);
  assert.deepEqual(deliveryReadiness(config({ paymentMethods: ["pix_online", "dinheiro"] }), { onlineMethods: [] }), []);
});

test("taxa por bairro precisa de uma cidade ativa", () => {
  assert.equal(deliveryReadiness(config({ feeMode: "taxa_por_bairro", servedCities: [] }))[0]?.area, "areas");
  const paused = [{ ibgeCode: "3550308", name: "São Paulo", uf: "SP", enabled: false }];
  assert.equal(deliveryReadiness(config({ feeMode: "taxa_por_bairro", servedCities: paused }))[0]?.area, "areas");
  const active = [{ ibgeCode: "3550308", name: "São Paulo", uf: "SP" }];
  assert.deepEqual(deliveryReadiness(config({ feeMode: "taxa_por_bairro", servedCities: active })), []);
});

test("área no mapa precisa da loja e de uma faixa ou área ativa", () => {
  const empty = { storeLocation: null, distanceBands: [], customAreas: [] };
  assert.match(deliveryReadiness(config({ feeMode: "area_mapa", mapConfig: empty }))[0]?.message, /ponto da loja/);
  const noZones = { ...empty, storeLocation: { lat: -23.5, lng: -46.6 } };
  assert.match(deliveryReadiness(config({ feeMode: "area_mapa", mapConfig: noZones }))[0]?.message, /faixa ou área ativa/);
  const ready = { ...noZones, distanceBands: [{ id: "b1", name: "Até 5 km", maxDistanceKm: 5, feeCents: 500, enabled: true }] };
  assert.deepEqual(deliveryReadiness(config({ feeMode: "area_mapa", mapConfig: ready })), []);
});

test("taxa fixa com todas as cidades pausadas não entrega em lugar nenhum", () => {
  const paused = [{ ibgeCode: "3550308", name: "São Paulo", uf: "SP", enabled: false }];
  assert.equal(deliveryReadiness(config({ servedCities: paused }))[0]?.area, "areas");
});
