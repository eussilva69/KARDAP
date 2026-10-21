/**
 * FFmpeg: análise, plano de conversão, compressão, validação e miniatura.
 * Nada aqui fala com o Firebase: recebe caminhos locais e devolve resultados.
 */
import { spawn } from "node:child_process";
import { open, stat } from "node:fs/promises";
import { VIDEO_LIMITS, type VideoStrategy, type VideoVariantKind } from "./contract.ts";

export class MediaError extends Error {
  code: "invalid_file" | "unsupported_format" | "too_long" | "no_video_stream" | "processing_failed" | "validation_failed";
  constructor(code: MediaError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

// ───────────────────────── Execução ─────────────────────────

export type RunResult = { code: number | null; stdout: string; stderr: string; timedOut: boolean };

/** Executa um binário sem shell (sem risco de injeção), com tempo limite e saída limitada. */
export function run(bin: string, args: string[], timeoutMs: number, captureStdout = false): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ["ignore", captureStdout ? "pipe" : "ignore", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const keep = (current: string, chunk: Buffer, max: number) => (current + chunk.toString("utf8")).slice(-max);
    child.stdout?.on("data", (c: Buffer) => (stdout = keep(stdout, c, 4 * 1024 * 1024)));
    child.stderr?.on("data", (c: Buffer) => (stderr = keep(stderr, c, 64 * 1024)));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr + String(error), timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

export type MediaTools = { ffmpeg: string; ffprobe: string; timeoutMs: number };

// ───────────────────────── Análise ─────────────────────────

export type Probe = {
  formatName: string;
  container: "isobmff" | "webm" | "other";
  duration: number;
  size: number;
  bitRate: number;
  video: null | {
    codec: string;
    profile: string;
    pixFmt: string;
    width: number;
    height: number;
    /** Rotação de exibição em graus (0, 90, 180 ou 270), de metadados de celular. */
    rotation: number;
    fps: number;
    bitRate: number;
    /** Largura e altura como o vídeo aparece na tela (já considerando a rotação). */
    displayWidth: number;
    displayHeight: number;
  };
  audio: null | { codec: string; channels: number };
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function parseRate(rate: unknown) {
  if (typeof rate !== "string") return 0;
  const [a, b] = rate.split("/").map(Number);
  return b ? a / b : num(a);
}

export function parseProbe(json: string): Probe {
  let data: any;
  try {
    data = JSON.parse(json);
  } catch {
    throw new MediaError("invalid_file", "ffprobe não retornou JSON");
  }
  const format = data.format ?? {};
  const streams: any[] = Array.isArray(data.streams) ? data.streams : [];
  // Capas embutidas (attached_pic) aparecem como vídeo; não contam.
  const v = streams.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
  const a = streams.find((s) => s.codec_type === "audio");
  const formatName = String(format.format_name ?? "");
  const container = /\b(mov|mp4)\b/.test(formatName) ? "isobmff" : /\b(matroska|webm)\b/.test(formatName) ? "webm" : "other";

  let video: Probe["video"] = null;
  if (v) {
    const sideRotation = (v.side_data_list ?? []).find((d: any) => d.rotation !== undefined)?.rotation;
    const raw = num(sideRotation ?? v.tags?.rotate ?? 0);
    const rotation = ((Math.round(raw / 90) * 90) % 360 + 360) % 360;
    const width = num(v.width);
    const height = num(v.height);
    const swap = rotation === 90 || rotation === 270;
    video = {
      codec: String(v.codec_name ?? ""),
      profile: String(v.profile ?? ""),
      pixFmt: String(v.pix_fmt ?? ""),
      width,
      height,
      rotation,
      fps: parseRate(v.avg_frame_rate) || parseRate(v.r_frame_rate),
      bitRate: num(v.bit_rate),
      displayWidth: swap ? height : width,
      displayHeight: swap ? width : height,
    };
  }
  return {
    formatName,
    container,
    duration: num(format.duration) || num(v?.duration),
    size: num(format.size),
    bitRate: num(format.bit_rate),
    video,
    audio: a ? { codec: String(a.codec_name ?? ""), channels: num(a.channels) } : null,
  };
}

export async function probe(tools: MediaTools, file: string): Promise<Probe> {
  const r = await run(tools.ffprobe, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file], 60_000, true);
  if (r.code !== 0) throw new MediaError("invalid_file", `ffprobe falhou: ${r.stderr.slice(-400)}`);
  return parseProbe(r.stdout);
}

// ───────────────────────── Plano ─────────────────────────

export type Plan = {
  strategy: VideoStrategy;
  width: number;
  height: number;
  capFps: boolean;
  keepAudio: boolean;
  /** Por que não foi possível só remontar o arquivo (vazio quando strategy = "remux"). */
  reasons: string[];
};

const even = (n: number) => Math.max(2, Math.floor(n) - (Math.floor(n) % 2));

/** Dimensões finais: cabe em 1280×720 na orientação do vídeo, sem ampliar e sem cortar. */
export function targetSize(displayWidth: number, displayHeight: number, maxLong: number = VIDEO_LIMITS.maxLongSide, maxShort: number = VIDEO_LIMITS.maxShortSide) {
  const long = Math.max(displayWidth, displayHeight);
  const short = Math.min(displayWidth, displayHeight);
  const factor = Math.min(1, maxLong / long, maxShort / short);
  return { width: even(displayWidth * factor), height: even(displayHeight * factor) };
}

/** Bitrate acima do qual um H.264 720p já pronto ainda vale ser recomprimido. */
export const REMUX_MAX_BITRATE = 2_500_000;
const UNSAFE_PROFILES = /high 10|high 4:2:2|high 4:4:4/i;

/**
 * Decide entre recodificar e apenas remontar o contêiner (sem perda) quando o arquivo
 * já está no formato que todo navegador toca e no tamanho certo.
 */
export function planFor(p: Probe, maxDuration: number = VIDEO_LIMITS.maxDurationSeconds): Plan {
  if (p.container === "other") throw new MediaError("unsupported_format", `contêiner não suportado: ${p.formatName}`);
  if (!p.video || !p.video.width || !p.video.height) throw new MediaError("no_video_stream", "sem trilha de vídeo");
  if (p.video.width < 64 || p.video.height < 64) throw new MediaError("invalid_file", "resolução pequena demais");
  if (!p.duration || p.duration < 0.3) throw new MediaError("invalid_file", "duração inválida");
  if (p.duration > maxDuration + 0.5) throw new MediaError("too_long", `duração ${p.duration.toFixed(1)} s`);

  const v = p.video;
  const { width, height } = targetSize(v.displayWidth, v.displayHeight);
  const bitRate = v.bitRate || p.bitRate;
  const reasons: string[] = [];
  if (p.container !== "isobmff") reasons.push("contêiner");
  if (v.codec !== "h264") reasons.push(`codec ${v.codec}`);
  if (UNSAFE_PROFILES.test(v.profile)) reasons.push(`perfil ${v.profile}`);
  if (v.pixFmt !== "yuv420p") reasons.push(`pixel ${v.pixFmt}`);
  if (v.rotation !== 0) reasons.push(`rotação ${v.rotation}`);
  if (width !== v.displayWidth || height !== v.displayHeight) reasons.push("resolução");
  if (v.fps > VIDEO_LIMITS.maxFps + 0.5) reasons.push(`${v.fps.toFixed(0)} fps`);
  if (!bitRate || bitRate > REMUX_MAX_BITRATE) reasons.push("bitrate");
  if (p.audio && p.audio.codec !== "aac") reasons.push(`áudio ${p.audio.codec}`);

  return {
    strategy: reasons.length ? "transcode" : "remux",
    width,
    height,
    capFps: v.fps > VIDEO_LIMITS.maxFps + 0.5,
    keepAudio: Boolean(p.audio),
    reasons,
  };
}

export type EncodeSettings = { crf: number; preset: string; audioBitrate: string; maxBitrate: string };

export function transcodeArgs(input: string, output: string, plan: Plan, s: EncodeSettings, codec: "h264" | "av1" = "h264") {
  const filters = [`scale=${plan.width}:${plan.height}:flags=lanczos`, "setsar=1"];
  if (plan.capFps) filters.push(`fps=${VIDEO_LIMITS.maxFps}`);
  const maxrate = parseInt(s.maxBitrate, 10);
  const video =
    codec === "av1"
      ? // SVT-AV1 no preset 8: ~1,2x o tempo do x264 "medium", ~44% menor com a mesma qualidade (docs/VIDEOS.md).
        ["-c:v", "libsvtav1", "-preset", "8", "-crf", String(AV1_CRF), "-pix_fmt", "yuv420p"]
      : ["-c:v", "libx264", "-preset", s.preset, "-crf", String(s.crf), "-profile:v", "high", "-pix_fmt", "yuv420p", "-maxrate", s.maxBitrate, "-bufsize", `${maxrate * 2}${s.maxBitrate.replace(/^[0-9]+/, "")}`];
  return [
    "-hide_banner", "-nostdin", "-y",
    "-i", input,
    "-map", "0:v:0", ...(plan.keepAudio ? ["-map", "0:a:0"] : []),
    // Remove metadados (localização do celular, nome do aparelho); a rotação já é aplicada nos pixels.
    "-map_metadata", "-1", "-map_chapters", "-1",
    "-vf", filters.join(","),
    ...video,
    // Um quadro-chave a cada 2 s: avançar e voltar no vídeo responde rápido.
    "-g", String(VIDEO_LIMITS.maxFps * 2),
    ...(plan.keepAudio ? ["-c:a", "aac", "-b:a", s.audioBitrate, "-ac", "2"] : ["-an"]),
    "-movflags", "+faststart",
    "-f", "mp4", output,
  ];
}

export function remuxArgs(input: string, output: string, plan: Plan) {
  return [
    "-hide_banner", "-nostdin", "-y",
    "-i", input,
    "-map", "0:v:0", ...(plan.keepAudio ? ["-map", "0:a:0"] : []),
    "-c", "copy", "-map_metadata", "-1", "-map_chapters", "-1",
    "-movflags", "+faststart",
    "-f", "mp4", output,
  ];
}

export async function encode(tools: MediaTools, input: string, output: string, plan: Plan, settings: EncodeSettings, strategy: VideoStrategy = plan.strategy) {
  const args = strategy === "remux" ? remuxArgs(input, output, plan) : transcodeArgs(input, output, plan, settings);
  const r = await run(tools.ffmpeg, args, tools.timeoutMs);
  if (r.timedOut) throw new MediaError("processing_failed", `ffmpeg excedeu ${Math.round(tools.timeoutMs / 1000)} s`);
  if (r.code !== 0) throw new MediaError("processing_failed", `ffmpeg (${strategy}) saiu com ${r.code}: ${r.stderr.slice(-600)}`);
}

// ───────────────────────── Versões extras ─────────────────────────

/** CRF do SVT-AV1 que empatou em SSIM com o H.264 CRF 25 nos vídeos de comida medidos (docs/VIDEOS.md). */
export const AV1_CRF = 38;

/** Versões H.264 menores: lado menor, lado maior e tetos de bitrate (o CRF decide abaixo do teto). */
const SMALLER = {
  "540p": { short: 540, long: 960, maxBitrate: "2M", audioBitrate: "80k" },
  "360p": { short: 360, long: 640, maxBitrate: "900k", audioBitrate: "64k" },
} as const;

/**
 * Plano de uma versão extra a partir do plano da principal. null: não faz sentido (a versão menor não seria
 * menor que a principal, porque o vídeo enviado já é pequeno; nunca amplia).
 */
export function variantPlan(main: Plan, kind: VideoVariantKind): Plan | null {
  if (kind === "av1") return { ...main, strategy: "transcode", reasons: ["versão av1"] };
  const t = SMALLER[kind];
  const size = targetSize(main.width, main.height, t.long, t.short);
  if (Math.min(size.width, size.height) >= Math.min(main.width, main.height)) return null;
  return { ...main, ...size, strategy: "transcode", reasons: [`versão ${kind}`] };
}

export function variantCodec(kind: VideoVariantKind): "h264" | "av1" {
  return kind === "av1" ? "av1" : "h264";
}

export function variantSettings(kind: VideoVariantKind, s: EncodeSettings): EncodeSettings {
  return kind === "av1" ? s : { ...s, maxBitrate: SMALLER[kind].maxBitrate, audioBitrate: SMALLER[kind].audioBitrate };
}

export async function encodeVariant(tools: MediaTools, input: string, output: string, plan: Plan, kind: VideoVariantKind, settings: EncodeSettings) {
  const r = await run(tools.ffmpeg, transcodeArgs(input, output, plan, variantSettings(kind, settings), variantCodec(kind)), tools.timeoutMs);
  if (r.timedOut) throw new MediaError("processing_failed", `ffmpeg (${kind}) excedeu ${Math.round(tools.timeoutMs / 1000)} s`);
  if (r.code !== 0) throw new MediaError("processing_failed", `ffmpeg (${kind}) saiu com ${r.code}: ${r.stderr.slice(-600)}`);
}

const encoders = new Map<string, Promise<boolean>>();
/** O FFmpeg instalado tem este codificador? (o do Debian pode não ter o SVT-AV1). Resultado guardado. */
export function hasEncoder(tools: MediaTools, name: string) {
  if (!encoders.has(name)) encoders.set(name, run(tools.ffmpeg, ["-hide_banner", "-encoders"], 30_000, true).then((r) => r.code === 0 && new RegExp(`\\b${name}\\b`).test(r.stdout)));
  return encoders.get(name)!;
}

// ───────────────────────── Validação ─────────────────────────

/** Confere se o átomo moov vem antes do mdat (início rápido em reprodução progressiva). */
export async function hasFastStart(file: string) {
  const fh = await open(file, "r");
  try {
    const { size } = await fh.stat();
    let offset = 0;
    const head = Buffer.alloc(16);
    while (offset + 8 <= size) {
      await fh.read(head, 0, 16, offset);
      let boxSize = head.readUInt32BE(0);
      const type = head.toString("latin1", 4, 8);
      if (type === "moov") return true;
      if (type === "mdat") return false;
      if (boxSize === 1) boxSize = Number(head.readBigUInt64BE(8));
      else if (boxSize === 0) return false;
      if (boxSize < 8) return false;
      offset += boxSize;
    }
    return false;
  } finally {
    await fh.close();
  }
}

export type Validation = { width: number; height: number; duration: number; size: number; hasAudio: boolean };

/** O arquivo final precisa abrir, ter as dimensões esperadas, durar o mesmo e decodificar no começo e no fim. */
export async function validateOutput(tools: MediaTools, file: string, source: Probe, expected: { width: number; height: number }, codec: "h264" | "av1" = "h264"): Promise<Validation> {
  const { size } = await stat(file);
  if (!size) throw new MediaError("validation_failed", "arquivo final vazio");
  const out = await probe(tools, file).catch(() => {
    throw new MediaError("validation_failed", "arquivo final não abre no ffprobe");
  });
  const v = out.video;
  if (!v || v.codec !== codec || v.pixFmt !== "yuv420p") throw new MediaError("validation_failed", `vídeo final inesperado: ${v?.codec}/${v?.pixFmt}`);
  if (v.displayWidth !== expected.width || v.displayHeight !== expected.height) {
    throw new MediaError("validation_failed", `dimensões ${v.displayWidth}x${v.displayHeight}, esperado ${expected.width}x${expected.height}`);
  }
  const minDuration = Math.min(source.duration - 1, source.duration * 0.9);
  if (out.duration < minDuration) throw new MediaError("validation_failed", `duração ${out.duration.toFixed(2)} s de ${source.duration.toFixed(2)} s`);
  if (!(await hasFastStart(file))) throw new MediaError("validation_failed", "moov depois do mdat (sem faststart)");
  for (const seek of [["-t", "3"], ["-sseof", "-3"]]) {
    const args = seek[0] === "-t" ? ["-v", "error", "-xerror", "-i", file, ...seek, "-f", "null", "-"] : ["-v", "error", "-xerror", ...seek, "-i", file, "-f", "null", "-"];
    const r = await run(tools.ffmpeg, args, 120_000);
    if (r.code !== 0) throw new MediaError("validation_failed", `não decodifica (${seek.join(" ")}): ${r.stderr.slice(-300)}`);
  }
  return { width: v.displayWidth, height: v.displayHeight, duration: Math.round(out.duration * 100) / 100, size, hasAudio: Boolean(out.audio) };
}

// ───────────────────────── Miniatura ─────────────────────────

/** Brilho médio (0–255) abaixo do qual o quadro é considerado escuro demais para capa. */
export const DARK_FRAME_LUMA = 28;

export type Thumbnail = { luma: number; at: number; width: number; height: number };

/**
 * Capa WebP: testa alguns trechos do vídeo e, em cada um, deixa o filtro "thumbnail" do FFmpeg
 * escolher o quadro mais representativo. Evita quadros pretos de abertura; fica com o mais claro
 * se todos forem escuros.
 */
export async function makeThumbnail(tools: MediaTools, input: string, output: string, plan: Plan, duration: number, tmp: (name: string) => string): Promise<Thumbnail> {
  const { width, height } = targetSize(plan.width, plan.height, 720, 720);
  const points = [Math.min(1, duration * 0.1), duration * 0.33, duration * 0.6].map((t) => Math.max(0, Math.min(t, duration - 0.3)));
  let best: (Thumbnail & { file: string }) | null = null;
  for (const [i, at] of points.entries()) {
    const file = i === 0 ? output : tmp(`thumb-${i}.webp`);
    const r = await run(
      tools.ffmpeg,
      [
        "-hide_banner", "-nostdin", "-y", "-loglevel", "info",
        "-ss", at.toFixed(2), "-i", input,
        "-vf", `thumbnail=n=24,scale=${width}:${height}:flags=lanczos,setsar=1,signalstats,metadata=print:key=lavfi.signalstats.YAVG`,
        "-frames:v", "1", "-an", "-c:v", "libwebp", "-quality", "80",
        file,
      ],
      120_000,
    );
    if (r.code !== 0) continue;
    const luma = Number(/lavfi\.signalstats\.YAVG=([\d.]+)/.exec(r.stderr)?.[1] ?? 0);
    if (!best || luma > best.luma) best = { luma, at, width, height, file };
    if (luma >= DARK_FRAME_LUMA) break;
  }
  if (!best) throw new MediaError("processing_failed", "não foi possível gerar a miniatura");
  if (best.file !== output) {
    const { copyFile } = await import("node:fs/promises");
    await copyFile(best.file, output);
  }
  return { luma: Math.round(best.luma), at: Math.round(best.at * 100) / 100, width: best.width, height: best.height };
}
