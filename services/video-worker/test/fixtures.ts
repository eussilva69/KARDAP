/**
 * Gera vídeos reais para os testes com o FFmpeg instalado na máquina (nenhum arquivo é simulado).
 * Cada fixture é criado uma vez por execução numa pasta temporária.
 */
import { copyFile, mkdtemp, open, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run, type MediaTools } from "../src/media.ts";

export const tools: MediaTools = { ffmpeg: process.env.FFMPEG_PATH || "ffmpeg", ffprobe: process.env.FFPROBE_PATH || "ffprobe", timeoutMs: 300_000 };

export async function hasFfmpeg() {
  const r = await run(tools.ffmpeg, ["-hide_banner", "-version"], 10_000, true);
  return r.code === 0;
}

export async function hasEncoder(name: string) {
  const r = await run(tools.ffmpeg, ["-hide_banner", "-encoders"], 10_000, true);
  return new RegExp(`\\s${name}\\s`).test(r.stdout);
}

let dirPromise: Promise<string> | null = null;
const dir = () => (dirPromise ??= mkdtemp(join(tmpdir(), "kardap-video-fixtures-")));
const made = new Map<string, Promise<string>>();

async function ff(args: string[]) {
  const r = await run(tools.ffmpeg, ["-hide_banner", "-nostdin", "-y", "-loglevel", "error", ...args], 300_000);
  if (r.code !== 0) throw new Error(`ffmpeg ${args.join(" ")}\n${r.stderr}`);
}

function fixture(name: string, build: (out: string, d: string) => Promise<void>) {
  return () => {
    if (!made.has(name)) made.set(name, dir().then(async (d) => {
      const out = join(d, name);
      await build(out, d);
      return out;
    }));
    return made.get(name)!;
  };
}

/** Horizontal 1080p a 60 fps com áudio, sem faststart (como sai de muitas câmeras). */
export const landscape1080p60 = fixture("landscape-1080p60.mp4", (out) =>
  ff(["-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=60:duration=4", "-f", "lavfi", "-i", "sine=frequency=440:duration=4", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", out]),
);

/** Gravação de celular: pixels 1920×1080 com rotação de 90° nos metadados (aparece em pé). */
export const phoneRotatedMov = fixture("phone-rotated.mov", async (out, d) => {
  const raw = join(d, "phone-raw.mp4");
  await ff(["-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30:duration=3", "-f", "lavfi", "-i", "sine=frequency=330:duration=3", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", raw]);
  await ff(["-display_rotation:v:0", "90", "-i", raw, "-c", "copy", out]);
});

/** Já otimizado: H.264 720p, 30 fps, bitrate baixo, sem áudio. Deve só ser remontado. */
export const optimized720NoAudio = fixture("optimized-720.mp4", (out) =>
  ff(["-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=3", "-c:v", "libx264", "-preset", "veryfast", "-crf", "30", "-maxrate", "1M", "-bufsize", "2M", "-pix_fmt", "yuv420p", "-an", out]),
);

/** HEVC (H.265), comum em iPhones: precisa ser convertido para tocar em todo navegador. */
export const hevc720 = fixture("hevc-720.mp4", (out) =>
  ff(["-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=2", "-c:v", "libx265", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-tag:v", "hvc1", "-an", out]),
);

/** WebM pequeno (640×360): não pode ser ampliado. */
export const small360Webm = fixture("small-360.webm", (out) =>
  ff(["-f", "lavfi", "-i", "testsrc2=size=640x360:rate=25:duration=2", "-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "8", "-b:v", "300k", "-an", out]),
);

/** Começa com 2 s de tela preta: a miniatura não pode sair preta. */
export const blackStart = fixture("black-start.mp4", (out) =>
  ff([
    "-f", "lavfi", "-i", "color=c=black:size=640x360:rate=30:duration=2",
    "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=3",
    "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]", "-map", "[v]",
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", out,
  ]),
);

/** Mais longo que o limite (125 s), em resolução mínima para gerar rápido. */
export const tooLong = fixture("too-long.mp4", (out) =>
  ff(["-f", "lavfi", "-i", "color=c=gray:size=160x120:rate=5:duration=125", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", out]),
);

/** Só áudio, com extensão de vídeo. */
export const audioOnly = fixture("audio-only.mp4", (out) => ff(["-f", "lavfi", "-i", "sine=frequency=500:duration=2", "-c:a", "aac", out]));

/** Texto com extensão .mp4. */
export const notAVideo = fixture("not-a-video.mp4", (out) => writeFile(out, "isto não é um vídeo\n".repeat(200)));

/** MP4 cortado no meio (envio interrompido): o índice (moov) fica faltando. */
export const truncated = fixture("truncated.mp4", async (out, d) => {
  const full = await landscape1080p60();
  const { size } = await stat(full);
  const fh = await open(full, "r");
  const buf = Buffer.alloc(Math.floor(size / 2));
  await fh.read(buf, 0, buf.length, 0);
  await fh.close();
  await writeFile(out, buf);
  void d;
});

/** Vídeo real de comida do próprio projeto (public/), copiado para a pasta temporária. */
export const realFood = (name: "pizzavideo.mp4" | "hamburguer.mp4" | "carne tabua.mp4") =>
  fixture(`real-${name.replace(/\s/g, "-")}`, async (out) => copyFile(join(import.meta.dirname, "..", "..", "..", "public", name), out))();

export const workDir = async (name: string) => mkdtemp(join(await dir(), `${name}-`));
