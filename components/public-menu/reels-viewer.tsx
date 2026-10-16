"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, ImageOff, LoaderCircle, Play, RotateCw, Volume2, VolumeX, X } from "lucide-react";
import type { RestaurantProduct } from "@/lib/restaurant-db";

/* Visualizador de produtos em tela cheia, no padrão do Instagram Reels.
   Somente apresentação: não há carrinho, pedido ou pagamento aqui. */

const DURATION = 300; // ms da transição entre produtos
const SWIPE_DISTANCE = 70; // px
const SWIPE_VELOCITY = 0.45; // px/ms para um gesto rápido e curto
const HINT_KEY = "kardap-reels-hint-seen";

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function ReelsViewer({
  items,
  startIndex,
  priceOf,
  onClose,
}: {
  items: RestaurantProduct[];
  startIndex: number;
  priceOf: (product: RestaurantProduct) => string;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(() => Math.min(Math.max(startIndex, 0), items.length - 1));
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [muted, setMuted] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [hint, setHint] = useState(false);
  const locked = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const gesture = useRef<{ id: number; y: number; x: number; t: number; active: boolean } | null>(null);
  const wheel = useRef({ acc: 0, last: 0, cooldownUntil: 0 });
  const close = useRef(onClose);
  close.current = onClose;

  const go = useCallback(
    (direction: 1 | -1) => {
      if (locked.current) return;
      const next = index + direction;
      setDrag(0);
      if (next < 0 || next >= items.length) return;
      locked.current = true;
      setIndex(next);
      setExpanded(false);
      setMuted(true); // cada produto novo começa sem áudio
      setHint(false);
      window.setTimeout(() => (locked.current = false), reducedMotion() ? 60 : DURATION + 40);
    },
    [index, items.length],
  );

  // Abertura: trava a rolagem da página (o cardápio mantém a posição), foco no fechar, dica na primeira vez.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus({ preventScroll: true });
    try {
      if (items.length > 1 && !localStorage.getItem(HINT_KEY)) setHint(true);
    } catch {}
    const onVisibility = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.body.style.overflow = overflow;
      previous?.focus?.({ preventScroll: true });
    };
  }, [items.length]);

  useEffect(() => {
    if (hint) return;
    try {
      localStorage.setItem(HINT_KEY, "1");
    } catch {}
  }, [hint]);

  // Teclado: setas / PageUp / PageDown navegam, Esc fecha.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
      else if (event.key === "ArrowDown" || event.key === "PageDown") {
        event.preventDefault();
        go(1);
      } else if (event.key === "ArrowUp" || event.key === "PageUp") {
        event.preventDefault();
        go(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  // Roda do mouse / trackpad: um produto por gesto, ignorando a inércia do trackpad.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onWheel = (event: WheelEvent) => {
      if ((event.target as HTMLElement).closest(".rv-desc.is-open")) return;
      event.preventDefault();
      const now = Date.now();
      const state = wheel.current;
      const idle = now - state.last > 180;
      state.last = now;
      if (now < state.cooldownUntil && !idle) return;
      if (idle) state.acc = 0;
      state.acc += event.deltaY;
      if (Math.abs(state.acc) > 40) {
        go(state.acc > 0 ? 1 : -1);
        state.acc = 0;
        state.cooldownUntil = now + 450;
      }
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, [go]);

  // Gestos de toque/arraste (pointer events cobrem toque, caneta e mouse).
  const onPointerDown = (event: React.PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button, a, .rv-desc.is-open")) return;
    gesture.current = { id: event.pointerId, y: event.clientY, x: event.clientX, t: performance.now(), active: false };
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    const dy = event.clientY - g.y;
    const dx = event.clientX - g.x;
    if (!g.active) {
      // Só vira arraste com movimento claramente vertical: evita trocas acidentais.
      if (Math.abs(dy) < 10 || Math.abs(dy) < Math.abs(dx) * 1.2) return;
      g.active = true;
      setDragging(true);
      (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    }
    const atEdge = (dy > 0 && index === 0) || (dy < 0 && index === items.length - 1);
    setDrag(atEdge ? dy * 0.25 : dy);
  };
  const endGesture = (event: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.id !== event.pointerId || !g.active) return;
    setDragging(false);
    const dy = event.clientY - g.y;
    const velocity = Math.abs(dy) / Math.max(1, performance.now() - g.t);
    if (Math.abs(dy) > SWIPE_DISTANCE || (Math.abs(dy) > 25 && velocity > SWIPE_VELOCITY)) go(dy < 0 ? 1 : -1);
    else setDrag(0);
  };

  const current = items[index];
  const description = current?.description?.trim() || "";
  const price = current ? priceOf(current) : "";
  const coarse = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

  return (
    <div className="rv" role="dialog" aria-modal="true" aria-label="Produtos do cardápio">
      <div
        ref={rootRef}
        className={`rv-stage ${dragging ? "is-dragging" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
      >
        {/* Só o produto atual e os vizinhos ficam montados: o resto não consome rede nem memória. */}
        {[index - 1, index, index + 1].map((i) => {
          const product = items[i];
          if (!product) return null;
          const offset = i - index;
          return (
            <div
              key={product.id}
              className="rv-slide"
              aria-hidden={offset !== 0}
              // +2px por posição evita a fresta de 1px do vizinho por arredondamento de subpixel.
              style={{ transform: `translate3d(0, calc(${offset * 100}% + ${offset * 2 + drag}px), 0)` }}
            >
              <ReelMedia product={product} active={offset === 0 && pageVisible} current={offset === 0} offset={offset} muted={muted} onMutedChange={setMuted} />
            </div>
          );
        })}

        <div className="rv-top">
          <button type="button" ref={closeRef} className="rv-icon" onClick={onClose} aria-label="Voltar ao cardápio">
            <X size={24} />
          </button>
          {items.length > 1 && (
            <span className="rv-counter" aria-hidden>
              {index + 1} / {items.length}
            </span>
          )}
        </div>

        {items.length > 1 && (
          <div className="rv-arrows">
            <button type="button" className="rv-icon" onClick={() => go(-1)} disabled={index === 0} aria-label="Produto anterior">
              <ChevronUp size={22} />
            </button>
            <button type="button" className="rv-icon" onClick={() => go(1)} disabled={index === items.length - 1} aria-label="Próximo produto">
              <ChevronDown size={22} />
            </button>
          </div>
        )}

        {current && (
          <div className="rv-info" style={{ transform: dragging ? `translate3d(0, ${drag * 0.15}px, 0)` : undefined }}>
            <p className="rv-sr" aria-live="polite">
              Produto {index + 1} de {items.length}: {current.name}
              {price ? `, ${price}` : ""}
            </p>
            <h2 className="rv-name">{current.name}</h2>
            {description && (
              <div className={`rv-desc ${expanded ? "is-open" : ""}`}>
                <p>{description}</p>
                {(description.length > 110 || description.includes("\n")) && (
                  <button type="button" className="rv-more" onClick={() => setExpanded((open) => !open)} aria-expanded={expanded}>
                    {expanded ? "Ver menos" : "Ver mais"}
                  </button>
                )}
              </div>
            )}
            {price && <p className="rv-price">{price}</p>}
          </div>
        )}

        {hint && (
          <button type="button" className="rv-hint" onClick={() => setHint(false)}>
            <ChevronUp size={18} aria-hidden />
            {coarse ? "Deslize para cima para ver mais produtos." : "Use a roda do mouse ou as setas para ver mais produtos."}
            <span className="rv-hint-close" aria-label="Dispensar dica">
              <X size={14} aria-hidden />
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

/* ───────────── Mídia de um produto ───────────── */

function ReelMedia({
  product,
  active,
  current,
  offset,
  muted,
  onMutedChange,
}: {
  product: RestaurantProduct;
  active: boolean;
  current: boolean;
  offset: number;
  muted: boolean;
  onMutedChange: (muted: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false); // autoplay recusado pelo navegador
  const [hasAudio, setHasAudio] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const showVideo = Boolean(product.videoUrl) && !videoFailed;

  // Apenas o vídeo ativo toca; ao sair dele, pausa.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !showVideo) return;
    if (active) {
      video.play().then(
        () => setBlocked(false),
        () => setBlocked(true),
      );
    } else {
      video.pause();
    }
  }, [active, showVideo, attempt]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  // Libera o buffer do vídeo quando o produto sai da janela de pré-carregamento.
  useEffect(() => {
    const video = videoRef.current;
    return () => {
      if (!video) return;
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [attempt]);

  const detectAudio = () => {
    const video = videoRef.current as (HTMLVideoElement & { mozHasAudio?: boolean; audioTracks?: { length: number } }) | null;
    if (!video) return;
    if (typeof video.mozHasAudio === "boolean") setHasAudio(video.mozHasAudio);
    else if (video.audioTracks) setHasAudio(video.audioTracks.length > 0);
  };

  if (showVideo)
    return (
      <>
        <video
          key={attempt}
          ref={videoRef}
          className="rv-media"
          src={product.videoUrl}
          poster={product.image || undefined}
          muted
          loop
          playsInline
          // Atual e próximo carregam; o anterior só os metadados.
          preload={offset >= 0 ? "auto" : "metadata"}
          aria-label={`Vídeo de ${product.name}`}
          onLoadedMetadata={detectAudio}
          onWaiting={() => setLoading(true)}
          onPlaying={() => {
            setLoading(false);
            setBlocked(false);
          }}
          onCanPlay={() => setLoading(false)}
          onError={() => setVideoFailed(true)}
        />
        {current && loading && !blocked && (
          <span className="rv-status" role="status" aria-label="Carregando vídeo">
            <LoaderCircle size={30} className="rv-spin" aria-hidden />
          </span>
        )}
        {current && blocked && (
          <button
            type="button"
            className="rv-status rv-play"
            onClick={() => videoRef.current?.play().then(() => setBlocked(false), () => setBlocked(true))}
            aria-label="Reproduzir vídeo"
          >
            <Play size={30} fill="currentColor" aria-hidden />
          </button>
        )}
        {current && hasAudio && (
          <button type="button" className="rv-icon rv-audio" onClick={() => onMutedChange(!muted)} aria-label={muted ? "Ativar som" : "Desativar som"} aria-pressed={!muted}>
            {muted ? <VolumeX size={22} /> : <Volume2 size={22} />}
          </button>
        )}
      </>
    );

  return (
    <>
      {product.image && !imageFailed ? (
        <img className="rv-media" src={product.image} alt={product.name} decoding="async" onError={() => setImageFailed(true)} />
      ) : (
        // Sem mídia cadastrada: fundo neutro, sem simular uma foto.
        <span className="rv-fallback" aria-hidden>
          <ImageOff size={34} strokeWidth={1.5} />
        </span>
      )}
      {product.videoUrl && videoFailed && current && (
        <div className="rv-error" role="alert">
          <span>Não foi possível carregar o vídeo.</span>
          <button
            type="button"
            onClick={() => {
              setVideoFailed(false);
              setLoading(true);
              setAttempt((n) => n + 1);
            }}
          >
            <RotateCw size={14} aria-hidden /> Tentar de novo
          </button>
        </div>
      )}
    </>
  );
}
