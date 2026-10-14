// Testes das regras puras de planos (lib/billing/plans.ts): direitos por plano e situação, personalizações,
// planos antigos, franquia de pedidos, período mensal no fuso de São Paulo e papéis da equipe.
// Uso: node scripts/test-billing.mjs   (Node 22.18+ ou 24: lê o TypeScript direto, sem compilar)
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PLAN_CATALOG,
  orderQuota,
  resolveEntitlements,
  roleAllows,
  tablesAllowed,
  usagePeriod,
  isNativeSource,
  isExternalSource,
} from "../lib/billing/plans.ts";

const NOW = Date.parse("2026-10-14T15:00:00Z");
const DAY = 86_400_000;
const at = (offsetDays) => new Date(NOW + offsetDays * DAY).toISOString();

test("catálogo: preços e limites oficiais", () => {
  assert.equal(PLAN_CATALOG.start.priceInCents, 4990);
  assert.equal(PLAN_CATALOG.pro.priceInCents, 12990);
  assert.equal(PLAN_CATALOG.business.priceInCents, 19990);
  assert.equal(PLAN_CATALOG.enterprise.priceInCents, null);
  assert.deepEqual(PLAN_CATALOG.start.limits, { maxTables: 8, maxNativeOrdersPerMonth: 0 });
  assert.deepEqual(PLAN_CATALOG.pro.limits, { maxTables: null, maxNativeOrdersPerMonth: 150 });
  assert.deepEqual(PLAN_CATALOG.business.limits, { maxTables: null, maxNativeOrdersPerMonth: 500 });
  assert.deepEqual(PLAN_CATALOG.enterprise.limits, { maxTables: null, maxNativeOrdersPerMonth: null });
  assert.equal(PLAN_CATALOG.start.features.pdvAccess, false);
  assert.equal(PLAN_CATALOG.pro.features.pdvAccess, true);
  assert.equal(PLAN_CATALOG.business.popular, true);
  assert.equal(PLAN_CATALOG.enterprise.salesOnly, true);
});

test("Start ativo: 8 mesas, sem PDV, nenhum pedido próprio", () => {
  const e = resolveEntitlements({ planId: "start", planVersion: 2, status: "active", currentPeriodEnd: at(20) }, { now: NOW });
  assert.equal(e.valid, true);
  assert.equal(e.features.pdvAccess, false);
  assert.equal(e.limits.maxTables, 8);
  assert.equal(tablesAllowed(e, 7), true);
  assert.equal(tablesAllowed(e, 8), false);
  assert.equal(orderQuota(0, e.limits.maxNativeOrdersPerMonth).blocked, true);
});

test("Pro e Business: PDV e franquias de 150 e 500", () => {
  const pro = resolveEntitlements({ planId: "pro", planVersion: 2, status: "active" }, { now: NOW });
  const business = resolveEntitlements({ planId: "business", planVersion: 2, status: "active" }, { now: NOW });
  assert.equal(pro.features.pdvAccess && business.features.pdvAccess, true);
  assert.equal(orderQuota(149, pro.limits.maxNativeOrdersPerMonth).blocked, false);
  assert.equal(orderQuota(150, pro.limits.maxNativeOrdersPerMonth).blocked, true);
  assert.equal(orderQuota(499, business.limits.maxNativeOrdersPerMonth).blocked, false);
  assert.equal(orderQuota(500, business.limits.maxNativeOrdersPerMonth).blocked, true);
  assert.equal(tablesAllowed(business, 10_000), true);
  assert.equal(pro.features.promotions, false);
  assert.equal(business.features.marketplaceIntegrations, true);
});

test("Enterprise: limites e recursos do contrato", () => {
  const unlimited = resolveEntitlements({ planId: "enterprise", planVersion: 2, status: "active" }, { now: NOW });
  assert.equal(unlimited.limits.maxNativeOrdersPerMonth, null);
  assert.equal(orderQuota(1_000_000, null).blocked, false);
  const custom = resolveEntitlements(
    { planId: "enterprise", planVersion: 2, status: "active", customLimits: { maxNativeOrdersPerMonth: 2000, maxTables: 40 }, customFeatures: { multiUnit: true } },
    { now: NOW },
  );
  assert.equal(custom.limits.maxNativeOrdersPerMonth, 2000);
  assert.equal(custom.limits.maxTables, 40);
  assert.equal(custom.features.multiUnit, true);
  const bad = resolveEntitlements({ planId: "enterprise", planVersion: 2, status: "active", customLimits: { maxTables: -3 } }, { now: NOW });
  assert.equal(bad.limits.maxTables, null, "limite inválido não vale");
});

