"use client";

/**
 * Otimização de imagens antes do envio ao Firebase Storage: valida, redimensiona e converte
 * para WebP num Web Worker (a tela não trava). Cada envio gera duas versões:
 * a principal e uma pequena para listas e miniaturas.
 *
 * Safari (iPhone e Mac) decodifica WebP mas não sabe gerar pelo canvas: nesses navegadores
 * a imagem sai em JPEG (ou PNG, quando tem transparência), sempre o menor arquivo possível.
 */
import { ImageProcessingError, processImage, type CoreInput, type CoreResult, type ImageMime, type VariantSpec } from "./image-core";

/** Configurações por tipo de imagem (lado maior em px e qualidade). */
export const IMAGE_PRESETS = {
  product: { maxSide: 1200, quality: 0.85 },
  category: { maxSide: 1000, quality: 0.82 },
  logo: { maxSide: 1200, quality: 0.9 },
  banner: { maxSide: 1920, quality: 0.85 },
  /** Versão menor da capa: celulares com tela de densidade 2× e a miniatura do painel. */
  bannerSmall: { maxSide: 960, quality: 0.82 },
  thumbnail: { maxSide: 400, quality: 0.75 },
  avatar: { maxSide: 512, quality: 0.82 },
} as const;

/** O que cada envio do sistema gera: versão principal e versão pequena. */
export const IMAGE_KINDS = {
  product: { main: IMAGE_PRESETS.product, small: IMAGE_PRESETS.thumbnail },
  logo: { main: IMAGE_PRESETS.logo, small: IMAGE_PRESETS.avatar },
  cover: { main: IMAGE_PRESETS.banner, small: IMAGE_PRESETS.bannerSmall },
} as const;
export type ImageKind = keyof typeof IMAGE_KINDS;

const MB = 1024 * 1024;
/** Arquivo selecionado (antes da otimização). O Storage recebe bem menos que isso. */
export const MAX_INPUT_BYTES = 25 * MB;
/** ~60 megapixels: acima disso a decodificação pode estourar a memória de celulares. */
export const MAX_PIXELS = 60_000_000;
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
export const IMAGE_HINT = "JPG, PNG ou WebP até 25 MB";

export type ImageErrorCode = "unsupported_format" | "heic" | "too_large" | "empty" | "too_many_pixels" | "corrupted" | "processing_failed" | "unsupported_browser" | "canceled";

const MESSAGES: Record<ImageErrorCode, string> = {
  unsupported_format: "Formato não suportado. Envie uma imagem JPG, PNG ou WebP.",
  heic: "Fotos HEIC não são aceitas. No iPhone, ajuste Câmera > Formatos > Mais Compatível, ou envie a foto em JPG.",
  too_large: `A imagem passa de ${MAX_INPUT_BYTES / MB} MB.`,
  empty: "O arquivo está vazio.",
  too_many_pixels: "A resolução da imagem é grande demais. Reduza a foto e envie de novo.",
  corrupted: "Não foi possível abrir a imagem. O arquivo pode estar corrompido.",
  processing_failed: "Não foi possível otimizar a imagem. Tente de novo.",
  unsupported_browser: "Este navegador não consegue processar imagens. Atualize o navegador ou use outro.",
  canceled: "Envio cancelado.",
};

export class ImageError extends Error {
  code: ImageErrorCode;
  constructor(code: ImageErrorCode, detail?: string) {
    super(MESSAGES[code]);
    this.code = code;
    if (detail) this.cause = detail;
  }
}

/** Formato real pelos primeiros bytes (não pela extensão nem pelo tipo informado pelo navegador). */
export async function sniffImage(file: Blob): Promise<{ type: ImageMime | null; heic: boolean; exif: boolean }> {
  const head = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer());
  const ascii = (from: number, to: number) => String.fromCharCode.apply(null, Array.from(head.slice(from, to)));
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    // Bloco APP1 "Exif": pode conter localização e dados do aparelho.
    let exif = false;
    for (let i = 2; i + 10 < head.length; i++) {
      if (head[i] === 0xff && head[i + 1] === 0xe1 && ascii(i + 4, i + 8) === "Exif") {
        exif = true;
        break;
      }
    }
    return { type: "image/jpeg", heic: false, exif };
  }
  if (head[0] === 0x89 && ascii(1, 4) === "PNG") return { type: "image/png", heic: false, exif: false };
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { type: "image/webp", heic: false, exif: false };
  if (ascii(4, 8) === "ftyp" && /^(heic|heix|hevc|mif1|msf1)$/.test(ascii(8, 12))) return { type: null, heic: true, exif: false };
  return { type: null, heic: false, exif: false };
}

export type OptimizedVariant = { blob: Blob; type: ImageMime; ext: "webp" | "jpg" | "png"; width: number; height: number; size: number };
export type OptimizedImage = {
  kind: ImageKind;
  main: OptimizedVariant;
  small: OptimizedVariant;
  width: number;
  height: number;
  transparent: boolean;
  webpSupported: boolean;
  keptOriginal: boolean;
  originalSize: number;
  originalType: ImageMime;
  ms: number;
};

