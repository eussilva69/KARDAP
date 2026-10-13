/**
 * Núcleo do processamento de imagens: decodifica, redimensiona e codifica.
 * Roda dentro do Web Worker (lib/image-worker.ts) e, como reserva, na thread principal.
 * Não usa nada do DOM além de canvas, então funciona nos dois ambientes.
 */

export type ImageMime = "image/jpeg" | "image/png" | "image/webp";

export type VariantSpec = {
  name: "main" | "small";
  /** Lado maior em pixels (mantém a proporção, nunca amplia). */
  maxSide: number;
  /** Qualidade de 0 a 1 (WebP e JPEG; PNG ignora). */
  quality: number;
};

export type EncodedVariant = {
  name: VariantSpec["name"];
  blob: Blob;
  type: ImageMime;
  width: number;
  height: number;
};

export type CoreInput = {
  file: Blob;
  sourceType: ImageMime;
  /** JPEG com bloco EXIF (pode ter localização): nunca é publicado sem recodificar. */
  sourceHasExif: boolean;
  specs: VariantSpec[];
  /** false força o caminho sem WebP (usado em teste e em navegadores sem codificador WebP). */
  allowWebp: boolean;
  maxPixels: number;
};

export type CoreResult = {
  width: number;
  height: number;
  transparent: boolean;
  /** O navegador sabe gerar WebP pelo canvas (o Safari não sabe). */
  webpSupported: boolean;
  variants: EncodedVariant[];
  /** A versão principal é o próprio arquivo enviado (já era menor e no tamanho certo). */
  keptOriginal: boolean;
};

export class ImageProcessingError extends Error {
  code: "corrupted" | "too_many_pixels" | "processing_failed" | "unsupported_browser";
  constructor(code: ImageProcessingError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
type Ctx2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

export function fitWithin(width: number, height: number, maxSide: number) {
  const factor = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * factor)), height: Math.max(1, Math.round(height * factor)) };
}

function makeCanvas(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    return c;
  }
  throw new ImageProcessingError("unsupported_browser", "Canvas indisponível");
}

function context(canvas: AnyCanvas): Ctx2D {
  const ctx = canvas.getContext("2d", { alpha: true }) as Ctx2D | null;
  if (!ctx) throw new ImageProcessingError("unsupported_browser", "Contexto 2D indisponível");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return ctx;
}

function encode(canvas: AnyCanvas, type: ImageMime, quality: number): Promise<Blob> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) =>
    (canvas as HTMLCanvasElement).toBlob((blob) => (blob ? resolve(blob) : reject(new ImageProcessingError("processing_failed", "toBlob vazio"))), type, quality),
  );
}

async function decode(file: Blob): Promise<ImageBitmap> {
  try {
    // "from-image" aplica a orientação EXIF das fotos de celular (pixels já ficam em pé).
    return await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  } catch {
    throw new ImageProcessingError("corrupted", "Não foi possível decodificar a imagem");
  }
}

/** Alguma transparência real? Lê uma versão reduzida para não percorrer milhões de pixels. */
function hasTransparency(bitmap: ImageBitmap) {
  const side = 96;
  const { width, height } = fitWithin(bitmap.width, bitmap.height, side);
  const canvas = makeCanvas(width, height);
  const ctx = context(canvas);
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true;
  return false;
}

/**
 * Redução em etapas (metade por vez até perto do alvo): evita serrilhado e perda de detalhe
 * quando uma foto de 4000 px vira miniatura de 400 px.
 */
