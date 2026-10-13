/**
 * Fluxo completo do worker com FFmpeg real. Firestore e Storage são substituídos por uma
 * implementação em memória que usa as MESMAS funções de decisão (decideClaim/decidePublish)
 * do adaptador real; o que não é coberto aqui é o comportamento do próprio Firebase.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { before, beforeEach, describe, test } from "node:test";
import { videoPaths, type OriginalRef, type ProductVideoDoc, type PublishedVideo } from "../src/contract.ts";
import type { Config } from "../src/config.ts";
import { silentLogger } from "../src/log.ts";
import { encode, makeThumbnail, planFor, probe, validateOutput } from "../src/media.ts";
import { decideClaim, decidePublish, handleObjectFinalized, NotFoundError, type BlobStore, type Deps, type StorageEvent, type VideoRepo } from "../src/pipeline.ts";
import * as fx from "./fixtures.ts";

const R = "rest00000000000000a1";
const P = "prod00000000000000b2";
const config: Config = {
  bucket: "kardap-test.firebasestorage.app",
  port: 0,
  maxAttempts: 3,
  leaseMs: 900_000,
  ffmpegTimeoutMs: 300_000,
  crf: 25,
  preset: "veryfast",
  audioBitrate: "96k",
  maxBitrate: "4M",
  deleteOriginalAfterSuccess: true,
  dailyQuota: 30,
  retentionDays: 7,
  cleanupMaxFiles: 2000,
  ffmpegPath: fx.tools.ffmpeg,
  ffprobePath: fx.tools.ffprobe,
};

type World = {
  videos: Map<string, Partial<ProductVideoDoc>>;
  products: Map<string, Record<string, unknown> & { video?: PublishedVideo | null }>;
  blobs: Map<string, string>; // caminho no bucket → arquivo local
  uploads: string[];
  removed: string[];
  bucketDir: string;
  failDownloads: number;
  beforePublish?: () => void;
};

let world: World;
let clock = 1_000_000;

function makeRepo(w: World): VideoRepo {
  return {
    async claim(ref, ev, attemptId, now) {
      const doc = w.videos.get(ref.videoId) ?? null;
      const d = decideClaim(doc, w.products.has(ref.productId), ev.generation, now, config.maxAttempts);
      if (d.action === "process") w.videos.set(ref.videoId, { ...(doc ?? { productId: ref.productId, originalPath: ev.name, originalSize: ev.size }), status: "processing", attempts: d.attempts, attemptId, sourceGeneration: ev.generation, leaseUntil: now + config.leaseMs });
      return d;
    },
    async countSince() {
      return w.videos.size;
    },
    async publish(ref, attemptId, r) {
      w.beforePublish?.();
      const doc = w.videos.get(ref.videoId) ?? null;
      const product = w.products.get(ref.productId) ?? null;
      const d = decidePublish(doc, product, ref.videoId, attemptId);
      if (!d.ok) return d;
      const video: PublishedVideo = { id: ref.videoId, width: r.width, height: r.height, duration: r.duration, optimizedPath: r.optimizedPath, thumbnailPath: r.thumbnailPath, optimizedSize: r.optimizedSize, originalSize: r.originalSize };
      w.products.set(ref.productId, { ...product, videoUrl: r.optimizedUrl, videoPoster: r.thumbnailUrl, video });
      w.videos.set(ref.videoId, { ...doc, status: "ready", ...r, leaseUntil: undefined });
      if (d.previous) w.videos.set(d.previous.id, { ...w.videos.get(d.previous.id), status: "canceled", supersededBy: ref.videoId });
      return d;
    },
    async markRetrying(ref, attemptId, code, detail) {
      const doc = w.videos.get(ref.videoId);
      if (doc?.attemptId === attemptId && doc.status === "processing") w.videos.set(ref.videoId, { ...doc, status: "retrying", error: code, errorDetail: detail });
    },
    async markFailed(ref, attemptId, code, detail) {
      const doc = w.videos.get(ref.videoId);
      if (doc && (doc.status === "canceled" || doc.status === "ready")) return;
      w.videos.set(ref.videoId, { ...doc, status: "failed", error: code, errorDetail: detail });
    },
  };
}

function makeBlobs(w: World): BlobStore {
  return {
    async download(name, _generation, destination) {
      if (w.failDownloads > 0) {
        w.failDownloads--;
        throw new Error("ECONNRESET simulado no download");
      }
      const local = w.blobs.get(name);
      if (!local) throw new NotFoundError(name);
      await copyFile(local, destination);
    },
    async upload(localFile, destination) {
      const target = join(w.bucketDir, destination);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(localFile, target);
      w.blobs.set(destination, target);
      w.uploads.push(destination);
      return { url: `https://firebasestorage.googleapis.com/v0/b/${config.bucket}/o/${encodeURIComponent(destination)}?alt=media&token=t` };
    },
    async remove(name) {
      w.blobs.delete(name);
      w.removed.push(name);
    },
  };
}

const deps = (): Deps => ({
  config,
  log: silentLogger,
  repo: makeRepo(world),
  blobs: makeBlobs(world),
  media: {
    probe: (f) => probe(fx.tools, f),
    plan: (p) => planFor(p),
    encode: (i, o, plan, s, strategy) => encode(fx.tools, i, o, plan, s, strategy),
    validate: (f, src, exp) => validateOutput(fx.tools, f, src, exp),
    thumbnail: (i, o, plan, d, tmp) => makeThumbnail(fx.tools, i, o, plan, d, tmp),
  },
  now: () => clock,
  newId: () => randomUUID(),
});

/** Coloca um arquivo no "bucket" como o navegador faria e devolve o evento do Storage. */
async function uploadOriginal(file: string, videoId = `vid${randomUUID().replace(/-/g, "").slice(0, 17)}`, ext: OriginalRef["ext"] = "mp4") {
  const path = videoPaths(R, P, videoId, ext).original;
  world.blobs.set(path, file);
  world.videos.set(videoId, { productId: P, status: "uploading", originalPath: path, originalSize: (await stat(file)).size });
  const ev: StorageEvent = { bucket: config.bucket, name: path, generation: "1700000000000001", size: (await stat(file)).size, contentType: "video/mp4", metadata: { uploadedBy: "uid1" } };
  return { videoId, path, ev };
}

