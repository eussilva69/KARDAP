// Testes da decisão de taxa de entrega e do reconhecimento de bairros (módulos puros, sem Firebase nem rede).
// Uso: npm run test:delivery-areas
import assert from "node:assert/strict";
import { test } from "node:test";
import { findServedCity, matchNeighborhood, neighborhoodKey, resolveDeliveryFee } from "../lib/delivery/match.ts";
import { slugifyNeighborhood } from "../lib/delivery/types.ts";

const rows = (list) => Object.fromEntries(list.map(([name, feeCents, enabled = true]) => [slugifyNeighborhood(name), { name, feeCents, enabled }]));

const CAMPINAS = { ibgeCode: "3509502", name: "Campinas", uf: "SP" };
const VALINHOS = { ibgeCode: "3556206", name: "Valinhos", uf: "SP" };
const AREA = {
  neighborhoods: rows([
    ["Cambuí", 800],
    ["Jardim América", 1000],
    ["Nossa Senhora Aparecida", 1200],
    ["Vila Itapura", 900, false],
    ["Jardim Paulista 2", 700],
    ["Taquaral", null],
    ["Jardim Bela Vista", 500],
    ["Parque Bela Vista", 600],
  ]),
};
const base = {
  deliveryFeeCents: 650,
  feeMode: "taxa_por_bairro",
  servedCities: [CAMPINAS, VALINHOS],
  defaultNeighborhoodFeeCents: null,
  serveUnlistedNeighborhoods: false,
};
const fee = (config, address, area = AREA) => resolveDeliveryFee({ ...base, ...config }, { city: "Campinas", uf: "SP", ...address }, area, slugifyNeighborhood);

test("chave normalizada trata abreviações, acentos e numerais romanos", () => {
  assert.equal(neighborhoodKey("Jd. América"), neighborhoodKey("Jardim America"));
  assert.equal(neighborhoodKey("N. Sra. Aparecida"), neighborhoodKey("Nossa Senhora Aparecida"));
  assert.equal(neighborhoodKey("Vl. Mariana"), neighborhoodKey("Vila Mariana"));
  assert.equal(neighborhoodKey("Jardim Paulista II"), neighborhoodKey("Jardim Paulista 2"));
  assert.equal(neighborhoodKey("Bairro Centro"), neighborhoodKey("Centro"));
  assert.equal(neighborhoodKey("Parque do Estado"), neighborhoodKey("Pq. Estado"));
});

test("identifica o bairro mesmo com grafia diferente", () => {
  const n = AREA.neighborhoods;
  assert.equal(matchNeighborhood(n, "Cambuí", slugifyNeighborhood)?.matchType, "exact");
  assert.equal(matchNeighborhood(n, "cambui", slugifyNeighborhood)?.entry.name, "Cambuí");
  assert.equal(matchNeighborhood(n, "Jd. América", slugifyNeighborhood)?.entry.name, "Jardim América");
  assert.equal(matchNeighborhood(n, "N. Sra. Aparecida", slugifyNeighborhood)?.entry.name, "Nossa Senhora Aparecida");
  assert.equal(matchNeighborhood(n, "Jardim Paulista II", slugifyNeighborhood)?.entry.name, "Jardim Paulista 2");
  assert.equal(matchNeighborhood(n, "Taquarall", slugifyNeighborhood)?.matchType, "similar");
  assert.equal(matchNeighborhood(n, "Americas", slugifyNeighborhood), null, "não confunde bairros diferentes");
});

test("nome ambíguo não é adivinhado", () => {
  assert.equal(matchNeighborhood(AREA.neighborhoods, "Bela Vista", slugifyNeighborhood), null);
  assert.equal(matchNeighborhood(AREA.neighborhoods, "Jd Bela Vista", slugifyNeighborhood)?.entry.feeCents, 500);
});

test("taxa por bairro: cada bairro com seu valor", () => {
  assert.deepEqual([fee({}, { district: "Cambuí" }).feeCents, fee({}, { district: "Jd America" }).feeCents], [800, 1000]);
  const r = fee({}, { district: "Jd. América" });
  assert.equal(r.matched, true);
  assert.equal(r.neighborhoodName, "Jardim América");
  assert.equal(r.cityIbgeCode, "3509502");
});

