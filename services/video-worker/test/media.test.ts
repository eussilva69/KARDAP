import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { before, describe, test } from "node:test";
import { reductionPercent } from "../src/contract.ts";
import { DARK_FRAME_LUMA, encode, hasFastStart, makeThumbnail, MediaError, planFor, probe, run, targetSize, validateOutput, type EncodeSettings } from "../src/media.ts";
import * as fx from "./fixtures.ts";

const settings: EncodeSettings = { crf: 25, preset: "medium", audioBitrate: "96k", maxBitrate: "4M" };
let ffmpeg = false;
before(async () => {
  ffmpeg = await fx.hasFfmpeg();
});

/** Converte, valida e gera miniatura como o worker faz. */
async function process(input: string, name: string) {
  const work = await fx.workDir(name);
  const source = await probe(fx.tools, input);
  const plan = planFor(source);
  const out = join(work, "out.mp4");
  await encode(fx.tools, input, out, plan, settings);
  const checked = await validateOutput(fx.tools, out, source, { width: plan.width, height: plan.height });
  const outProbe = await probe(fx.tools, out);
  const thumb = await makeThumbnail(fx.tools, input, join(work, "thumb.webp"), plan, source.duration, (n) => join(work, n));
  const thumbSize = (await stat(join(work, "thumb.webp"))).size;
  return { source, plan, checked, outProbe, thumb, thumbSize, out };
}

describe("dimensões de saída", () => {
  test("cabe em 720p sem ampliar e mantém a proporção", () => {
    assert.deepEqual(targetSize(1920, 1080), { width: 1280, height: 720 });
    assert.deepEqual(targetSize(1080, 1920), { width: 720, height: 1280 });
    assert.deepEqual(targetSize(640, 360), { width: 640, height: 360 });
    assert.deepEqual(targetSize(3840, 1600), { width: 1280, height: 532 });
    assert.deepEqual(targetSize(853, 480), { width: 852, height: 480 });
  });
});