test("situações: teste, carência, cancelada, expirada, suspensa", () => {
  const created = at(-5);
  const implicit = resolveEntitlements(null, { createdAt: created, now: NOW });
  assert.equal(implicit.implicitTrial, true);
  assert.equal(implicit.planId, "pro");
  assert.equal(implicit.valid, true);
  assert.equal(implicit.features.pdvAccess, true);
  const ended = resolveEntitlements(null, { createdAt: at(-16), now: NOW });
  assert.equal(ended.valid, false);
  assert.equal(ended.reason, "trial_ended");
  assert.equal(ended.features.pdvAccess, false);
  assert.equal(ended.limits.maxNativeOrdersPerMonth, 0);
  assert.equal(ended.contracted.features.pdvAccess, true, "mostra o que volta ao assinar");

  assert.equal(resolveEntitlements({ planId: "pro", planVersion: 2, status: "past_due", lateSince: at(-2) }, { now: NOW }).valid, true);
  assert.equal(resolveEntitlements({ planId: "pro", planVersion: 2, status: "past_due", lateSince: at(-4) }, { now: NOW }).reason, "grace_over");
  assert.equal(resolveEntitlements({ planId: "pro", planVersion: 2, status: "canceled", currentPeriodEnd: at(3) }, { now: NOW }).valid, true);
  assert.equal(resolveEntitlements({ planId: "pro", planVersion: 2, status: "canceled", currentPeriodEnd: at(-1) }, { now: NOW }).reason, "period_over");
  assert.equal(resolveEntitlements({ planId: "pro", planVersion: 2, status: "expired" }, { now: NOW }).valid, false);
  assert.equal(resolveEntitlements({ planId: "pro", planVersion: 2, status: "active" }, { now: NOW, restaurantStatus: "suspended" }).reason, "suspended");
  assert.equal(resolveEntitlements({ planId: "business", planVersion: 2, status: "active", cancelAtPeriodEnd: true, currentPeriodEnd: at(-1) }, { now: NOW }).valid, false);
});

test("planos antigos: Essencial vira Start com as 30 mesas contratadas; status antigos convertidos", () => {
  const essencial = resolveEntitlements({ planId: "essencial", status: "active", priceCents: 4900 }, { now: NOW });
  assert.equal(essencial.planId, "start");
  assert.equal(essencial.legacy, true);
  assert.equal(essencial.limits.maxTables, 30);
  assert.equal(essencial.priceInCents, 4900, "mantém o preço pago");
  const oldPro = resolveEntitlements({ planId: "pro", status: "late", lateSince: at(-1) }, { now: NOW });
  assert.equal(oldPro.status, "past_due");
  assert.equal(oldPro.legacy, true);
  assert.equal(oldPro.valid, true);
  // Estorno/chargeback gravavam "inactive": não devolve o teste grátis.
  const refunded = resolveEntitlements({ planId: "pro", status: "inactive" }, { createdAt: at(-1), now: NOW });
  assert.equal(refunded.status, "expired");
  assert.equal(refunded.valid, false);
});

test("franquia: avisos aos 70%, 90% e 100%", () => {
  assert.equal(orderQuota(104, 150).level, "ok");
  assert.equal(orderQuota(105, 150).level, "warn70");
  assert.equal(orderQuota(135, 150).level, "warn90");
  assert.equal(orderQuota(150, 150).level, "full");
  assert.equal(orderQuota(160, 150).remaining, 0);
  assert.equal(orderQuota(140, 500).remaining, 360, "upgrade preserva o consumo");
  assert.equal(orderQuota(0, 0).level, "unavailable");
});

test("período mensal no fuso de São Paulo (virada do mês)", () => {
  // 31/10 às 23:30 em São Paulo = 01/11 02:30 UTC: ainda é outubro.
  assert.equal(usagePeriod(Date.parse("2026-11-01T02:30:00Z")).periodId, "2026-10");
  assert.equal(usagePeriod(Date.parse("2026-11-01T03:00:00Z")).periodId, "2026-11");
  const october = usagePeriod(Date.parse("2026-10-14T12:00:00Z"));
  assert.deepEqual(october, { periodId: "2026-10", start: "2026-10-01T03:00:00.000Z", end: "2026-11-01T03:00:00.000Z" });
  assert.equal(usagePeriod(Date.parse("2026-12-31T23:59:00Z")).end, "2027-01-01T03:00:00.000Z");
  assert.equal(usagePeriod(Date.parse("2027-01-01T02:59:59Z")).periodId, "2026-12");
});

test("origem: próprios × marketplaces", () => {
  for (const s of ["kardap_pdv", "kardap_table", "kardap_delivery", "kardap_pickup", "kardap_staff"]) assert.equal(isNativeSource(s), true, s);
  for (const s of ["ifood", "99food", "external_marketplace"]) {
    assert.equal(isNativeSource(s), false, s);
    assert.equal(isExternalSource(s), true, s);
  }
  assert.equal(isNativeSource("qualquer"), false);
});

test("papéis: PDV não dá acesso a finanças, assinatura ou configurações", () => {
  const cashier = { isOwner: false, role: "member", permissions: ["pdv"], active: true };
  assert.equal(roleAllows(cashier, "pdvAccess"), true);
  assert.equal(roleAllows(cashier, "orderManagement"), true);
  assert.equal(roleAllows(cashier, "financialManagement"), false);
  assert.equal(roleAllows(cashier, "billing"), false);
  assert.equal(roleAllows(cashier, "settings"), false);
  assert.equal(roleAllows({ ...cashier, active: false }, "pdvAccess"), false);
  assert.equal(roleAllows({ isOwner: true }, "billing"), true);
  assert.equal(roleAllows({ isOwner: false, permissions: ["*"] }, "financialManagement"), true);
  assert.equal(roleAllows(null, "pdvAccess"), false);
});
