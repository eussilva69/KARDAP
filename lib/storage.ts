import { getDownloadURL, getStorage, ref, uploadBytesResumable, type FirebaseStorage } from "firebase/storage";
import { getFirebaseApp } from "./firebase";

export type UploadProgress = (percent: number) => void;

function storage(): FirebaseStorage {
  // Importado só aqui: o SDK de Storage fica fora do pacote do cardápio público.
  const service = getStorage(getFirebaseApp());
  // Sem isso o SDK tenta reenviar por até 10 minutos sem dar retorno ao usuário.
  service.maxUploadRetryTime = 30_000;
  service.maxOperationRetryTime = 30_000;
  return service;
}

export type ImageCompressionOptions = {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
};

/**
 * Compacta e redimensiona imagens no cliente antes do upload.
 * Reduz arquivos pesados (ex.: 8 MB de fotos de câmera) para ~150-250 KB em formato WebP moderno,
 * mantendo alta fidelidade visual, eliminando gargalos de rede e acelerando a renderização no cardápio.
 */
export async function compressAndResizeImage(
  file: File,
  options: ImageCompressionOptions = {}
): Promise<File> {
  if (typeof window === "undefined" || typeof document === "undefined") return file;
  if (!file.type.startsWith("image/")) return file;

  const { maxWidth = 1600, maxHeight = 1600, quality = 0.82 } = options;

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(file);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => resolve(file);
      img.onload = () => {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        // Se a imagem já for menor que 120 KB e couber nas dimensões, preserva original
        if (width <= maxWidth && height <= maxHeight && file.size < 120 * 1024) {
          resolve(file);
          return;
        }

        // Calcula novas dimensões mantendo aspect ratio
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        // Converte para WebP (com fallback transparente caso não suporte)
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            const cleanName = file.name.replace(/\.[^/.]+$/, "");
            const newFile = new File([blob], `${cleanName}.webp`, {
              type: "image/webp",
              lastModified: Date.now(),
            });
            resolve(newFile);
          },
          "image/webp",
          quality
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function upload(path: string, file: File, contentType: string, onProgress?: UploadProgress) {
  const fileRef = ref(storage(), path);
  const task = uploadBytesResumable(fileRef, file, { contentType });
  return new Promise<string>((resolve, reject) => {
    task.on(
      "state_changed",
      (snap) => onProgress?.(snap.totalBytes ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100) : 0),
      reject,
      () => getDownloadURL(task.snapshot.ref).then(resolve, reject),
    );
  });
}

const restaurantId = () => (typeof window !== "undefined" ? localStorage.getItem("kardap-restaurant-id") : null) || "unassigned";

export type VideoUploadTask = {
  promise: Promise<string>;
  cancel: () => void;
};

/**
 * Inicia upload assíncrono e retomável de vídeo com controle de cancelamento e progresso real.
 */
export function startResumableVideoUpload(file: File, onProgress?: UploadProgress): VideoUploadTask {
  if (!file.type.match(/^video\/(mp4|webm|quicktime)$/) || file.size > 100 * 1024 * 1024) {
    throw new Error("Envie um vídeo MP4, WebM ou MOV de até 100 MB.");
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `restaurantes/${restaurantId()}/produtos/videos/${crypto.randomUUID()}-${safeName}`;
  const fileRef = ref(storage(), path);
  const task = uploadBytesResumable(fileRef, file, { contentType: file.type || "video/mp4" });

  const promise = new Promise<string>((resolve, reject) => {
    task.on(
      "state_changed",
      (snap) => onProgress?.(snap.totalBytes ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100) : 0),
      reject,
      () => getDownloadURL(task.snapshot.ref).then(resolve, reject),
    );
  });

  return {
    promise,
    cancel: () => task.cancel(),
  };
}

export async function uploadProductVideo(file: File, onProgress?: UploadProgress) {
  const task = startResumableVideoUpload(file, onProgress);
  return task.promise;
}

export async function uploadProductImage(file: File, onProgress?: UploadProgress) {
  if (!file.type.match(/^image\/(png|jpe?g|webp)$/) || file.size > 10 * 1024 * 1024) {
    throw new Error("Envie uma imagem PNG, JPG ou WebP de até 10 MB.");
  }
  const processed = await compressAndResizeImage(file, { maxWidth: 1600, maxHeight: 1600, quality: 0.82 });
  const safeName = processed.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  return upload(`restaurantes/${restaurantId()}/produtos/imagens/${crypto.randomUUID()}-${safeName}`, processed, processed.type, onProgress);
}

export async function uploadRestaurantImage(file: File, kind: "logos" | "capas", onProgress?: UploadProgress) {
  if (!file.type.match(/^image\/(png|jpe?g|webp)$/) || file.size > 10 * 1024 * 1024) {
    throw new Error("Envie uma imagem PNG, JPG ou WebP de até 10 MB.");
  }
  const isLogo = kind === "logos";
  const processed = await compressAndResizeImage(file, {
    maxWidth: isLogo ? 600 : 1920,
    maxHeight: isLogo ? 600 : 1080,
    quality: isLogo ? 0.88 : 0.82,
  });
  const safeName = processed.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  return upload(`restaurantes/${restaurantId()}/${kind}/${crypto.randomUUID()}-${safeName}`, processed, processed.type, onProgress);
}
