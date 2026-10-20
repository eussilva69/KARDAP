import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateFees, DEFAULT_FINANCIAL_SETTINGS } from "../lib/financial/types.ts";

test("Mercado Pago 5% e KARDAP 2% incidem corretamente sobre R$ 100", () => {
  const result = calculateFees(10_000, DEFAULT_FINANCIAL_SETTINGS, "restaurant-a");
  assert.deepEqual(result, {
    gross_amount_cents: 10_000,
    gateway_fee_cents: 500,
    gateway_fee_percent: 5,
    net_after_gateway_cents: 9_500,
    kardap_fee_cents: 190,
    kardap_fee_percent: 2,
    restaurant_net_cents: 9_310,
  });
});

test("override do restaurante não altera taxas já calculadas para os demais", () => {
  const settings = { ...DEFAULT_FINANCIAL_SETTINGS, restaurant_fee_overrides: { vip: { restaurant_id: "vip", gateway_fee_percent: 4, kardap_fee_percent: 3, updated_at: "", updated_by: "admin" } } };
  assert.equal(calculateFees(10_000, settings, "vip").restaurant_net_cents, 9_312);
  assert.equal(calculateFees(10_000, settings, "normal").restaurant_net_cents, 9_310);
});
