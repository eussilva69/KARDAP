/**
 * Processamento de um evento "arquivo finalizado" do Storage, do download à publicação.
 *
 * Idempotência: cada tentativa reivindica o vídeo numa transação (status + geração do arquivo +
 * prazo de posse). Entregas repetidas do mesmo evento são ignoradas; um evento que chega enquanto
 * outra instância processa volta para a fila (503) e só é retomado se o prazo vencer.
 * Os arquivos de saída têm caminho fixo por vídeo, então refazer uma tentativa não duplica nada.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseManagedPath,
  parseOriginalPath,
  reductionPercent,
  VIDEO_FORMATS,
  VIDEO_LIMITS,
  videoPaths,
  type OriginalRef,
  type ProductVideoDoc,
  type PublishedVideo,
  type VideoErrorCode,
  type VideoStrategy,
} from "./contract.ts";
import type { Config } from "./config.ts";
import type { Logger } from "./log.ts";
import { MediaError, type EncodeSettings, type Plan, type Probe, type Thumbnail, type Validation } from "./media.ts";

export type StorageEvent = {
  bucket: string;
  name: string;
  generation: string;
  size: number;
  contentType: string;
  metadata: Record<string, string>;
};

/** Arquivos gerados são imutáveis (caminho novo a cada vídeo): podem ficar em cache por 1 ano. */
export const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

export class NotFoundError extends Error {}

// ───────────────────────── Decisões (funções puras) ─────────────────────────

export type ClaimDecision =
  | { action: "process"; attempts: number }
  | { action: "skip"; reason: "already_ready" | "canceled" | "already_failed" }
  | { action: "busy" }
  | { action: "fail"; code: VideoErrorCode; detail: string };

export function decideClaim(
  doc: Partial<ProductVideoDoc> | null,
  productExists: boolean,
  generation: string,
  now: number,
  maxAttempts: number,
): ClaimDecision {
  if (doc?.status === "ready") return { action: "skip", reason: "already_ready" };
  if (doc?.status === "canceled") return { action: "skip", reason: "canceled" };
  if (doc?.status === "failed" && doc.sourceGeneration === generation) return { action: "skip", reason: "already_failed" };
  if (!productExists) return { action: "fail", code: "product_not_found", detail: "produto inexistente" };
  const sameGeneration = doc?.sourceGeneration === generation;
  if (doc?.status === "processing" && sameGeneration && typeof doc.leaseUntil === "number" && doc.leaseUntil > now) return { action: "busy" };
  const attempts = (sameGeneration ? doc?.attempts ?? 0 : 0) + 1;
  if (attempts > maxAttempts) return { action: "fail", code: "processing_failed", detail: `excedeu ${maxAttempts} tentativas` };
  return { action: "process", attempts };
}

export type PublishDecision =
  | { ok: true; previous: PublishedVideo | null }
  | { ok: false; reason: "canceled" | "lease_lost" | "product_not_found" };

export function decidePublish(
  doc: Partial<ProductVideoDoc> | null,
  product: { video?: PublishedVideo | null } | null,
  videoId: string,
  attemptId: string,
): PublishDecision {
  if (!doc || doc.status === "canceled") return { ok: false, reason: "canceled" };
  if (doc.status !== "processing" || doc.attemptId !== attemptId) return { ok: false, reason: "lease_lost" };
  if (!product) return { ok: false, reason: "product_not_found" };
  const previous = product.video && product.video.id !== videoId ? product.video : null;
  return { ok: true, previous };
}

const PERMANENT: ReadonlySet<string> = new Set(["invalid_file", "unsupported_format", "too_long", "no_video_stream", "too_large", "product_not_found", "quota_exceeded"]);
export const isPermanent = (code: VideoErrorCode) => PERMANENT.has(code);

/** H.264 8 bits em MP4/MOV, sem rotação e com áudio AAC (ou sem áudio): toca em qualquer navegador. */
export function browserSafe(p: Probe) {
  const v = p.video;
  return Boolean(
    v && p.container === "isobmff" && v.codec === "h264" && v.pixFmt === "yuv420p" && v.rotation === 0 && !/high 10|4:2:2|4:4:4/i.test(v.profile) && (!p.audio || p.audio.codec === "aac"),
  );
}

// ───────────────────────── Dependências ─────────────────────────

export type ProcessedVideo = {
  strategy: VideoStrategy;
  optimizedPath: string;
  thumbnailPath: string;
  optimizedUrl: string;
  thumbnailUrl: string;
  originalSize: number;
  optimizedSize: number;
  reductionPercent: number;
  width: number;
  height: number;
  duration: number;
  processingMs: number;
};

