"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Bookmark, ConciergeBell, Heart, LoaderCircle, Play, Send, ShoppingBag } from "lucide-react";
import { brl, initial, productCents } from "@/lib/format";
import { pauseVideo, playExclusiveReporting, releaseVideo } from "@/lib/video-playback";
import type { Dish } from "../dish-row";

const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
/** Descrições maiores que isso ganham o "mais" (cabem cerca de duas linhas no celular). */
const LONG_CAPTION = 90;
const HOLD_MS = 250;
const DOUBLE_TAP_MS = 300;

type Gesture = { x: number; y: number; moved: boolean; held: boolean; timer?: ReturnType<typeof setTimeout> };
type Burst = { id: number; x: number; y: number; tilt: number };

export type ReelSlideProps = {
  dish: Dish;
  index: number;
  active: boolean;
  /** Vizinho do atual: o elemento de vídeo existe (pré-carregado conforme `preload`). */
  near: boolean;
  /** Perto o bastante para montar o conteúdo; os demais são só o espaço do slide. */
  render: boolean;
  preload: "auto" | "metadata" | "none";
  play: boolean;
  /** Pausado pela pessoa (mostra o ícone de play). */
  paused: boolean;
  muted: boolean;
  liked: boolean;
  saved: boolean;
  likes: number;
  restaurantName: string;
  logo: string;
  canCall: boolean;
  /** "cart": o botão "Pedir" adiciona ao carrinho (delivery) em vez de chamar a equipe. */
  callKind?: "waiter" | "cart";
  onTap: () => void;
  onHold: (holding: boolean) => void;
  onLike: (dish: Dish, value?: boolean) => void;
  onShare: (dish: Dish) => void;
  onSave: (dish: Dish) => void;
  onCall: (dish: Dish) => void;
  onPlaying: (index: number) => void;
  onSoundBlocked: () => void;
};

/**
 * Um prato em tela cheia. Gestos como no Instagram: toque pausa/continua, dois toques curtem (com o coração
 * onde o dedo tocou), segurar pausa e esconde os botões para ver o prato inteiro. A barra de progresso é
 * desenhada direto no elemento a cada quadro (sem renderizar o React).
 */
