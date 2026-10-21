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

// ───────────────────────── Feed em tela cheia aberto ─────────────────────────

/**
 * Com o feed aberto, a lista do cardápio fica escondida atrás dele: os vídeos dela saem da página (param de baixar
 * e liberam o decodificador) para não disputar a conexão com o vídeo da tela. Só quem usa `useFeedOpen` renderiza.
 */
let feedOpen = 0;
const feedSubscribers = new Set<() => void>();

/** Marca o feed como aberto até a função devolvida ser chamada (para usar num efeito). */
export function holdFeedOpen() {
  feedOpen++;
  feedSubscribers.forEach((fn) => fn());
  return () => {
    feedOpen--;
    feedSubscribers.forEach((fn) => fn());
  };
}

function subscribeFeed(fn: () => void) {
  feedSubscribers.add(fn);
  return () => feedSubscribers.delete(fn);
}

export function useFeedOpen() {
  return useSyncExternalStore(subscribeFeed, () => feedOpen > 0, () => false);
}

// ───────────────────────── Orçamento de pré-carregamento ─────────────────────────

/**
 * Quanto o feed pode adiantar além do vídeo na tela:
 * - "full": o próximo baixa alguns segundos e o anterior fica com o começo (troca instantânea);
 * - "light": só o começo do próximo (conexão 3G ou o vídeo atual travando);
 * - "minimal": nada além do vídeo na tela (economia de dados, 2G).
 */
export type PreloadBudget = "full" | "light" | "minimal";

// `downlink` fica de fora: no começo da sessão o Chrome estima ~1,4 Mbps mesmo em rede rápida (medido).
type Connection = EventTarget & { saveData?: boolean; effectiveType?: string };

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
  if (c?.effectiveType === "3g") return "light";
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

/** O orçamento agora, sem assinar mudanças (para decisões tomadas uma vez, como a versão do vídeo). */
export function currentPreloadBudget(): PreloadBudget {
  if (!subscribers.size) budget = compute();
  return budget;
}

// ───────────────────────── Versão do vídeo ─────────────────────────

/** Versão extra publicada pelo worker (services/video-worker/src/contract.ts, `PublishedVariant`). */
export type VideoVariant = { kind: string; codec: "h264" | "av1"; width: number; height: number; size: number; url: string };
export type VideoSourceInfo = {
  videoUrl?: string;
  video?: { width: number; height: number; duration?: number; optimizedSize?: number; variants?: VideoVariant[] } | null;
};

/** Teto de bitrate médio no orçamento "light": a versão precisa caber numa conexão de ~1,6 Mbps com folga. */
const LIGHT_MAX_BITRATE = 1_300_000;

/**
 * AV1 só onde o aparelho decodifica com eficiência (hardware): em celular simples, decodificar AV1 por software
 * gasta bateria e pode engasgar, e aí o H.264 é melhor mesmo sendo maior. Sem a API, fica no H.264.
 */
let av1Efficient = false;
if (typeof navigator !== "undefined" && navigator.mediaCapabilities?.decodingInfo) {
  navigator.mediaCapabilities
    .decodingInfo({ type: "file", video: { contentType: 'video/mp4; codecs="av01.0.05M.08"', width: 1280, height: 720, bitrate: 1_200_000, framerate: 30 } })
    .then((r) => {
      av1Efficient = r.supported && r.smooth && r.powerEfficient;
    })
    .catch(() => undefined);
}

/**
 * Qual arquivo tocar. Sem versões extras (vídeos antigos ou worker sem `VIDEO_VARIANTS`), sempre `videoUrl`.
 * "minimal": o menor arquivo. "light": a maior resolução que cabe no teto de bitrate. "full": a maior resolução;
 * entre arquivos do mesmo tamanho de imagem, o menor (AV1, onde vale a pena). A lista e o feed usam a mesma regra,
 * então o feed reaproveita o que a lista baixou. A escolha é feita ao criar o player: trocar de arquivo no meio
 * recomeçaria o download.
 */
export function pickVideoSource(dish: VideoSourceInfo, budget: PreloadBudget): string {
  const main = dish.videoUrl || "";
  const video = dish.video;
  if (!main || !video?.variants?.length || !video.optimizedSize) return main;
  const duration = Math.max(1, video.duration || 1);
  const options = [
    { url: main, short: Math.min(video.width, video.height), size: video.optimizedSize },
    ...video.variants.filter((v) => v.url && (v.codec !== "av1" || av1Efficient)).map((v) => ({ url: v.url, short: Math.min(v.width, v.height), size: v.size })),
  ];
  const smallest = options.reduce((a, b) => (b.size < a.size ? b : a));
  if (budget === "minimal") return smallest.url;
  const fits = budget === "light" ? options.filter((o) => (o.size * 8) / duration <= LIGHT_MAX_BITRATE) : options;
  if (!fits.length) return smallest.url;
  return fits.reduce((a, b) => (b.short > a.short || (b.short === a.short && b.size < a.size) ? b : a)).url;
}