test("bairro desativado bloqueia a entrega (nos dois modos)", () => {
  const r = fee({}, { district: "Vila Itapura" });
  assert.equal(r.matched, false);
  assert.match(r.reason, /Vila Itapura/);
  assert.equal(fee({ feeMode: "taxa_fixa" }, { district: "Vl Itapura" }).matched, false);
});

test("cidade pausada bloqueia; outras cidades seguem atendidas", () => {
  const paused = { servedCities: [{ ...CAMPINAS, enabled: false }, VALINHOS] };
  assert.equal(fee(paused, { district: "Cambuí" }).matched, false);
  assert.match(fee(paused, { district: "Cambuí" }).reason, /pausadas/);
  assert.equal(fee({ ...paused, feeMode: "taxa_fixa" }, { city: "Valinhos", district: "Centro" }, null).feeCents, 650);
});

test("fora da área: outra cidade, mesma cidade em outra UF, bairro não cadastrado", () => {
  assert.equal(fee({}, { city: "Sumaré", district: "Centro" }).matched, false);
  assert.equal(fee({}, { city: "Campinas", uf: "MS", district: "Cambuí" }).matched, false);
  const r = fee({}, { district: "Bairro Inexistente" });
  assert.equal(r.matched, false);
  assert.match(r.reason, /bairro/);
});

test("cidade pelo código IBGE vence diferença de grafia", () => {
  assert.equal(findServedCity([CAMPINAS], { city: "Campinas (SP)", ibgeCode: "3509502" })?.name, "Campinas");
  assert.equal(findServedCity([CAMPINAS], { city: "campinas", uf: "sp" })?.ibgeCode, "3509502");
});

test("taxa padrão: bairros sem valor e bairros fora da lista (só com autorização)", () => {
  assert.equal(fee({}, { district: "Taquaral" }).matched, false, "sem taxa padrão, bairro sem valor não é atendido");
  const withDefault = fee({ defaultNeighborhoodFeeCents: 1500 }, { district: "Taquaral" });
  assert.equal(withDefault.feeCents, 1500);
  assert.equal(withDefault.usedDefaultFee, true);
  assert.equal(fee({ defaultNeighborhoodFeeCents: 1500 }, { district: "Novo Loteamento" }).matched, false, "fora da lista exige autorização");
  const unlisted = fee({ defaultNeighborhoodFeeCents: 1500, serveUnlistedNeighborhoods: true }, { district: "Novo Loteamento" });
  assert.equal(unlisted.matched, true);
  assert.equal(unlisted.feeCents, 1500);
  assert.equal(fee({ defaultNeighborhoodFeeCents: 1500, serveUnlistedNeighborhoods: true }, { district: "Vila Itapura" }).matched, false, "desativado continua bloqueado");
  assert.equal(fee({ defaultNeighborhoodFeeCents: 0 }, { district: "Taquaral" }).feeCents, 0, "taxa padrão zero = entrega grátis");
});

test("taxa fixa vale para a área toda; sem cidades vale para qualquer endereço", () => {
  assert.equal(fee({ feeMode: "taxa_fixa" }, { district: "Cambuí" }).feeCents, 650);
  assert.equal(fee({ feeMode: "taxa_fixa" }, { district: "" }).matched, true);
  assert.equal(fee({ servedCities: [] }, { city: "Qualquer", district: "" }).feeCents, 650);
});

test("por bairro sem bairro informado pede o bairro", () => {
  const r = fee({}, { district: "  " });
  assert.equal(r.matched, false);
  assert.match(r.reason, /bairro/);
});

test("configurações de restaurantes diferentes não se misturam", () => {
  const a = resolveDeliveryFee({ ...base }, { city: "Campinas", uf: "SP", district: "Cambuí" }, AREA, slugifyNeighborhood);
  const b = resolveDeliveryFee({ ...base, servedCities: [VALINHOS] }, { city: "Campinas", uf: "SP", district: "Cambuí" }, null, slugifyNeighborhood);
  assert.equal(a.matched, true);
  assert.equal(b.matched, false);
});
