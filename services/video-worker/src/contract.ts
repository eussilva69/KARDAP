/**
 * Contrato dos vídeos de produto, compartilhado pelo painel (Next.js), pela rota de API
 * e pelo worker de processamento (Cloud Run). Fonte única para status, caminhos e limites.
 *
 * Sem imports: o worker roda este arquivo direto no Node (remoção de tipos) e o app
 * importa por "@/services/video-worker/src/contract".
 */

/**
 * Responsabilidades:
 * - navegador: pending → uploading, e pode cancelar (canceled) ou registrar falha de envio (failed, error "upload");
 * - worker (credencial de servidor): processing → ready | retrying | failed.
 * As regras do Firestore impedem o navegador de gravar processing, retrying ou ready.
 */
export type VideoStatus = "pending" | "uploading" | "processing" | "ready" | "failed" | "retrying" | "canceled";

export const CLIENT_STATUSES: readonly VideoStatus[] = ["pending", "uploading", "canceled", "failed"];
export const SERVER_STATUSES: readonly VideoStatus[] = ["processing", "retrying", "ready", "failed"];
export const TERMINAL_STATUSES: readonly VideoStatus[] = ["ready", "failed", "canceled"];

export type VideoErrorCode =
  | "upload"
  | "invalid_file"
  | "unsupported_format"
  | "too_large"
  | "too_long"
  | "no_video_stream"
  | "product_not_found"
  | "quota_exceeded"
  | "processing_failed"
  | "validation_failed"
  | "stale";

/** Mensagens mostradas ao dono do restaurante. */
export const VIDEO_ERROR_MESSAGES: Record<VideoErrorCode, string> = {
  upload: "O envio não terminou. Verifique a conexão e tente de novo.",
  invalid_file: "O arquivo não é um vídeo válido ou está corrompido.",
  unsupported_format: "Formato não suportado. Use MP4, MOV ou WebM.",
  too_large: "O vídeo passa do tamanho máximo permitido.",
  too_long: "O vídeo passa da duração máxima permitida.",
  no_video_stream: "O arquivo não tem imagem de vídeo.",
  product_not_found: "O produto foi excluído antes de o vídeo ficar pronto.",
  quota_exceeded: "Limite diário de vídeos do estabelecimento atingido. Tente amanhã.",
  processing_failed: "Não foi possível otimizar o vídeo. Tente de novo.",
  validation_failed: "A versão otimizada não passou na verificação. Tente de novo.",
  stale: "O envio ficou incompleto e foi descartado.",
};

/** Limites. O Storage, o Firestore e o worker usam os mesmos números. */
export const VIDEO_LIMITS = {
  maxBytes: 200 * 1024 * 1024,
  maxDurationSeconds: 120,
  /** Lado maior e lado menor do vídeo final (720p em qualquer orientação). */
  maxLongSide: 1280,
  maxShortSide: 720,
  maxFps: 30,
} as const;

/** Formatos aceitos no envio: extensão real (detectada no conteúdo) → tipo MIME. */
export const VIDEO_FORMATS = { mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" } as const;
export type VideoExtension = keyof typeof VIDEO_FORMATS;

/** Documento restaurantes/{restaurantId}/videos/{videoId}. */
export type ProductVideoDoc = {
  productId: string;
  status: VideoStatus;
  originalPath: string;
  originalSize: number;
  contentType: string;
  fileName: string;
  createdBy: string;
  createdAt: unknown;
  updatedAt: unknown;
  uploadCompletedAt?: unknown;
  // Gravados só pelo worker:
  attempts?: number;
  sourceGeneration?: string;
  attemptId?: string;
  leaseUntil?: unknown;
  optimizedPath?: string;
  thumbnailPath?: string;
  optimizedUrl?: string;
  thumbnailUrl?: string;
  optimizedSize?: number;
  /** (1 − otimizado / original) × 100, com uma casa decimal. Pode ser negativo. */
  reductionPercent?: number;
  width?: number;
  height?: number;
  duration?: number;
  strategy?: VideoStrategy;
  error?: VideoErrorCode;
  errorDetail?: string;
  processedAt?: unknown;
  processingMs?: number;
  supersededBy?: string;
};

/** Resumo publicado no produto (restaurantes/{id}/produtos/{productId}.video), gravado só pelo worker. */
export type PublishedVideo = {
  id: string;
  width: number;
  height: number;
  duration: number;
  optimizedPath: string;
  thumbnailPath: string;
  optimizedSize: number;
  originalSize: number;
};

/** Como o arquivo final foi produzido. */
export type VideoStrategy = "transcode" | "remux";

// ───────────────────────── Caminhos ─────────────────────────

const ID = /^[A-Za-z0-9_-]{6,64}$/;

export const isSafeId = (value: unknown): value is string => typeof value === "string" && ID.test(value);

export function videoPaths(restaurantId: string, productId: string, videoId: string, ext: VideoExtension) {
  for (const id of [restaurantId, productId, videoId]) if (!isSafeId(id)) throw new Error("Identificador inválido no caminho do vídeo.");
  const base = `restaurantes/${restaurantId}/produtos/${productId}`;
  return {
    original: `${base}/videos/original/${videoId}.${ext}`,
    optimized: `${base}/videos/optimized/${videoId}.mp4`,
    thumbnail: `${base}/thumbnails/${videoId}.webp`,
  };
}

export type OriginalRef = { restaurantId: string; productId: string; videoId: string; ext: VideoExtension };

/**
 * Só arquivos em .../videos/original/ disparam processamento. Arquivos otimizados e
 * miniaturas ficam fora deste padrão: o worker nunca reprocessa o que ele mesmo gerou.
 */
export function parseOriginalPath(path: string): OriginalRef | null {
  const m = /^restaurantes\/([A-Za-z0-9_-]{6,64})\/produtos\/([A-Za-z0-9_-]{6,64})\/videos\/original\/([A-Za-z0-9_-]{6,64})\.(mp4|mov|webm)$/.exec(path);
  return m ? { restaurantId: m[1], productId: m[2], videoId: m[3], ext: m[4] as VideoExtension } : null;
}

/** Qualquer arquivo de vídeo gerenciado (original, otimizado ou miniatura) de um produto. */
export function parseManagedPath(path: string): (Omit<OriginalRef, "ext"> & { kind: "original" | "optimized" | "thumbnail" }) | null {
  const m = /^restaurantes\/([A-Za-z0-9_-]{6,64})\/produtos\/([A-Za-z0-9_-]{6,64})\/(videos\/original|videos\/optimized|thumbnails)\/([A-Za-z0-9_-]{6,64})\.(mp4|mov|webm|webp)$/.exec(path);
  if (!m) return null;
  const kind = m[3] === "videos/original" ? "original" : m[3] === "videos/optimized" ? "optimized" : "thumbnail";
  return { restaurantId: m[1], productId: m[2], videoId: m[4], kind };
}

export function reductionPercent(originalSize: number, optimizedSize: number) {
  if (!originalSize) return 0;
  return Math.round((1 - optimizedSize / originalSize) * 1000) / 10;
}