describe("FFmpeg real", { skip: false }, () => {
  test("horizontal 1080p60 com áudio → H.264 1280×720, até 30 fps, AAC, faststart", async (t) => {
    if (!ffmpeg) return t.skip("ffmpeg indisponível");
    const r = await process(await fx.landscape1080p60(), "landscape");
    assert.equal(r.plan.strategy, "transcode");
    assert.equal(r.plan.capFps, true);
    assert.deepEqual([r.checked.width, r.checked.height], [1280, 720]);
    assert.ok(r.outProbe.video!.fps <= 30.01, `fps ${r.outProbe.video!.fps}`);
    assert.equal(r.outProbe.audio?.codec, "aac");
    assert.equal(await hasFastStart(r.out), true);
    assert.ok(r.thumbSize > 0 && r.thumbSize < 150_000, `miniatura ${r.thumbSize} bytes`);
  });

  test("celular com rotação de 90° → sai em pé (720×1280) sem metadado de rotação", async (t) => {
    if (!ffmpeg) return t.skip("ffmpeg indisponível");
    const r = await process(await fx.phoneRotatedMov(), "rotated");
    assert.equal(r.source.video!.rotation % 180, 90, `rotação lida ${r.source.video!.rotation}`);
    assert.deepEqual([r.source.video!.displayWidth, r.source.video!.displayHeight], [1080, 1920]);
    assert.ok(r.plan.reasons.some((x) => x.startsWith("rotação")));
    assert.deepEqual([r.outProbe.video!.width, r.outProbe.video!.height], [720, 1280]);
    assert.equal(r.outProbe.video!.rotation, 0);
    assert.deepEqual([r.thumb.width, r.thumb.height], [404, 720]);
  });

  test("já otimizado (H.264 720p, bitrate baixo, sem áudio) → só remonta, sem recomprimir", async (t) => {
    if (!ffmpeg) return t.skip("ffmpeg indisponível");
    const input = await fx.optimized720NoAudio();
    const r = await process(input, "optimized");
    assert.equal(r.plan.strategy, "remux", `motivos: ${r.plan.reasons.join(", ")}`);
    assert.equal(r.outProbe.audio, null);
    assert.equal(await hasFastStart(r.out), true);
    const original = (await stat(input)).size;
    assert.ok(Math.abs(r.checked.size - original) / original < 0.05, "remontagem não muda o tamanho de forma relevante");
  });

  test("HEVC (iPhone) → convertido para H.264", async (t) => {
    if (!ffmpeg) return t.skip("ffmpeg indisponível");
    if (!(await fx.hasEncoder("libx265"))) return t.skip("libx265 indisponível para gerar o arquivo de teste");
    const r = await process(await fx.hevc720(), "hevc");
    assert.equal(r.source.video!.codec, "hevc");
    assert.equal(r.plan.strategy, "transcode");
    assert.equal(r.outProbe.video!.codec, "h264");
  });

  test("WebM 640×360 → MP4 640×360 (nunca amplia)", async (t) => {
    if (!ffmpeg) return t.skip("ffmpeg indisponível");
    const r = await process(await fx.small360Webm(), "webm");
    assert.equal(r.source.container, "webm");
    assert.deepEqual([r.checked.width, r.checked.height], [640, 360]);
  });

  test("abertura preta → miniatura de um quadro claro", async (t) => {
    if (!ffmpeg) return t.skip("ffmpeg indisponível");
    const r = await process(await fx.blackStart(), "black");
    assert.ok(r.thumb.luma >= DARK_FRAME_LUMA, `brilho ${r.thumb.luma}`);
    assert.ok(r.thumb.at >= 1, `escolheu ${r.thumb.at} s`);
  });

  const rejects = async (input: Promise<string>, code: MediaError["code"]) => {
    const file = await input;
    await assert.rejects(async () => planFor(await probe(fx.tools, file)), (e: unknown) => e instanceof MediaError && e.code === code);
  };
  test("texto com extensão .mp4 → invalid_file", async (t) => {
    if (!ffmpeg) return t.skip("ffmpeg indisponível");
    await rejects(fx.notAVideo(), "invalid_file");
  });
  test("MP4 cortado no meio (envio interrompido) → invalid_file", async (t) => {
    if (!ffmpeg) return t.skip("ffmpeg indisponível");
    await rejects(fx.truncated(), "invalid_file");
  });
  test("só áudio → no_video_stream", async (t) => {
    if (!ffmpeg) return t.skip("ffmpeg indisponível");
    await rejects(fx.audioOnly(), "no_video_stream");
  });
  test("125 s → too_long", async (t) => {
    if (!ffmpeg) return t.skip("ffmpeg indisponível");
    await rejects(fx.tooLong(), "too_long");
  });

  test("vídeos reais de comida do projeto: redução medida e qualidade preservada", async (t) => {
    if (!ffmpeg) return t.skip("ffmpeg indisponível");
    for (const name of ["pizzavideo.mp4", "hamburguer.mp4", "carne tabua.mp4"] as const) {
      const input = await fx.realFood(name);
      const r = await process(input, name.replace(/\W/g, "-"));
      const original = (await stat(input)).size;
      // SSIM do resultado contra o original reduzido ao mesmo tamanho (1 = idêntico).
      const ssim = await run(fx.tools.ffmpeg, ["-hide_banner", "-nostdin", "-i", r.out, "-i", input, "-lavfi", `[1:v]scale=${r.checked.width}:${r.checked.height}:flags=lanczos,setsar=1[ref];[0:v][ref]ssim`, "-f", "null", "-"], 300_000);
      const score = Number(/All:([\d.]+)/.exec(ssim.stderr)?.[1] ?? 0);
      t.diagnostic(
        `${name}: ${r.source.video!.displayWidth}×${r.source.video!.displayHeight} ${r.source.video!.codec} ${r.source.video!.fps.toFixed(0)} fps → ${r.checked.width}×${r.checked.height} (${r.plan.strategy}); ` +
          `${(original / 1048576).toFixed(2)} MB → ${(r.checked.size / 1048576).toFixed(2)} MB (${reductionPercent(original, r.checked.size)}% menor); SSIM ${score.toFixed(4)}; miniatura ${(r.thumbSize / 1024).toFixed(0)} KB`,
      );
      assert.ok(score >= 0.95, `SSIM ${score} abaixo de 0,95 em ${name}`);
    }
  });
});
