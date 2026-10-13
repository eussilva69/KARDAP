"use client";

/**
 * Envio de vídeos de produto: do navegador direto para o Firebase Storage.
 *
 * O envio vive fora dos componentes (o formulário pode fechar e a pessoa pode navegar pelo painel)
 * e é exposto por `useVideoUploads()`. Depois que o arquivo chega ao Storage, o worker no Cloud Run
 * otimiza e publica; o painel acompanha pelo Firestore (`watchVideoJobs`).
 *
 * O navegador só grava os status pending/uploading/canceled e a falha de envio. "processing",
 * "retrying" e "ready" são exclusivos do worker (regras do Firestore).
 */
import { useSyncExternalStore } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { connectStorageEmulator, deleteObject, getStorage, ref, uploadBytesResumable, type UploadTask } from "firebase/storage";
import { EMULATOR_HOST, getDb, getFirebaseApp, useEmulators } from "./firebase";
import { getFirebaseAuth } from "./auth";
import { getRestaurantId } from "./restaurant-db";
import { withWriteTimeout } from "./async";
import {
  VIDEO_FORMATS,
  VIDEO_LIMITS,
  videoPaths,
  type ProductVideoDoc,
  type PublishedVideo,
  type VideoExtension,
} from "@/services/video-worker/src/contract";

export { VIDEO_ERROR_MESSAGES, VIDEO_LIMITS } from "@/services/video-worker/src/contract";
export type { ProductVideoDoc, PublishedVideo, VideoStatus } from "@/services/video-worker/src/contract";

const MB = 1024 * 1024;
export const VIDEO_ACCEPT = "video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm";
export const VIDEO_HINT = `MP4, MOV ou WebM · ${VIDEO_LIMITS.maxBytes / MB} MB · ${VIDEO_LIMITS.maxDurationSeconds / 60} min`;

let videoStorage: ReturnType<typeof getStorage> | null = null;
function storage() {
  if (videoStorage) return videoStorage;
  const app = getFirebaseApp();
  // Instância própria (identificada pelo bucket): vídeos toleram mais tempo de reconexão que imagens.
  videoStorage = getStorage(app, `gs://${app.options.storageBucket}`);
  if (useEmulators) connectStorageEmulator(videoStorage, EMULATOR_HOST, 9199);
  videoStorage.maxUploadRetryTime = 2 * 60_000;
  videoStorage.maxOperationRetryTime = 60_000;
  return videoStorage;
}

// ───────────────────────── Validação do arquivo ─────────────────────────

export class VideoFileError extends Error {}

/** Formato real pelo conteúdo do arquivo (não pela extensão nem pelo tipo informado). */
export async function detectVideoFormat(file: Blob): Promise<VideoExtension | null> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const ascii = (from: number, to: number) => String.fromCharCode.apply(null, Array.from(head.slice(from, to)));
  if (head.length >= 12 && ascii(4, 8) === "ftyp") {
    return ascii(8, 12) === "qt  " ? "mov" : "mp4";
  }
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return "webm";
  return null;
}

/** Duração pelo próprio navegador; null se ele não souber ler (ex.: HEVC no Chrome). O worker confere de novo. */
function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const done = (value: number | null) => {
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = setTimeout(() => done(null), 6000);
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => done(null);
    video.src = url;
  });
}

export async function validateVideoFile(file: File): Promise<{ ext: VideoExtension; contentType: string }> {
  if (!file.size) throw new VideoFileError("O arquivo está vazio.");
  if (file.size > VIDEO_LIMITS.maxBytes) throw new VideoFileError(`O vídeo tem ${(file.size / MB).toFixed(0)} MB; o máximo é ${VIDEO_LIMITS.maxBytes / MB} MB.`);
  const ext = await detectVideoFormat(file);
  if (!ext) throw new VideoFileError("Esse arquivo não é um vídeo MP4, MOV ou WebM.");
  const duration = await readDuration(file);
  if (duration !== null && duration > VIDEO_LIMITS.maxDurationSeconds + 0.5) {
    throw new VideoFileError(`O vídeo tem ${Math.round(duration)} s; o máximo é ${VIDEO_LIMITS.maxDurationSeconds / 60} min.`);
  }
  return { ext, contentType: VIDEO_FORMATS[ext] };
}

// ───────────────────────── Estado dos envios ─────────────────────────

