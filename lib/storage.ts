import { connectStorageEmulator, deleteObject, getDownloadURL, getStorage, ref, uploadBytesResumable, type FirebaseStorage, type UploadTask } from "firebase/storage";
import { EMULATOR_HOST, getFirebaseApp, useEmulators } from "./firebase";
import { ImageError, optimizeImage, type ImageKind, type OptimizedImage, type OptimizedVariant } from "./image-optimization";

/**
 * Envio de imagens ao Firebase Storage. Toda imagem passa por lib/image-optimization.ts
 * (WebP, tamanho certo, versão pequena) antes de subir. Vídeos: lib/video-upload.ts.
 */

export type UploadProgress = (percent: number) => void;

let storageService: FirebaseStorage | null = null;
function storage(): FirebaseStorage {
  if (storageService) return storageService;
  // Importado só aqui: o SDK de Storage fica fora do pacote do cardápio público.
  const service = getStorage(getFirebaseApp());
  if (useEmulators) connectStorageEmulator(service, EMULATOR_HOST, 9199);
  storageService = service;
  // Sem isso o SDK tenta reenviar por até 10 minutos sem dar retorno ao usuário.
  service.maxUploadRetryTime = 30_000;
  service.maxOperationRetryTime = 30_000;
  return service;
}

const restaurantId = () => (typeof window !== "undefined" ? localStorage.getItem("kardap-restaurant-id") : null) || "unassigned";

/** Nome novo a cada envio: a URL nunca muda de conteúdo, então pode ficar em cache por 1 ano. */
const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

function newImageId() {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 16);
}

const SAFE_ID = /^[A-Za-z0-9_-]{6,64}$/;

/**
 * Pastas que já existiam (e que as regras do Storage já protegem por estabelecimento).
 * O produto vai no nome do arquivo: restaurantes/{id}/produtos/imagens/{produto}-{imagem}.webp
 */
function imagePaths(kind: ImageKind, imageId: string, main: OptimizedVariant, small: OptimizedVariant, productId?: string) {
  const rid = restaurantId();
  if (!SAFE_ID.test(rid)) throw new Error("Estabelecimento não identificado. Entre de novo.");
  let base: string;
  if (kind === "product") {
    if (!productId || !SAFE_ID.test(productId)) throw new Error("Produto não identificado.");
    base = `restaurantes/${rid}/produtos/imagens/${productId}-${imageId}`;
  } else {
    base = kind === "logo" ? `restaurantes/${rid}/logos/logo-${imageId}` : `restaurantes/${rid}/capas/capa-${imageId}`;
  }
  return { main: `${base}.${main.ext}`, small: `${base}-sm.${small.ext}` };
}

/** Arquivos gerados por este fluxo (os únicos que o sistema apaga sozinho). Imagens antigas ficam intactas. */
const MANAGED = /^restaurantes\/([A-Za-z0-9_-]{6,64})\/(?:produtos\/imagens\/[A-Za-z0-9_-]{6,64}|logos\/logo|capas\/capa)-[a-z0-9]{16}(?:-sm)?\.(?:webp|jpg|png)$/;

