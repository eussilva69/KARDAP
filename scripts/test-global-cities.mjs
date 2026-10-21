import test from "node:test";
import assert from "node:assert/strict";
import { candidateTrust, decideGlobalCityImport, mergeGlobalIntoRestaurant } from "../lib/delivery/global-cities-model.ts";

const now = 1_000_000;

test("primeira utilização adquire a importação", () => {
  assert.equal(decideGlobalCityImport({ exists: false }, now), "import");
});
test("cidade pronta e dentro do TTL é reutilizada", () => {
  assert.equal(decideGlobalCityImport({ exists: true, status: "ready", expiresAt: now + 1 }, now), "reuse");
});

test("lease ativa impede importações concorrentes", () => {
  assert.equal(decideGlobalCityImport({ exists: true, status: "importing", leaseUntil: now + 1 }, now), "wait");
  assert.equal(decideGlobalCityImport({ exists: true, status: "importing", leaseUntil: now - 1 }, now), "import");
});

test("TTL vencido revalida e force ignora cache fresco", () => {
  assert.equal(decideGlobalCityImport({ exists: true, status: "ready", expiresAt: now - 1 }, now), "import");
  assert.equal(decideGlobalCityImport({ exists: true, status: "ready", expiresAt: now + 1 }, now, true), "import");
});

test("fontes confiáveis publicam; Google e manual ficam pendentes", () => {
  assert.deepEqual(candidateTrust("osm"), { active: true, status: "verified" });
  assert.deepEqual(candidateTrust("ibge"), { active: true, status: "verified" });
  assert.deepEqual(candidateTrust("google"), { active: false, status: "pending" });
  assert.deepEqual(candidateTrust("manual"), { active: false, status: "pending" });
});

test("sincronização preserva taxa local e adiciona bairro global desativado", () => {
  const local = { centro: { name: "Centro", feeCents: 500, enabled: true } };
  const result = mergeGlobalIntoRestaurant(local, ["Centro", "Jardim América"]);
  assert.equal(result.rows.centro.feeCents, 500);
  assert.equal(result.rows.centro.enabled, true);
  assert.deepEqual(result.rows["jardim-america"], { name: "Jardim América", feeCents: null, enabled: false });
  assert.equal(result.added, 1);
});

test("configurações de restaurantes continuam isoladas", () => {
  const a = mergeGlobalIntoRestaurant({ centro: { name: "Centro", feeCents: 500, enabled: true } }, ["Novo Bairro"]).rows;
  const b = mergeGlobalIntoRestaurant({ centro: { name: "Centro", feeCents: 1000, enabled: true } }, ["Novo Bairro"]).rows;
  a.centro.feeCents = 700;
  assert.equal(b.centro.feeCents, 1000);
  assert.equal(a["novo-bairro"].enabled, false);
  assert.equal(b["novo-bairro"].enabled, false);
});
