import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseManagedPath, parseOriginalPath, reductionPercent, videoPaths } from "../src/contract.ts";
import { decideClaim, decidePublish } from "../src/pipeline.ts";
import { parseCloudEvent } from "../src/server.ts";
import { loadConfig } from "../src/config.ts";

const R = "rest00000000000000a1";
const P = "prod00000000000000b2";

describe("caminhos", () => {
  test("monta e reconhece o original", () => {
    const p = videoPaths(R, P, "vid0000000001", "mov");
    assert.equal(p.original, `restaurantes/${R}/produtos/${P}/videos/original/vid0000000001.mov`);
    assert.deepEqual(parseOriginalPath(p.original), { restaurantId: R, productId: P, videoId: "vid0000000001", ext: "mov" });
    assert.equal(parseOriginalPath(p.optimized), null);
    assert.equal(parseManagedPath(p.thumbnail)?.kind, "thumbnail");
  });
  test("recusa manipulação de caminho", () => {
    assert.throws(() => videoPaths("../outro", P, "vid0000000001", "mp4"));
    assert.throws(() => videoPaths(R, P, "a/b", "mp4"));
    assert.equal(parseOriginalPath(`restaurantes/${R}/produtos/${P}/videos/original/vid0000000001.exe`), null);
    assert.equal(parseOriginalPath(`restaurantes/${R}/produtos/videos/legado.mp4`), null);
  });
  test("versões extras: caminho próprio, reconhecidas só em videos/optimized", () => {
    const p = videoPaths(R, P, "vid0000000001", "mp4");
    assert.equal(p.variant("540p"), `restaurantes/${R}/produtos/${P}/videos/optimized/vid0000000001.540p.mp4`);
    assert.deepEqual(parseManagedPath(p.variant("av1")), { restaurantId: R, productId: P, videoId: "vid0000000001", kind: "variant" });
    assert.equal(parseManagedPath(p.optimized)?.kind, "optimized");
    assert.equal(parseOriginalPath(p.variant("360p")), null, "versão não dispara processamento");
    assert.equal(parseManagedPath(`restaurantes/${R}/produtos/${P}/videos/original/vid0000000001.540p.mp4`), null);
    assert.equal(parseManagedPath(`restaurantes/${R}/produtos/${P}/videos/optimized/vid0000000001.1080p.mp4`), null);
  });
  test("VIDEO_VARIANTS: desligado por padrão, só tipos conhecidos", () => {
    const env = { STORAGE_BUCKET: "kardap-test.firebasestorage.app" };
    assert.deepEqual(loadConfig(env).variants, []);
    assert.deepEqual(loadConfig({ ...env, VIDEO_VARIANTS: "540p, 360p,540p" }).variants, ["540p", "360p"]);
    assert.throws(() => loadConfig({ ...env, VIDEO_VARIANTS: "1080p" }), /VIDEO_VARIANTS/);
  });
  test("redução percentual real, inclusive negativa", () => {
    assert.equal(reductionPercent(1000, 380), 62);
    assert.equal(reductionPercent(1000, 1100), -10);
  });
});

describe("decisões de posse e publicação", () => {
  const now = 1_000;
  test("estados terminais e duplicados", () => {
    assert.deepEqual(decideClaim({ status: "ready" }, true, "1", now, 3), { action: "skip", reason: "already_ready" });
    assert.deepEqual(decideClaim({ status: "canceled" }, true, "1", now, 3), { action: "skip", reason: "canceled" });
    assert.deepEqual(decideClaim({ status: "failed", sourceGeneration: "1" }, true, "1", now, 3), { action: "skip", reason: "already_failed" });
    assert.deepEqual(decideClaim({ status: "processing", sourceGeneration: "1", leaseUntil: now + 1 }, true, "1", now, 3), { action: "busy" });
  });
  test("nova geração (reprocessar) zera as tentativas; posse vencida é retomada", () => {
    assert.deepEqual(decideClaim({ status: "failed", sourceGeneration: "1", attempts: 3 }, true, "2", now, 3), { action: "process", attempts: 1 });
    assert.deepEqual(decideClaim({ status: "processing", sourceGeneration: "1", attempts: 1, leaseUntil: now - 1 }, true, "1", now, 3), { action: "process", attempts: 2 });
  });
  test("publica só com a posse atual", () => {
    assert.deepEqual(decidePublish({ status: "processing", attemptId: "b" }, {}, "v", "a"), { ok: false, reason: "lease_lost" });
    assert.deepEqual(decidePublish({ status: "processing", attemptId: "a" }, null, "v", "a"), { ok: false, reason: "product_not_found" });
    const previous = { id: "old", width: 1, height: 1, duration: 1, optimizedPath: "", thumbnailPath: "", optimizedSize: 1, originalSize: 1 };
    assert.deepEqual(decidePublish({ status: "processing", attemptId: "a" }, { video: previous }, "v", "a"), { ok: true, previous });
  });
});

describe("CloudEvent do Eventarc", () => {
  const data = { bucket: "b", name: "restaurantes/x", generation: "17", size: "2048", contentType: "video/mp4", metadata: { a: "1" } };
  test("modo binário", () => {
    const ev = parseCloudEvent({ "ce-type": "google.cloud.storage.object.v1.finalized", "ce-id": "9", "content-type": "application/json" }, JSON.stringify(data));
    assert.equal(ev?.type, "google.cloud.storage.object.v1.finalized");
    assert.equal(ev?.data.size, 2048);
  });
  test("modo estruturado", () => {
    const ev = parseCloudEvent({ "content-type": "application/cloudevents+json" }, JSON.stringify({ type: "t", id: "1", data }));
    assert.equal(ev?.data.name, "restaurantes/x");
  });
  test("corpo inválido", () => {
    assert.equal(parseCloudEvent({}, "não é json"), null);
    assert.equal(parseCloudEvent({}, JSON.stringify({ foo: 1 })), null);
  });
});