export const ReelSlide = memo(function ReelSlide({
  dish,
  index,
  active,
  near,
  render,
  preload,
  play,
  paused,
  muted,
  liked,
  saved,
  likes,
  restaurantName,
  logo,
  canCall,
  callKind = "waiter",
  onTap,
  onHold,
  onLike,
  onShare,
  onSave,
  onCall,
  onPlaying,
  onSoundBlocked,
}: ReelSlideProps) {
  const video = useRef<HTMLVideoElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const lastTap = useRef<{ x: number; y: number; t: number } | null>(null);
  const tapTimer = useRef<ReturnType<typeof setTimeout>>();
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const poster = dish.videoPoster || dish.image || "";
  const hasVideo = Boolean(dish.videoUrl);
  // Vídeo horizontal numa tela em pé: aparece inteiro (sem corte) sobre a própria capa desfocada.
  const landscape = Boolean(dish.video && dish.video.width > dish.video.height);
  const tab = active ? 0 : -1;

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    el.muted = muted;
    if (play) {
      playExclusiveReporting(el).then((result) => {
        if (result === "muted" && !muted) onSoundBlocked();
      });
    } else {
      pauseVideo(el);
    }
  }, [play, muted, near, onSoundBlocked]);

  // Ao sair do slide: volta ao começo (como no Instagram) e recolhe a legenda.
  useEffect(() => {
    if (active) return;
    setExpanded(false);
    setBursts([]);
    const el = video.current;
    if (el) {
      try {
        el.currentTime = 0;
      } catch (_) {}
    }
    if (bar.current) bar.current.style.transform = "scaleX(0)";
  }, [active]);

  // Slide que sai do alcance: interrompe o download antes de o elemento sumir.
  useEffect(() => {
    const el = video.current;
    return () => releaseVideo(el);
  }, [near]);

  useEffect(() => () => clearTimeout(tapTimer.current), []);

  // Progresso e "carregando" só no slide atual.
  useEffect(() => {
    const el = video.current;
    const line = bar.current;
    if (!el || !active) {
      setBuffering(false);
      return;
    }
    let frame = 0;
    let wait: ReturnType<typeof setTimeout> | undefined;
    const draw = () => {
      if (line && el.duration) line.style.transform = `scaleX(${Math.min(1, el.currentTime / el.duration)})`;
      frame = requestAnimationFrame(draw);
    };
    const start = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    };
    const stop = () => cancelAnimationFrame(frame);
    const waiting = () => {
      clearTimeout(wait);
      wait = setTimeout(() => setBuffering(true), 450);
    };
    const ready = () => {
      clearTimeout(wait);
      setBuffering(false);
    };
    el.addEventListener("play", start);
    el.addEventListener("pause", stop);
    el.addEventListener("waiting", waiting);
    el.addEventListener("playing", ready);
    el.addEventListener("pause", ready);
    if (!el.paused) start();
    return () => {
      stop();
      clearTimeout(wait);
      el.removeEventListener("play", start);
      el.removeEventListener("pause", stop);
      el.removeEventListener("waiting", waiting);
      el.removeEventListener("playing", ready);
      el.removeEventListener("pause", ready);
    };
  }, [active, near]);

  const burst = (x: number, y: number) => {
    const id = performance.now() + Math.random();
    setBursts((list) => [...list.slice(-3), { id, x, y, tilt: Math.round(Math.random() * 36 - 18) }]);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    const g: Gesture = { x: event.clientX, y: event.clientY, moved: false, held: false };
    g.timer = setTimeout(() => {
      g.held = true;
      onHold(true);
    }, HOLD_MS);
    gesture.current = g;
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.moved) return;
    if (Math.abs(event.clientX - g.x) > 12 || Math.abs(event.clientY - g.y) > 12) {
      g.moved = true;
      clearTimeout(g.timer);
      if (g.held) {
        g.held = false;
        onHold(false);
      }
    }
  };

  const finish = (event: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    clearTimeout(g.timer);
    if (g.held) {
      onHold(false);
      return;
    }
    // Arrastar para o próximo prato (o navegador assume e cancela o toque) não é toque.
    if (cancelled || g.moved) return;
    const now = performance.now();
    const last = lastTap.current;
    lastTap.current = { x: event.clientX, y: event.clientY, t: now };
    if (last && now - last.t < DOUBLE_TAP_MS && Math.hypot(event.clientX - last.x, event.clientY - last.y) < 80) {
      // Dois toques (ou mais, em sequência): só curte, nunca descurte, e não pausa.
      clearTimeout(tapTimer.current);
      const rect = event.currentTarget.getBoundingClientRect();
      burst(event.clientX - rect.left, event.clientY - rect.top);
      onLike(dish, true);
      return;
    }
    clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => {
      lastTap.current = null;
      if (hasVideo) onTap();
    }, DOUBLE_TAP_MS);
  };

  const long = (dish.description || "").length > LONG_CAPTION;

  return (
    <section className={`kd-reel ${expanded ? "is-expanded" : ""}`} data-index={index} aria-label={dish.name} aria-hidden={!active}>
      {render && (
        <>
          <div className={`kd-reel-media ${landscape ? "is-landscape" : ""}`}>
            {poster ? (
              <img className="kd-reel-poster" src={poster} alt="" loading={near ? "eager" : "lazy"} decoding="async" draggable={false} />
            ) : (
              <span className="kd-reel-blank" aria-hidden>
                {initial(dish.name)}
              </span>
            )}
            {hasVideo && near && (
              <video
                ref={video}
                src={dish.videoUrl}
                poster={landscape ? undefined : poster || undefined}
                muted
                loop
                playsInline
                preload={preload}
                disablePictureInPicture
                controlsList="nodownload noplaybackrate"
                aria-hidden
                tabIndex={-1}
                onPlaying={() => active && onPlaying(index)}
              />
            )}
          </div>
          <div className="kd-reel-shade" aria-hidden />
          <div
            className="kd-reel-hit"
            aria-hidden
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(event) => finish(event, false)}
            onPointerCancel={(event) => finish(event, true)}
            onPointerLeave={(event) => event.pointerType === "mouse" && finish(event, true)}
            onContextMenu={(event) => event.preventDefault()}
          >
            {bursts.map((b) => (
              <span
                key={b.id}
                className="kd-reel-burst"
                style={{ left: b.x, top: b.y, "--tilt": `${b.tilt}deg` } as React.CSSProperties}
                onAnimationEnd={() => setBursts((list) => list.filter((item) => item.id !== b.id))}
              >
                <Heart size={96} fill="currentColor" strokeWidth={0} />
              </span>
            ))}
          </div>
          {paused && hasVideo && (
            <span className="kd-reel-state" aria-hidden>
              <Play size={30} fill="currentColor" strokeWidth={0} />
            </span>
          )}
          {buffering && !paused && (
            <span className="kd-reel-state is-loading" aria-hidden>
              <LoaderCircle size={30} className="k-spin" />
            </span>
          )}

          <div className="kd-reel-actions">
            <button type="button" className={`kd-reel-act ${liked ? "is-liked" : ""}`} aria-pressed={liked} aria-label={`Curtir ${dish.name}`} onClick={() => onLike(dish)} tabIndex={tab}>
              <Heart size={30} fill={liked ? "currentColor" : "none"} strokeWidth={liked ? 0 : 2} aria-hidden />
              <span className="kd-reel-act-label kd-num">{likes > 0 ? compact.format(likes) : "Curtir"}</span>
            </button>
            <button type="button" className="kd-reel-act" aria-label={`Enviar ${dish.name} para alguém`} onClick={() => onShare(dish)} tabIndex={tab}>
              <Send size={27} aria-hidden />
              <span className="kd-reel-act-label">Enviar</span>
            </button>
            <button type="button" className={`kd-reel-act ${saved ? "is-saved" : ""}`} aria-pressed={saved} aria-label={`Salvar ${dish.name}`} onClick={() => onSave(dish)} tabIndex={tab}>
              <Bookmark size={28} fill={saved ? "currentColor" : "none"} aria-hidden />
              <span className="kd-reel-act-label">{saved ? "Salvo" : "Salvar"}</span>
            </button>
            {canCall && (
              <button
                type="button"
                className="kd-reel-act"
                aria-label={callKind === "cart" ? `Adicionar ${dish.name} ao carrinho` : "Chamar a equipe para fazer o pedido"}
                onClick={() => onCall(dish)}
                tabIndex={tab}
              >
                {callKind === "cart" ? <ShoppingBag size={27} aria-hidden /> : <ConciergeBell size={27} aria-hidden />}
                <span className="kd-reel-act-label">Pedir</span>
              </button>
            )}
          </div>

          <div className="kd-reel-caption">
            <p className="kd-reel-who">
              <span className="kd-reel-avatar" aria-hidden>
                {logo ? <img src={logo} alt="" width={32} height={32} decoding="async" /> : initial(restaurantName)}
              </span>
              <span className="kd-reel-who-name">{restaurantName}</span>
            </p>
            <h2 className="kd-reel-name">{dish.name}</h2>
            <p className="kd-reel-price">
              <b className="kd-num">{brl(productCents(dish))}</b>
              {dish.category && <span> · {dish.category}</span>}
            </p>
            {dish.description && (
              <div className="kd-reel-desc-wrap">
                <p className={`kd-reel-desc ${long && !expanded ? "is-clamped" : ""}`}>{dish.description}</p>
                {long && (
                  <button type="button" className="kd-reel-more" aria-expanded={expanded} onClick={() => setExpanded((e) => !e)} tabIndex={tab}>
                    {expanded ? "menos" : "mais"}
                  </button>
                )}
              </div>
            )}
          </div>
          {hasVideo && (
            <span className="kd-reel-progress" aria-hidden>
              <span ref={bar} />
            </span>
          )}
        </>
      )}
    </section>
  );
});
