import test from "node:test";
import assert from "node:assert/strict";
import { haversineKm, resolveMapDeliveryFee, sanitizeMapConfig } from "../lib/delivery/map-areas.ts";

const R = 6371.0088;
const pointAtKm = (km) => ({ lat: 0, lng: km / R * 180 / Math.PI });
const config = {
  storeLocation: { lat: 0, lng: 0 },
  distanceBands: [
    { id: "near", name: "Até 5 km", maxDistanceKm: 5, feeCents: 1000, enabled: true },
    { id: "far", name: "De 5 a 10 km", maxDistanceKm: 10, feeCents: 2000, enabled: true },
  ],
  customAreas: [],
};

test("Haversine calcula a distância sem depender do cliente", () => {
  assert.ok(Math.abs(haversineKm(config.storeLocation, pointAtKm(5)) - 5) < 1e-9);
});

for (const [name, km, expectedId, expectedFee] of [
  ["dentro da primeira faixa", 2, "near", 1000],
  ["exatamente no limite de 5 km", 5, "near", 1000],
  ["entre 5 e 10 km", 7, "far", 2000],
  ["exatamente no limite de 10 km", 10, "far", 2000],
]) test(name, () => {
  const result = resolveMapDeliveryFee(config, pointAtKm(km));
  assert.equal(result.matched, true);
  assert.equal(result.mapAreaId, expectedId);
  assert.equal(result.feeCents, expectedFee);
});

test("fora do maior limite não é atendido", () => {
  assert.equal(resolveMapDeliveryFee(config, pointAtKm(10.01)).matched, false);
});

test("sobreposição escolhe a menor taxa e nunca acumula", () => {
  const result = resolveMapDeliveryFee({
    ...config,
    customAreas: [
      { id: "expensive", name: "Cara", center: pointAtKm(7), radiusKm: 3, feeCents: 1500, enabled: true, color: "#2563eb" },
      { id: "cheap", name: "Barata", center: pointAtKm(7), radiusKm: 3, feeCents: 500, enabled: true, color: "#059669" },
    ],
  }, pointAtKm(7));
  assert.equal(result.mapAreaId, "cheap");
  assert.equal(result.feeCents, 500);
  assert.notEqual(result.feeCents, 2500);
});

test("desativar/excluir/redimensionar áreas muda imediatamente o resultado", () => {
  const area = { id: "only", name: "Única", center: pointAtKm(20), radiusKm: 2, feeCents: 700, enabled: true, color: "#2563eb" };
  assert.equal(resolveMapDeliveryFee({ ...config, distanceBands: [], customAreas: [area] }, pointAtKm(21)).matched, true);
  assert.equal(resolveMapDeliveryFee({ ...config, distanceBands: [], customAreas: [{ ...area, enabled: false }] }, pointAtKm(21)).matched, false);
  assert.equal(resolveMapDeliveryFee({ ...config, distanceBands: [], customAreas: [{ ...area, radiusKm: .5 }] }, pointAtKm(21)).matched, false);
  assert.equal(resolveMapDeliveryFee({ ...config, distanceBands: [], customAreas: [] }, pointAtKm(21)).matched, false);
});

test("sanitização ordena faixas e rejeita coordenadas/valores inválidos", () => {
  const safe = sanitizeMapConfig({ storeLocation: { lat: 91, lng: 0 }, distanceBands: [config.distanceBands[1], config.distanceBands[0], { id: "bad", maxDistanceKm: -1, feeCents: -1 }], customAreas: [] });
  assert.equal(safe.storeLocation, null);
  assert.deepEqual(safe.distanceBands.map((band) => band.id), ["near", "far"]);
});