function resize(bitmap: ImageBitmap, width: number, height: number, opaque: boolean): AnyCanvas {
  let source: ImageBitmap | AnyCanvas = bitmap;
  let w = bitmap.width;
  let h = bitmap.height;
  while (w / 2 > width && h / 2 > height) {
    w = Math.round(w / 2);
    h = Math.round(h / 2);
    const step = makeCanvas(w, h);
    context(step).drawImage(source as CanvasImageSource, 0, 0, w, h);
    source = step;
  }
  const out = makeCanvas(width, height);
  const ctx = context(out);
  if (opaque) {
    // JPEG não tem transparência: fundo branco em vez de preto em pixels semitransparentes.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(source as CanvasImageSource, 0, 0, width, height);
  return out;
}

let webpEncoder: boolean | null = null;
async function canEncodeWebp() {
  if (webpEncoder !== null) return webpEncoder;
  try {
    // O canvas precisa ter contexto e conteúdo: sem isso o navegador recusa codificar.
    const probe = makeCanvas(2, 2);
    const ctx = context(probe);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 1, 1);
    const blob = await encode(probe, "image/webp", 0.8);
    webpEncoder = blob.type === "image/webp";
  } catch {
    webpEncoder = false;
  }
  return webpEncoder;
}

export async function processImage(input: CoreInput): Promise<CoreResult> {
  const bitmap = await decode(input.file);
  try {
    if (!bitmap.width || !bitmap.height) throw new ImageProcessingError("corrupted", "Imagem sem dimensões");
    if (bitmap.width * bitmap.height > input.maxPixels) throw new ImageProcessingError("too_many_pixels", `${bitmap.width}×${bitmap.height}`);

    const transparent = input.sourceType !== "image/jpeg" && hasTransparency(bitmap);
    const webpSupported = input.allowWebp && (await canEncodeWebp());
    // Sem WebP: foto vira JPEG; com transparência, PNG (JPEG perderia o fundo transparente).
    const fallback: ImageMime = transparent ? "image/png" : "image/jpeg";

    const variants: EncodedVariant[] = [];
    let keptOriginal = false;
    for (const spec of input.specs) {
      const { width, height } = fitWithin(bitmap.width, bitmap.height, spec.maxSide);
      const canvas = resize(bitmap, width, height, !transparent && !webpSupported);
      const candidates: { blob: Blob; type: ImageMime }[] = [];
      if (webpSupported) candidates.push({ blob: await encode(canvas, "image/webp", spec.quality), type: "image/webp" });
      const resized = width !== bitmap.width || height !== bitmap.height;

      if (spec.name === "main") {
        // WebP maior que o original? Testa o formato do original recodificado e fica com o menor.
        const webp = candidates[0];
        if (!webp || webp.blob.size > input.file.size) {
          const sameFormat: ImageMime = input.sourceType === "image/webp" ? (webpSupported ? "image/webp" : fallback) : transparent ? "image/png" : "image/jpeg";
          if (!candidates.some((c) => c.type === sameFormat)) {
            const opaqueCanvas = sameFormat === "image/jpeg" && webpSupported ? resize(bitmap, width, height, true) : canvas;
            candidates.push({ blob: await encode(opaqueCanvas, sameFormat, spec.quality), type: sameFormat });
          }
        }
        if (!candidates.length) candidates.push({ blob: await encode(canvas, fallback, spec.quality), type: fallback });
        candidates.sort((a, b) => a.blob.size - b.blob.size);
        const best = candidates[0];
        // O original só é mantido se já estiver no tamanho certo, for menor e não carregar EXIF de JPEG.
        if (!resized && input.file.size <= best.blob.size && !input.sourceHasExif) {
          variants.push({ name: spec.name, blob: input.file, type: input.sourceType, width, height });
          keptOriginal = true;
        } else {
          variants.push({ name: spec.name, blob: best.blob, type: best.type, width, height });
        }
      } else {
        if (!candidates.length) candidates.push({ blob: await encode(canvas, fallback, spec.quality), type: fallback });
        const best = candidates[0];
        // Imagem pequena que já cabe na versão reduzida: recodificar só aumentaria o arquivo.
        if (!resized && input.file.size <= best.blob.size && !input.sourceHasExif) {
          variants.push({ name: spec.name, blob: input.file, type: input.sourceType, width, height });
        } else {
          variants.push({ name: spec.name, blob: best.blob, type: best.type, width, height });
        }
      }
    }
    return { width: bitmap.width, height: bitmap.height, transparent, webpSupported, variants, keptOriginal };
  } finally {
    bitmap.close();
  }
}
