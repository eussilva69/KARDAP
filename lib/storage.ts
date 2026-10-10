import { getDownloadURL, ref, uploadBytesResumable, type FirebaseStorage } from "firebase/storage";
import { getStorageService } from "./firebase";

export type UploadProgress = (percent: number) => void;

function storage(): FirebaseStorage {
  const service = getStorageService();
  // Sem isso o SDK tenta reenviar por até 10 minutos sem dar retorno ao usuário.
  service.maxUploadRetryTime = 30_000;
  service.maxOperationRetryTime = 30_000;
  return service;
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

const restaurantId = () => localStorage.getItem("kardap-restaurant-id") || "unassigned";

export async function uploadProductVideo(file: File, onProgress?: UploadProgress) {
  if (!file.type.match(/^video\/(mp4|webm|quicktime)$/) || file.size > 100 * 1024 * 1024) {
    throw new Error("Envie um vídeo MP4, WebM ou MOV de até 100 MB.");
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  return upload(`restaurantes/${restaurantId()}/produtos/videos/${crypto.randomUUID()}-${safeName}`, file, file.type || "video/mp4", onProgress);
}

export async function uploadProductImage(file: File, onProgress?: UploadProgress) {
  if (!file.type.match(/^image\/(png|jpe?g|webp)$/) || file.size > 10 * 1024 * 1024) {
    throw new Error("Envie uma imagem PNG, JPG ou WebP de até 10 MB.");
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  return upload(`restaurantes/${restaurantId()}/produtos/imagens/${crypto.randomUUID()}-${safeName}`, file, file.type, onProgress);
}

export async function uploadRestaurantImage(file: File, kind: "logos" | "capas", onProgress?: UploadProgress) {
  if (!file.type.match(/^image\/(png|jpe?g|webp)$/) || file.size > 10 * 1024 * 1024) {
    throw new Error("Envie uma imagem PNG, JPG ou WebP de até 10 MB.");
  }
  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  return upload(`restaurantes/${restaurantId()}/${kind}/${crypto.randomUUID()}.${extension}`, file, file.type, onProgress);
}