export type VideoRepo = {
  /** Transação: lê vídeo e produto, decide (decideClaim) e grava a posse. */
  claim(ref: OriginalRef, event: StorageEvent, attemptId: string, now: number): Promise<ClaimDecision>;
  /** Vídeos criados pelo estabelecimento desde `sinceMs` (cota diária). */
  countSince(restaurantId: string, sinceMs: number): Promise<number>;
  /** Transação: confere a posse (decidePublish) e publica no produto. */
  publish(ref: OriginalRef, attemptId: string, result: ProcessedVideo): Promise<PublishDecision>;
  markRetrying(ref: OriginalRef, attemptId: string, code: VideoErrorCode, detail: string): Promise<void>;
  markFailed(ref: OriginalRef, attemptId: string | null, code: VideoErrorCode, detail: string): Promise<void>;
};

export type BlobStore = {
  download(name: string, generation: string, destination: string): Promise<void>;
  upload(localFile: string, destination: string, options: { contentType: string; cacheControl: string; metadata: Record<string, string> }): Promise<{ url: string }>;
  remove(name: string): Promise<void>;
};

export type MediaOps = {
  probe(file: string): Promise<Probe>;
  plan(probe: Probe): Plan;
  encode(input: string, output: string, plan: Plan, settings: EncodeSettings, strategy: VideoStrategy): Promise<void>;
  validate(file: string, source: Probe, expected: { width: number; height: number }): Promise<Validation>;
  thumbnail(input: string, output: string, plan: Plan, duration: number, tmp: (name: string) => string): Promise<Thumbnail>;
};

export type Deps = {
  config: Config;
  log: Logger;
  repo: VideoRepo;
  blobs: BlobStore;
  media: MediaOps;
  now: () => number;
  newId: () => string;
};

export type Outcome = { status: number; outcome: string };

// ───────────────────────── Processamento ─────────────────────────

