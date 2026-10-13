/**
 * Coordenação de reprodução no cardápio: no máximo um vídeo tocando por vez,
 * e vídeos que saem da tela devolvem rede e memória ao aparelho.
 */

let playing: HTMLVideoElement | null = null;

/** Toca este vídeo e pausa o que estava tocando antes. */
export function playExclusive(video: HTMLVideoElement) {
  if (playing && playing !== video) playing.pause();
  playing = video;
  return video.play().catch(() => undefined);
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
