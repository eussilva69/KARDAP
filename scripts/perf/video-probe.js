// Sonda de desempenho dos vídeos do cardápio (docs/VIDEOS.md, "Medição").
// Não faz parte do app: scripts/perf-reels.mjs injeta este arquivo antes da página carregar, e no
// desenvolvimento dá para colar no console do navegador. Lê só o DOM e os eventos dos <video>.
//
// window.__kdProbe.snapshot() devolve:
//   activations: cada prato que ficou ativo no feed, com o tempo até o primeiro quadro (ms) e as travadas.
//   maxPlaying / maxVideos: maior número de vídeos tocando ao mesmo tempo / de elementos <video> na página.
//   maxReelVideos: maior número de elementos <video> dentro do feed (.kd-reels).
//   longTasks / longTaskMs: tarefas acima de 50 ms na thread principal.
//   maxEventMs: interação mais lenta (Event Timing), aproximação do INP.
(() => {
  if (window.__kdProbe) return;
  const now = () => performance.now();
  const P = {
    marks: {},
    activations: [],
    maxPlaying: 0,
    maxVideos: 0,
    maxReelVideos: 0,
    playingNow: 0,
    videosNow: 0,
    longTasks: 0,
    longTaskMs: 0,
    maxEventMs: 0,
    mediaErrors: [],
    mark(name) {
      P.marks[name] = now();
    },
    reset() {
      P.activations = [];
      P.maxPlaying = 0;
      P.maxVideos = 0;
      P.maxReelVideos = 0;
      P.longTasks = 0;
      P.longTaskMs = 0;
      P.maxEventMs = 0;
      P.mediaErrors = [];
      current = null;
    },
    snapshot() {
      return JSON.parse(JSON.stringify({ ...P, now: now() }));
    },
  };
  let current = null;
  const activeSection = () => document.querySelector('.kd-reel[aria-hidden="false"]');
  const activeVideo = () => activeSection()?.querySelector("video") || null;

  const tick = () => {
    const videos = document.querySelectorAll("video");
    let playing = 0;
    videos.forEach((v) => {
      if (!v.paused && !v.ended && v.readyState > 2) playing++;
    });
    P.playingNow = playing;
    P.videosNow = videos.length;
    P.maxPlaying = Math.max(P.maxPlaying, playing);
    P.maxVideos = Math.max(P.maxVideos, videos.length);
    P.reelVideosNow = document.querySelectorAll(".kd-reels video").length;
    P.maxReelVideos = Math.max(P.maxReelVideos, P.reelVideosNow);
    const section = activeSection();
    if (section) {
      const index = Number(section.dataset.index);
      if (!current || current.index !== index) {
        current = { index, name: section.getAttribute("aria-label") || "", at: now(), firstFrame: null, stalls: 0, stallMs: 0, stallFrom: null };
        P.activations.push(current);
      }
      const v = section.querySelector("video");
      if (v && current.firstFrame === null && !v.paused && v.readyState >= 2 && v.currentTime > 0) current.firstFrame = Math.round(now() - current.at);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // Eventos de mídia não sobem na árvore: captura no documento.
  document.addEventListener(
    "waiting",
    (e) => {
      if (e.target !== activeVideo() || !current || current.firstFrame === null || current.stallFrom !== null) return;
      current.stallFrom = now();
      current.stalls++;
    },
    true,
  );
  document.addEventListener(
    "playing",
    (e) => {
      if (e.target !== activeVideo() || !current || current.stallFrom === null) return;
      current.stallMs += Math.round(now() - current.stallFrom);
      current.stallFrom = null;
    },
    true,
  );
  document.addEventListener(
    "error",
    (e) => {
      if (e.target instanceof HTMLVideoElement) P.mediaErrors.push({ code: e.target.error?.code || 0, src: String(e.target.currentSrc || e.target.src).slice(-60) });
    },
    true,
  );

  try {
    new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        P.longTasks++;
        P.longTaskMs += Math.round(entry.duration);
      });
    }).observe({ type: "longtask", buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        if (entry.interactionId) P.maxEventMs = Math.max(P.maxEventMs, Math.round(entry.duration));
      });
    }).observe({ type: "event", durationThreshold: 16, buffered: true });
  } catch {}

  window.__kdProbe = P;
})();