const EXT: Record<ImageMime, OptimizedVariant["ext"]> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };

// ───────────────────────── Worker ─────────────────────────

let worker: Worker | null = null;
let workerBroken = false;
let seq = 0;
const pending = new Map<number, { resolve: (r: CoreResult) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (workerBroken || typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./image-worker.ts", import.meta.url));
    worker.onmessage = (event: MessageEvent<{ id: number; ok: boolean; result?: CoreResult; code?: string; message?: string }>) => {
      const job = pending.get(event.data.id);
      if (!job) return;
      pending.delete(event.data.id);
      if (event.data.ok) job.resolve(event.data.result!);
      else job.reject(new ImageProcessingError((event.data.code as ImageProcessingError["code"]) || "processing_failed", event.data.message || ""));
    };
    worker.onerror = () => {
      // Worker indisponível (ex.: política do navegador): segue na thread principal.
      workerBroken = true;
      pending.forEach((job) => job.reject(new ImageProcessingError("unsupported_browser", "worker falhou")));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
    return worker;
  } catch {
    workerBroken = true;
    return null;
  }
}

function runInWorker(input: CoreInput, signal?: AbortSignal): Promise<CoreResult> {
  const w = getWorker();
  if (!w) return processImage(input);
  return new Promise<CoreResult>((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    signal?.addEventListener(
      "abort",
      () => {
        if (!pending.has(id)) return;
        pending.delete(id);
        // Interrompe o processamento em andamento; o próximo envio cria outro worker.
        w.terminate();
        if (worker === w) worker = null;
        pending.forEach((job) => job.reject(new ImageError("canceled")));
        pending.clear();
        reject(new ImageError("canceled"));
      },
      { once: true },
    );
    w.postMessage({ id, ...input });
  }).catch((error) => {
    // Falha do worker em si (não da imagem): tenta uma vez na thread principal.
    if (error instanceof ImageProcessingError && error.code === "unsupported_browser") return processImage(input);
    throw error;
  });
}

// ───────────────────────── API ─────────────────────────

/** Validação rápida (formato real e tamanho), antes de qualquer processamento. */
export async function validateImageFile(file: File) {
  if (!file.size) throw new ImageError("empty");
  if (file.size > MAX_INPUT_BYTES) throw new ImageError("too_large");
  const sniff = await sniffImage(file);
  if (sniff.heic) throw new ImageError("heic");
  if (!sniff.type) throw new ImageError("unsupported_format");
  return sniff as { type: ImageMime; heic: false; exif: boolean };
}

export async function optimizeImage(file: File, kind: ImageKind, options: { signal?: AbortSignal; allowWebp?: boolean } = {}): Promise<OptimizedImage> {
  const started = performance.now();
  const sniff = await validateImageFile(file);
  if (options.signal?.aborted) throw new ImageError("canceled");
  if (typeof createImageBitmap === "undefined") throw new ImageError("unsupported_browser");
  const { main, small } = IMAGE_KINDS[kind];
  const specs: VariantSpec[] = [
    { name: "main", ...main },
    { name: "small", ...small },
  ];
  let result: CoreResult;
  try {
    result = await runInWorker({ file, sourceType: sniff.type, sourceHasExif: sniff.exif, specs, allowWebp: options.allowWebp !== false, maxPixels: MAX_PIXELS }, options.signal);
  } catch (error) {
    if (error instanceof ImageError) throw error;
    if (error instanceof ImageProcessingError) throw new ImageError(error.code === "too_many_pixels" ? "too_many_pixels" : error.code === "corrupted" ? "corrupted" : error.code === "unsupported_browser" ? "unsupported_browser" : "processing_failed", error.message);
    throw new ImageError("processing_failed", String(error));
  }
  const toVariant = (name: "main" | "small"): OptimizedVariant => {
    const v = result.variants.find((x) => x.name === name)!;
    return { blob: v.blob, type: v.type, ext: EXT[v.type], width: v.width, height: v.height, size: v.blob.size };
  };
  return {
    kind,
    main: toVariant("main"),
    small: toVariant("small"),
    width: result.width,
    height: result.height,
    transparent: result.transparent,
    webpSupported: result.webpSupported,
    keptOriginal: result.keptOriginal,
    originalSize: file.size,
    originalType: sniff.type,
    ms: Math.round(performance.now() - started),
  };
}

const kb = (bytes: number) => (bytes >= MB ? `${(bytes / MB).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** Resumo honesto para a interface: "4,8 MB → 182 KB · WebP". */
export function describeOptimization(o: OptimizedImage) {
  const format = o.main.type === "image/webp" ? "WebP" : o.main.type === "image/png" ? "PNG" : "JPG";
  return `${kb(o.originalSize)} → ${kb(o.main.size)} · ${format}`;
}
