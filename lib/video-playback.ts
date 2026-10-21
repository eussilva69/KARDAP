/**
 * Coordenação de reprodução no cardápio: no máximo um vídeo tocando por vez,
 * e vídeos que saem da tela devolvem rede e memória ao aparelho.
 */
import { useSyncExternalStore } from "react";

let playing: HTMLVideoElement | null = null;

/** Toca este vídeo e pausa o que estava tocando antes. */
export function playExclusive(video: HTMLVideoElement) {
  if (playing && playing !== video) playing.pause();
  playing = video;
  return video.play().catch(() => undefined);
}

/**
 * Como playExclusive, mas diz o que aconteceu. Se o navegador recusar o som sem um toque recente
 * (política de autoplay, comum no iPhone), toca sem som: "muted". "blocked": recusou tocar sozinho mesmo
 * sem som (iPhone em modo de economia de energia, por exemplo); só um toque inicia. "failed" inclui a pausa
 * que interrompe o carregamento (AbortError), que não é um problema.
 */
export async function playExclusiveReporting(video: HTMLVideoElement): Promise<"ok" | "muted" | "blocked" | "failed"> {
  if (playing && playing !== video) playing.pause();
  playing = video;
  try {
    await video.play();
    return "ok";
  } catch (error) {
    if ((error as { name?: string })?.name !== "NotAllowedError") return "failed";
    if (video.muted) return "blocked";
    video.muted = true;
    try {
      await video.play();
      return "muted";
    } catch (again) {
      return (again as { name?: string })?.name === "NotAllowedError" ? "blocked" : "failed";
    }
  }
}

export function pauseVideo(video: HTMLVideoElement) {
  video.pause();
  if (playing === video) playing = null;
}

/**
 * Interrompe o download em andamento e libera o decodificador (o React só remove o elemento).
 * Só age em elemento que já saiu da página: efeitos que rodam de novo com o vídeo na tela não o afetam.
 */
export function releaseVideo(video: HTMLVideoElement | null) {
  if (!video || video.isConnected) return;
  pauseVideo(video);
  video.removeAttribute("src");
  try {
    video.load();
  } catch {
    /* elemento já desanexado */
  }
}

// ───────────────────────── Orçamento de pré-carregamento ─────────────────────────

/**
 * Quanto o feed pode adiantar além do vídeo na tela:
 * - "full": o próximo baixa alguns segundos e o anterior fica com o começo (troca instantânea);
 * - "light": só o começo do próximo (conexão 3G, `downlink` baixo ou o vídeo atual travando);
 * - "minimal": nada além do vídeo na tela (economia de dados, 2G).
 */
export type PreloadBudget = "full" | "light" | "minimal";

type Connection = EventTarget & { saveData?: boolean; effectiveType?: string; downlink?: number };

/** Travadas recentes do vídeo na tela: sinal de rede ruim que funciona também onde não há `navigator.connection` (iPhone). */
const STALL_WINDOW_MS = 60_000;
const STALLS_TO_DEGRADE = 2;
let stalls: number[] = [];
let recoverTimer: ReturnType<typeof setTimeout> | undefined;
const subscribers = new Set<() => void>();
let budget: PreloadBudget = "full";

function connection() {
  return typeof navigator === "undefined" ? undefined : (navigator as Navigator & { connection?: Connection }).connection;
}

function compute(): PreloadBudget {
  const c = connection();
  if (c?.saveData || /(^|-)2g$/.test(c?.effectiveType || "")) return "minimal";
  if (c?.effectiveType === "3g" || (typeof c?.downlink === "number" && c.downlink > 0 && c.downlink < 1.5)) return "light";
  const now = Date.now();
  stalls = stalls.filter((t) => now - t < STALL_WINDOW_MS);
  return stalls.length >= STALLS_TO_DEGRADE ? "light" : "full";
}

function update() {
  const next = compute();
  if (next === budget) return;
  budget = next;
  subscribers.forEach((fn) => fn());
}

/** O vídeo na tela parou para carregar no meio da reprodução. */
export function reportStall() {
  stalls.push(Date.now());
  update();
  // Sem novas travadas por um minuto, volta a adiantar normalmente.
  clearTimeout(recoverTimer);
  recoverTimer = setTimeout(update, STALL_WINDOW_MS + 100);
}

function subscribe(fn: () => void) {
  subscribers.add(fn);
  const c = connection();
  if (subscribers.size === 1) {
    c?.addEventListener?.("change", update);
    update();
  }
  return () => {
    subscribers.delete(fn);
    if (!subscribers.size) c?.removeEventListener?.("change", update);
  };
}

export function usePreloadBudget(): PreloadBudget {
  return useSyncExternalStore(subscribe, () => budget, () => "full");
}