export async function handleObjectFinalized(event: StorageEvent, deps: Deps): Promise<Outcome> {
  const ref = parseOriginalPath(event.name);
  // Só originais disparam processamento: otimizados, miniaturas e outros arquivos são ignorados (sem loop).
  if (!ref) return { status: 204, outcome: "ignored_path" };
  if (event.metadata?.kardapGenerated) return { status: 204, outcome: "ignored_generated" };
  if (event.bucket !== deps.config.bucket) return { status: 204, outcome: "ignored_bucket" };

  const log = deps.log.child({ videoId: ref.videoId, restaurantId: ref.restaurantId, productId: ref.productId, generation: event.generation });
  const attemptId = deps.newId();
  const decision = await deps.repo.claim(ref, event, attemptId, deps.now());
  if (decision.action === "skip") {
    log.info("evento ignorado", { reason: decision.reason });
    return { status: 200, outcome: `skip_${decision.reason}` };
  }
  if (decision.action === "busy") {
    log.info("vídeo em processamento por outra instância; evento volta para a fila");
    return { status: 503, outcome: "busy" };
  }
  if (decision.action === "fail") {
    await deps.repo.markFailed(ref, attemptId, decision.code, decision.detail);
    log.warn("vídeo recusado", { code: decision.code, detail: decision.detail });
    return { status: 200, outcome: `failed_${decision.code}` };
  }

  if (event.size > VIDEO_LIMITS.maxBytes) {
    await deps.repo.markFailed(ref, attemptId, "too_large", `${event.size} bytes`);
    return { status: 200, outcome: "failed_too_large" };
  }
  if (VIDEO_FORMATS[ref.ext] !== event.contentType) log.warn("tipo informado difere da extensão; o formato real é conferido pelo ffprobe", { contentType: event.contentType, ext: ref.ext });

  if (deps.config.dailyQuota > 0 && decision.attempts === 1) {
    const count = await deps.repo.countSince(ref.restaurantId, deps.now() - 24 * 3600 * 1000);
    if (count > deps.config.dailyQuota) {
      await deps.repo.markFailed(ref, attemptId, "quota_exceeded", `${count} vídeos em 24 h (limite ${deps.config.dailyQuota})`);
      log.warn("cota diária atingida", { count, quota: deps.config.dailyQuota });
      return { status: 200, outcome: "failed_quota_exceeded" };
    }
  }

  const started = deps.now();
  const work = await mkdtemp(join(tmpdir(), `video-${ref.videoId}-`));
  const at = (name: string) => join(work, name);
  const paths = videoPaths(ref.restaurantId, ref.productId, ref.videoId, ref.ext);
  let uploadedOutputs = false;
  try {
    const input = at(`original.${ref.ext}`);
    await deps.blobs.download(event.name, event.generation, input);

    const source = await deps.media.probe(input);
    const plan = deps.media.plan(source);
    const settings: EncodeSettings = { crf: deps.config.crf, preset: deps.config.preset, audioBitrate: deps.config.audioBitrate, maxBitrate: deps.config.maxBitrate };
    log.info("processando", { strategy: plan.strategy, reasons: plan.reasons, source: { container: source.container, codec: source.video?.codec, width: source.video?.displayWidth, height: source.video?.displayHeight, fps: source.video?.fps, duration: source.duration, rotation: source.video?.rotation, audio: source.audio?.codec ?? null } });

    let output = at("optimized.mp4");
    let strategy: VideoStrategy = plan.strategy;
    await deps.media.encode(input, output, plan, settings, strategy);
    let checked = await deps.media.validate(output, source, { width: plan.width, height: plan.height });

    // Recomprimido ficou maior que o original já compatível? Remonta o original sem perda e fica com o menor.
    if (strategy === "transcode" && checked.size >= event.size && browserSafe(source) && source.video) {
      const keepSize = { width: source.video.displayWidth, height: source.video.displayHeight };
      const alt = at("remux.mp4");
      try {
        await deps.media.encode(input, alt, { ...plan, ...keepSize, strategy: "remux" }, settings, "remux");
        const altChecked = await deps.media.validate(alt, source, keepSize);
        if (altChecked.size < checked.size) {
          log.info("versão recomprimida maior que o original compatível; usando o original remontado", { transcoded: checked.size, remuxed: altChecked.size });
          output = alt;
          checked = altChecked;
          strategy = "remux";
        }
      } catch (error) {
        log.warn("remontagem alternativa falhou; mantendo a recomprimida", { error });
      }
    }

    const thumbFile = at("thumbnail.webp");
    const thumb = await deps.media.thumbnail(input, thumbFile, { ...plan, width: checked.width, height: checked.height }, checked.duration, at);

    const metadata = { kardapGenerated: "1", videoId: ref.videoId, restaurantId: ref.restaurantId, productId: ref.productId };
    const [optimized, thumbnail] = await Promise.all([
      deps.blobs.upload(output, paths.optimized, { contentType: "video/mp4", cacheControl: IMMUTABLE_CACHE, metadata }),
      deps.blobs.upload(thumbFile, paths.thumbnail, { contentType: "image/webp", cacheControl: IMMUTABLE_CACHE, metadata }),
    ]);
    uploadedOutputs = true;

    const result: ProcessedVideo = {
      strategy,
      optimizedPath: paths.optimized,
      thumbnailPath: paths.thumbnail,
      optimizedUrl: optimized.url,
      thumbnailUrl: thumbnail.url,
      originalSize: event.size,
      optimizedSize: checked.size,
      reductionPercent: reductionPercent(event.size, checked.size),
      width: checked.width,
      height: checked.height,
      duration: checked.duration,
      processingMs: deps.now() - started,
    };

    const published = await deps.repo.publish(ref, attemptId, result);
    if (!published.ok) {
      // Outra tentativa com posse válida grava nos mesmos caminhos: não apagar nesse caso.
      if (published.reason !== "lease_lost") {
        await Promise.all([deps.blobs.remove(paths.optimized), deps.blobs.remove(paths.thumbnail)]);
      }
      if (published.reason === "product_not_found") await deps.repo.markFailed(ref, attemptId, "product_not_found", "produto excluído durante o processamento");
      log.info("resultado descartado", { reason: published.reason });
      return { status: 200, outcome: `discarded_${published.reason}` };
    }

    if (published.previous) await removePrevious(published.previous, ref, deps, log);
    if (deps.config.deleteOriginalAfterSuccess) await deps.blobs.remove(event.name);

    log.info("vídeo pronto", {
      strategy,
      originalSize: result.originalSize,
      optimizedSize: result.optimizedSize,
      reductionPercent: result.reductionPercent,
      width: result.width,
      height: result.height,
      duration: result.duration,
      thumbnail: thumb,
      processingMs: result.processingMs,
    });
    return { status: 200, outcome: "ready" };
  } catch (error) {
    const code: VideoErrorCode = error instanceof NotFoundError ? "stale" : error instanceof MediaError ? error.code : "processing_failed";
    const detail = String((error as Error)?.message ?? error).slice(0, 500);
    if (uploadedOutputs) await Promise.allSettled([deps.blobs.remove(paths.optimized), deps.blobs.remove(paths.thumbnail)]);
    if (code === "stale" || isPermanent(code) || decision.attempts >= deps.config.maxAttempts) {
      await deps.repo.markFailed(ref, attemptId, code, detail);
      log.error("falha no processamento", { code, detail, attempts: decision.attempts, final: true });
      return { status: 200, outcome: `failed_${code}` };
    }
    await deps.repo.markRetrying(ref, attemptId, code, detail);
    log.warn("falha temporária; nova tentativa pela fila de eventos", { code, detail, attempts: decision.attempts });
    return { status: 500, outcome: "retrying" };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/** Apaga os arquivos do vídeo anterior do mesmo produto, conferindo que pertencem a ele. */
async function removePrevious(previous: PublishedVideo, ref: OriginalRef, deps: Deps, log: Logger) {
  for (const path of [previous.optimizedPath, previous.thumbnailPath]) {
    const parsed = path ? parseManagedPath(path) : null;
    if (!parsed || parsed.restaurantId !== ref.restaurantId || parsed.productId !== ref.productId || parsed.videoId !== previous.id) {
      log.warn("arquivo do vídeo anterior fora do padrão; mantido", { path });
      continue;
    }
    await deps.blobs.remove(path).catch((error) => log.warn("não foi possível apagar arquivo do vídeo anterior", { path, error }));
  }
}