/** Caminho no bucket a partir da URL de download, só se for uma imagem gerenciada deste estabelecimento. */
export function managedImagePath(url: string | undefined | null) {
  const m = /\/o\/([^?#]+)/.exec(String(url || ""));
  if (!m) return null;
  let path: string;
  try {
    path = decodeURIComponent(m[1]);
  } catch {
    return null;
  }
  const match = MANAGED.exec(path);
  return match && match[1] === restaurantId() ? path : null;
}

export type UploadStage = "processing" | "uploading";

export type UploadedImage = {
  url: string;
  smallUrl: string;
  width: number;
  height: number;
  optimization: OptimizedImage;
};

/** Metadados guardados junto da URL no Firestore (tamanho real de cada versão e do original). */
export function imageMeta(u: UploadedImage) {
  const o = u.optimization;
  return { width: u.width, height: u.height, format: o.main.ext, size: o.main.size, smallSize: o.small.size, originalSize: o.originalSize };
}

function friendlyStorageError(error: unknown): Error {
  const code = (error as { code?: string })?.code || "";
  if (code === "storage/canceled") return new ImageError("canceled");
  if (code === "storage/unauthorized" || code === "storage/unauthenticated") return new Error("Sem permissão para enviar imagens neste estabelecimento. Entre de novo e tente outra vez.");
  if (code === "storage/quota-exceeded") return new Error("O limite de armazenamento foi atingido. Fale com o suporte do Kardap.");
  if (code === "storage/retry-limit-exceeded" || code === "storage/unknown" || !navigator.onLine) return new Error("Sem conexão estável. A imagem não foi enviada; tente de novo quando a internet voltar.");
  return error instanceof Error ? error : new Error("Não foi possível enviar a imagem. Tente de novo.");
}

/**
 * Otimiza e envia as duas versões (principal e pequena) em paralelo. Só termina depois que o
 * Storage confirmou os dois arquivos e devolveu as URLs: nada de URL inexistente no Firestore.
 * Se uma versão falhar ou o envio for cancelado, a outra é apagada para não ficar órfã.
 */
export async function uploadImage({
  file,
  kind,
  productId,
  optimized,
  onStage,
  onProgress,
  signal,
}: {
  file: File;
  kind: ImageKind;
  productId?: string;
  /** Resultado de otimização já pronto (ex.: feito quando a pessoa escolheu o arquivo). */
  optimized?: OptimizedImage;
  onStage?: (stage: UploadStage) => void;
  onProgress?: UploadProgress;
  signal?: AbortSignal;
}): Promise<UploadedImage> {
  onStage?.("processing");
  const o = optimized ?? (await optimizeImage(file, kind, { signal }));
  if (signal?.aborted) throw new ImageError("canceled");
  const paths = imagePaths(kind, newImageId(), o.main, o.small, productId);
  onStage?.("uploading");
  onProgress?.(0);

  const s = storage();
  const total = o.main.size + o.small.size;
  const sent = { main: 0, small: 0 };
  const tasks: UploadTask[] = [];
  const done: string[] = [];
  const start = (variant: "main" | "small") => {
    const v = o[variant];
    const task = uploadBytesResumable(ref(s, paths[variant]), v.blob, {
      contentType: v.type,
      cacheControl: IMMUTABLE_CACHE,
      customMetadata: { kind, variant, width: String(v.width), height: String(v.height), originalSize: String(o.originalSize), originalType: o.originalType },
    });
    tasks.push(task);
    return new Promise<string>((resolve, reject) => {
      task.on(
        "state_changed",
        (snap) => {
          sent[variant] = snap.bytesTransferred;
          onProgress?.(Math.min(99, Math.floor(((sent.main + sent.small) / total) * 100)));
        },
        reject,
        () => {
          done.push(paths[variant]);
          getDownloadURL(task.snapshot.ref).then(resolve, reject);
        },
      );
    });
  };
  const abort = () => tasks.forEach((t) => t.cancel());
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const [url, smallUrl] = await Promise.all([start("main"), start("small")]);
    onProgress?.(100);
    return { url, smallUrl, width: o.main.width, height: o.main.height, optimization: o };
  } catch (error) {
    abort();
    await Promise.all(done.map((path) => deleteObject(ref(s, path)).catch(() => undefined)));
    throw friendlyStorageError(error);
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}

/** Apaga imagens gerenciadas (ignora URLs antigas, externas ou de outro estabelecimento). */
export async function deleteManagedImages(urls: (string | undefined | null)[]) {
  const s = storage();
  const paths = Array.from(new Set(urls.map(managedImagePath).filter((p): p is string => Boolean(p))));
  await Promise.all(paths.map((path) => deleteObject(ref(s, path)).catch(() => undefined)));
}

/**
 * Apaga imagens substituídas depois de um intervalo (tempo do "Desfazer" e da gravação no Firestore),
 * e só se elas não estiverem mais em uso nesse momento.
 */
export function scheduleImageCleanup(urls: (string | undefined | null)[], stillUsed: () => (string | undefined | null)[], delayMs = 20_000) {
  const candidates = urls.filter(Boolean) as string[];
  if (!candidates.some((u) => managedImagePath(u))) return;
  setTimeout(() => {
    const used = new Set(stillUsed().filter(Boolean));
    deleteManagedImages(candidates.filter((u) => !used.has(u))).catch(() => undefined);
  }, delayMs);
}