export type UploadPhase = "preparing" | "uploading" | "paused" | "offline" | "uploaded" | "error" | "canceled";

export type UploadItem = {
  videoId: string;
  productId: string;
  productName: string;
  fileName: string;
  bytes: number;
  total: number;
  phase: UploadPhase;
  error?: string;
  file: File;
  startedAt: number;
};

const tasks = new Map<string, UploadTask>();
const autoPaused = new Set<string>();
let items: UploadItem[] = [];
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}
function patch(videoId: string, change: Partial<UploadItem>) {
  items = items.map((it) => (it.videoId === videoId ? { ...it, ...change } : it));
  emit();
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const EMPTY: UploadItem[] = [];

/** Envios desta aba (somem da lista quando o painel confirma o resultado ou a pessoa dispensa). */
export function useVideoUploads() {
  return useSyncExternalStore(subscribe, () => items, () => EMPTY);
}

export const isActive = (p: UploadPhase) => p === "preparing" || p === "uploading" || p === "paused" || p === "offline";

export function dismissUpload(videoId: string) {
  items = items.filter((it) => it.videoId !== videoId);
  emit();
}

// Sem conexão: pausa os envios e retoma sozinho quando a internet volta.
if (typeof window !== "undefined") {
  window.addEventListener("offline", () => {
    tasks.forEach((task, id) => {
      const item = items.find((it) => it.videoId === id);
      if (item?.phase === "uploading" && task.pause()) {
        autoPaused.add(id);
        patch(id, { phase: "offline" });
      }
    });
  });
  window.addEventListener("online", () => {
    autoPaused.forEach((id) => {
      tasks.get(id)?.resume();
      patch(id, { phase: "uploading" });
    });
    autoPaused.clear();
  });
  window.addEventListener("beforeunload", (event) => {
    if (items.some((it) => isActive(it.phase))) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
}

// ───────────────────────── Firestore ─────────────────────────

const videosCol = () => collection(getDb(), "restaurantes", getRestaurantId(), "videos");
const IN_FLIGHT = ["pending", "uploading", "processing", "retrying"];

/** Cancela envios e processamentos em andamento do produto (substituição ou remoção). */
async function cancelInFlight(productId: string, keep?: string) {
  for (const it of items) if (it.productId === productId && it.videoId !== keep && isActive(it.phase)) cancelUpload(it.videoId);
  const snap = await getDocs(query(videosCol(), where("productId", "==", productId), where("status", "in", IN_FLIGHT)));
  await Promise.all(
    snap.docs.filter((d) => d.id !== keep).map((d) => updateDoc(d.ref, { status: "canceled", updatedAt: serverTimestamp() }).catch(() => undefined)),
  );
}

export class DuplicateUploadError extends Error {}

/**
 * Inicia o envio e retorna assim que o registro foi criado; o progresso segue em `useVideoUploads()`.
 * Um vídeo novo substitui o que estiver em envio ou processamento para o mesmo produto.
 */
export async function startVideoUpload({ productId, productName, file }: { productId: string; productName: string; file: File }) {
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) throw new Error("Sua sessão expirou. Entre de novo para enviar o vídeo.");
  const same = items.find((it) => it.productId === productId && isActive(it.phase) && it.file.name === file.name && it.file.size === file.size && it.file.lastModified === file.lastModified);
  if (same) throw new DuplicateUploadError("Esse vídeo já está sendo enviado.");
  const { ext, contentType } = await validateVideoFile(file);

  const restaurantId = getRestaurantId();
  const videoRef = doc(videosCol());
  const videoId = videoRef.id;
  const paths = videoPaths(restaurantId, productId, videoId, ext);
  const fileName = file.name.replace(/[^\w.\- À-ÿ]/g, "").slice(0, 120) || `video.${ext}`;

  items = [{ videoId, productId, productName, fileName, bytes: 0, total: file.size, phase: "preparing", file, startedAt: Date.now() }, ...items];
  emit();

  try {
    await cancelInFlight(productId, videoId);
    // O registro vem antes do arquivo: a regra do Storage só aceita o envio se ele existir.
    await withWriteTimeout(
      setDoc(videoRef, {
        productId,
        status: "uploading",
        originalPath: paths.original,
        originalSize: file.size,
        contentType,
        fileName,
        createdBy: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      } satisfies Omit<ProductVideoDoc, "createdAt" | "updatedAt"> & { createdAt: unknown; updatedAt: unknown }),
    );
  } catch (error) {
    dismissUpload(videoId);
    throw error;
  }

  const task = uploadBytesResumable(ref(storage(), paths.original), file, {
    contentType,
    customMetadata: { videoId, productId, uploadedBy: uid, fileName },
  });
  tasks.set(videoId, task);
  patch(videoId, { phase: navigator.onLine ? "uploading" : "offline" });
  if (!navigator.onLine && task.pause()) autoPaused.add(videoId);

  task.on(
    "state_changed",
    (snap) => {
      const current = items.find((it) => it.videoId === videoId);
      const phase: UploadPhase = snap.state === "paused" ? (autoPaused.has(videoId) ? "offline" : "paused") : "uploading";
      if (current && isActive(current.phase)) patch(videoId, { bytes: snap.bytesTransferred, total: snap.totalBytes, phase });
    },
    (error) => {
      tasks.delete(videoId);
      autoPaused.delete(videoId);
      if (error.code === "storage/canceled") return patch(videoId, { phase: "canceled" });
      patch(videoId, { phase: "error", error: "O envio não terminou. Verifique a conexão e tente de novo." });
      updateDoc(videoRef, { status: "failed", error: "upload", updatedAt: serverTimestamp() }).catch(() => undefined);
    },
    () => {
      tasks.delete(videoId);
      patch(videoId, { phase: "uploaded", bytes: file.size });
      updateDoc(videoRef, { uploadCompletedAt: serverTimestamp(), updatedAt: serverTimestamp() }).catch(() => undefined);
    },
  );
  return videoId;
}

export function pauseUpload(videoId: string) {
  autoPaused.delete(videoId);
  if (tasks.get(videoId)?.pause()) patch(videoId, { phase: "paused" });
}

export function resumeUpload(videoId: string) {
  autoPaused.delete(videoId);
  if (tasks.get(videoId)?.resume()) patch(videoId, { phase: "uploading" });
}

export function cancelUpload(videoId: string) {
  autoPaused.delete(videoId);
  const task = tasks.get(videoId);
  if (task) task.cancel();
  patch(videoId, { phase: "canceled" });
  updateDoc(doc(videosCol(), videoId), { status: "canceled", updatedAt: serverTimestamp() }).catch(() => undefined);
}

/** Envia de novo o mesmo arquivo (ainda na memória desta aba) com um registro novo. */
export async function retryUpload(videoId: string) {
  const item = items.find((it) => it.videoId === videoId);
  if (!item) throw new Error("O arquivo não está mais disponível nesta aba. Escolha o vídeo de novo.");
  dismissUpload(videoId);
  return startVideoUpload({ productId: item.productId, productName: item.productName, file: item.file });
}

/** Acompanha os registros de vídeo do estabelecimento (status vindo do worker em tempo real). */
export function watchVideoJobs(onData: (jobs: (ProductVideoDoc & { id: string })[]) => void, onError: (error: Error) => void) {
  return onSnapshot(
    query(videosCol(), orderBy("createdAt", "desc"), limit(40)),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...(d.data() as ProductVideoDoc) }))),
    onError,
  );
}

/** Pede ao servidor para otimizar de novo um vídeo que falhou (o original ainda está guardado). */
export async function retryProcessing(videoId: string) {
  const token = await getFirebaseAuth().currentUser?.getIdToken();
  if (!token) throw new Error("Sua sessão expirou. Entre de novo.");
  const res = await fetch("/api/videos/retry", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ restaurantId: getRestaurantId(), videoId }),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(body.error || "Não foi possível tentar de novo. Envie o vídeo outra vez.");
}

/**
 * Remove o vídeo do produto: tira do cardápio, cancela envios em andamento e apaga os arquivos
 * gerados pela otimização. Vídeos antigos (enviados antes da otimização) só saem do cardápio;
 * o arquivo antigo fica no Storage.
 */
export async function discardProductVideo(productId: string, published?: PublishedVideo | null) {
  await cancelInFlight(productId);
  if (published?.id) {
    const s = storage();
    await Promise.all(
      [published.optimizedPath, published.thumbnailPath].filter(Boolean).map((path) => deleteObject(ref(s, path)).catch(() => undefined)),
    );
    await deleteDoc(doc(videosCol(), published.id)).catch(() => undefined);
  }
}