let ffmpeg = false;
before(async () => {
  ffmpeg = await fx.hasFfmpeg();
});
beforeEach(async () => {
  world = { videos: new Map(), products: new Map([[P, { name: "Pizza" }]]), blobs: new Map(), uploads: [], removed: [], bucketDir: await fx.workDir("bucket"), failDownloads: 0 };
});

describe("worker: fluxo completo", () => {
  test("envio → otimizado + miniatura → produto publicado → original removido", async (t) => {
    if (!ffmpeg) return t.skip("ffmpeg indisponível");
    const { videoId, path, ev } = await uploadOriginal(await fx.landscape1080p60());
    const out = await handleObjectFinalized(ev, deps());
    assert.deepEqual(out, { status: 200, outcome: "ready" });
    const doc = world.videos.get(videoId)!;
    assert.equal(doc.status, "ready");
    assert.deepEqual([doc.width, doc.height], [1280, 720]);
    assert.equal(doc.reductionPercent, Math.round((1 - doc.optimizedSize! / ev.size) * 1000) / 10);
    const product = world.products.get(P)!;
    assert.match(String(product.videoUrl), /videos%2Foptimized%2F/);
    assert.match(String(product.videoPoster), /thumbnails%2F.*\.webp/);
    assert.equal(product.video?.id, videoId);
    assert.ok(!world.blobs.has(path), "original apagado após validação");
    assert.deepEqual(world.uploads.sort(), [videoPaths(R, P, videoId, "mp4").optimized, videoPaths(R, P, videoId, "mp4").thumbnail].sort());
  });

  test("evento repetido depois de pronto não reprocessa nem duplica arquivos", async (t) => {
    if (!ffmpeg) return t.skip("ffmpeg indisponível");
    const { ev } = await uploadOriginal(await fx.blackStart());
    await handleObjectFinalized(ev, deps());
    const uploads = world.uploads.length;
    const again = await handleObjectFinalized(ev, deps());
    assert.deepEqual(again, { status: 200, outcome: "skip_already_ready" });
    assert.equal(world.uploads.length, uploads);
  });

  test("evento repetido durante o processamento volta para a fila (503)", async () => {
    const { videoId, ev } = await uploadOriginal(await fx.notAVideo());
    world.videos.set(videoId, { ...world.videos.get(videoId), status: "processing", sourceGeneration: ev.generation, leaseUntil: clock + 60_000, attemptId: "outra" });
    assert.deepEqual(await handleObjectFinalized(ev, deps()), { status: 503, outcome: "busy" });
  });

  test("arquivos gerados e caminhos fora do padrão não disparam processamento (sem loop)", async () => {
    const d = deps();
    const base = { bucket: config.bucket, generation: "1", size: 10, contentType: "video/mp4", metadata: {} };
    assert.equal((await handleObjectFinalized({ ...base, name: videoPaths(R, P, "vid0000000001", "mp4").optimized }, d)).outcome, "ignored_path");
    assert.equal((await handleObjectFinalized({ ...base, name: videoPaths(R, P, "vid0000000001", "mp4").thumbnail, contentType: "image/webp" }, d)).outcome, "ignored_path");
    assert.equal((await handleObjectFinalized({ ...base, name: `restaurantes/${R}/produtos/${P}/videos/original/../../x.mp4` }, d)).outcome, "ignored_path");
    assert.equal((await handleObjectFinalized({ ...base, name: videoPaths(R, P, "vid0000000001", "mp4").original, metadata: { kardapGenerated: "1" } }, d)).outcome, "ignored_generated");
    assert.equal((await handleObjectFinalized({ ...base, bucket: "outro-bucket", name: videoPaths(R, P, "vid0000000001", "mp4").original }, d)).outcome, "ignored_bucket");
  });

  test("cancelado durante o processamento → resultado descartado, produto intacto", async (t) => {
    if (!ffmpeg) return t.skip("ffmpeg indisponível");
    const { videoId, ev } = await uploadOriginal(await fx.blackStart());
    world.beforePublish = () => world.videos.set(videoId, { ...world.videos.get(videoId), status: "canceled" });
    const out = await handleObjectFinalized(ev, deps());
    assert.equal(out.outcome, "discarded_canceled");
    assert.equal(world.products.get(P)!.videoUrl, undefined);
    const paths = videoPaths(R, P, videoId, "mp4");
    assert.ok(world.removed.includes(paths.optimized) && world.removed.includes(paths.thumbnail));
  });

  test("produto excluído antes do processamento → failed product_not_found", async () => {
    const { videoId, ev } = await uploadOriginal(await fx.notAVideo());
    world.products.clear();
    assert.equal((await handleObjectFinalized(ev, deps())).outcome, "failed_product_not_found");
    assert.equal(world.videos.get(videoId)!.error, "product_not_found");
  });

  test("falha temporária → retrying (500) e a segunda entrega conclui", async (t) => {
    if (!ffmpeg) return t.skip("ffmpeg indisponível");
    const { videoId, ev } = await uploadOriginal(await fx.blackStart());
    world.failDownloads = 1;
    assert.deepEqual(await handleObjectFinalized(ev, deps()), { status: 500, outcome: "retrying" });
    assert.equal(world.videos.get(videoId)!.status, "retrying");
    assert.deepEqual(await handleObjectFinalized(ev, deps()), { status: 200, outcome: "ready" });
    assert.equal(world.videos.get(videoId)!.attempts, 2);
  });

  test("falha temporária persistente → para em MAX_ATTEMPTS e marca failed", async () => {
    const { videoId, ev } = await uploadOriginal(await fx.notAVideo());
    world.failDownloads = 99;
    const outcomes = [];
    for (let i = 0; i < 4; i++) outcomes.push((await handleObjectFinalized(ev, deps())).outcome);
    assert.deepEqual(outcomes, ["retrying", "retrying", "failed_processing_failed", "skip_already_failed"]);
    assert.equal(world.videos.get(videoId)!.status, "failed");
  });

  test("arquivo inválido → failed permanente, original mantido para análise", async (t) => {
    if (!ffmpeg) return t.skip("ffmpeg indisponível");
    const { videoId, path, ev } = await uploadOriginal(await fx.notAVideo());
    assert.deepEqual(await handleObjectFinalized(ev, deps()), { status: 200, outcome: "failed_invalid_file" });
    assert.equal(world.videos.get(videoId)!.status, "failed");
    assert.ok(world.blobs.has(path), "original não é apagado em falha");
  });

  test("substituição: o vídeo novo entra no ar e os arquivos do anterior são removidos", async (t) => {
    if (!ffmpeg) return t.skip("ffmpeg indisponível");
    const first = await uploadOriginal(await fx.blackStart());
    await handleObjectFinalized(first.ev, deps());
    const second = await uploadOriginal(await fx.small360Webm(), undefined, "webm");
    assert.equal((await handleObjectFinalized({ ...second.ev, contentType: "video/webm" }, deps())).outcome, "ready");
    assert.equal(world.products.get(P)!.video?.id, second.videoId);
    const old = videoPaths(R, P, first.videoId, "mp4");
    assert.ok(world.removed.includes(old.optimized) && world.removed.includes(old.thumbnail));
    assert.equal(world.videos.get(first.videoId)!.status, "canceled");
    assert.equal(world.videos.get(first.videoId)!.supersededBy, second.videoId);
  });

  test("cota diária do estabelecimento", async () => {
    for (let i = 0; i < config.dailyQuota; i++) world.videos.set(`old${i}xxxxxx`, { status: "ready" });
    const { videoId, ev } = await uploadOriginal(await fx.notAVideo());
    assert.equal((await handleObjectFinalized(ev, deps())).outcome, "failed_quota_exceeded");
    assert.equal(world.videos.get(videoId)!.error, "quota_exceeded");
  });

  test("original sumiu antes do download (envio cancelado) → failed stale", async () => {
    const { videoId, path, ev } = await uploadOriginal(await fx.notAVideo());
    world.blobs.delete(path);
    assert.equal((await handleObjectFinalized(ev, deps())).outcome, "failed_stale");
    assert.equal(world.videos.get(videoId)!.status, "failed");
  });
});
