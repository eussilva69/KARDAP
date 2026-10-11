"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ConciergeBell, Play, Volume2, VolumeX } from "lucide-react";
import { brl, productCents } from "@/lib/format";
import { useDialog } from "@/lib/hooks";
import type { Dish } from "./dish-row";

function Slide({
  dish,
  index,
  active,
  near,
  muted,
  autoplay,
  canCall,
  onCall,
}: {
  dish: Dish;
  index: number;
  active: boolean;
  near: boolean;
  muted: boolean;
  autoplay: boolean;
  canCall: boolean;
  onCall: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  // Com movimento reduzido ou economia de dados, o vídeo só toca quando o cliente pede.
  const [requested, setRequested] = useState(false);
  const [playing, setPlaying] = useState(false);
  const shouldPlay = active && (autoplay || requested);
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (shouldPlay) {
      el.play().catch(() => undefined);
    } else {
      el.pause();
      if (!active) {
        try {
          el.currentTime = 0;
        } catch (_) {}
      }
    }
  }, [shouldPlay, near, active]);
  useEffect(() => {
    if (!active) setRequested(false);
  }, [active]);

  return (
    <section className="kd-slide" data-index={index} aria-label={dish.name} aria-hidden={!active}>
      <div className="kd-slide-media">
        {dish.videoUrl && near ? (
          <video
            ref={video}
            src={dish.videoUrl}
            poster={dish.image || undefined}
            muted={muted}
            loop
            playsInline
            preload={active ? "auto" : "metadata"}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onClick={() => !autoplay && setRequested((r) => !r)}
          />
        ) : dish.image ? (
          <img src={dish.image} alt="" loading={near ? "eager" : "lazy"} decoding="async" />
        ) : null}
        {dish.videoUrl && !autoplay && !playing && active && (
          <button type="button" className="kd-slide-play" onClick={() => setRequested(true)}>
            <Play size={18} fill="currentColor" aria-hidden /> Ver vídeo
          </button>
        )}
      </div>
      <div className="kd-slide-info">
        {dish.category && <p className="kd-overline">{dish.category}</p>}
        <h2 className="kd-slide-name">{dish.name}</h2>
        {dish.description && <p className="kd-slide-desc">{dish.description}</p>}
        <div className="kd-slide-foot">
          <p className="kd-slide-price kd-num">{brl(productCents(dish))}</p>
          {canCall && (
            <button type="button" className="kd-btn kd-btn--signal" onClick={onCall} tabIndex={active ? 0 : -1}>
              <ConciergeBell size={17} aria-hidden />
              <span>Chamar para pedir</span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Pratos em tela cheia, um por vez, deslizando na vertical. Só o vídeo do prato visível toca;
 * os vizinhos ficam pré-carregados e o restante nem é criado.
 */
export function DishViewer({
  dishes,
  startIndex,
  autoplay,
  canCall,
  onCall,
  onClose,
}: {
  dishes: Dish[];
  startIndex: number;
  autoplay: boolean;
  canCall: boolean;
  onCall: (dish: Dish) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(startIndex);
  const [muted, setMuted] = useState(true);
  useDialog(ref, onClose);

  useLayoutEffect(() => {
    const slide = track.current?.children[startIndex] as HTMLElement | undefined;
    if (slide && track.current) track.current.scrollTop = slide.offsetTop;
  }, [startIndex]);

  useEffect(() => {
    const root = track.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setIndex(Number((entry.target as HTMLElement).dataset.index));
        });
      },
      { root, threshold: 0.6 },
    );
    Array.from(root.children).forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, [dishes]);

  const go = (next: number) => {
    const slide = track.current?.children[Math.max(0, Math.min(dishes.length - 1, next))] as HTMLElement | undefined;
    slide?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const current = dishes[index];
  return (
    <div
      ref={ref}
      className="kd-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={`Prato: ${current?.name || ""}`}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "PageDown") {
          event.preventDefault();
          go(index + 1);
        } else if (event.key === "ArrowUp" || event.key === "PageUp") {
          event.preventDefault();
          go(index - 1);
        }
      }}
    >
      <div className="kd-viewer-bar">
        <button type="button" className="kd-viewer-btn" onClick={onClose} aria-label="Voltar ao cardápio" data-autofocus>
          <ChevronLeft size={22} />
        </button>
        <span className="kd-viewer-count kd-num" aria-live="polite">
          {index + 1} de {dishes.length}
        </span>
        {current?.videoUrl ? (
          <button type="button" className="kd-viewer-btn" onClick={() => setMuted((m) => !m)} aria-label={muted ? "Ativar som" : "Desativar som"} aria-pressed={!muted}>
            {muted ? <VolumeX size={19} /> : <Volume2 size={19} />}
          </button>
        ) : (
          <span className="kd-viewer-btn-spacer" aria-hidden />
        )}
      </div>
      <div className="kd-viewer-track" ref={track}>
        {dishes.map((dish, i) => (
          <Slide
            key={dish.id || `${dish.name}-${i}`}
            dish={dish}
            index={i}
            active={i === index}
            near={Math.abs(i - index) <= 1}
            muted={muted}
            autoplay={autoplay}
            canCall={canCall}
            onCall={() => onCall(dish)}
          />
        ))}
      </div>
      {index === 0 && dishes.length > 1 && <p className="kd-viewer-hint">Deslize para cima para ver o próximo prato</p>}
    </div>
  );
}
