"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, Clapperboard, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { productCents } from "@/lib/format";
import { useConstrainedNetwork, useDialog } from "@/lib/hooks";
import { shareDish } from "@/lib/reels";
import type { Dish } from "../dish-row";
import { ReelSlide } from "./reel-slide";
import { SaveSheet } from "./save-sheet";
import { ShareSheet } from "./share-sheet";
import type { Engagement, RestaurantRef } from "./use-engagement";

export type ReelsMode = "reels" | "menu";
type Toast = { id: number; text: string; action?: { label: string; run: () => void } };

const SOUND_KEY = "kardap-reels-som";
const HINT_KEY = "kardap-reels-dica";

const readSession = (key: string) => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeSession = (key: string, value: string) => {
  try {
    sessionStorage.setItem(key, value);
  } catch {}
};

/**
 * Feed vertical de pratos em tela cheia, no padrão dos Reels: um por vez, deslizando para cima e para baixo.
 * "reels": só os pratos com vídeo (botão Reels do cardápio). "menu": todos os pratos (toque num prato da lista).
 *
 * Desempenho no celular: só o vídeo atual toca; o anterior e o próximo existem com pré-carregamento leve
 * (o próximo completo só com conexão boa e depois que o atual começou); slides mais distantes são só o espaço
 * reservado. Cada slide é memorizado e recebe apenas valores simples, então trocar de prato renderiza poucos.
 */
export function ReelsViewer({
  dishes,
  startIndex,
  mode,
  autoplay,
  restaurant,
  engagement,
  canCall,
  onCall,
  onClose,
  onShowSaved,
}: {
  dishes: Dish[];
  startIndex: number;
  mode: ReelsMode;
  autoplay: boolean;
  restaurant: RestaurantRef;
  engagement: Engagement;
  canCall: boolean;
  onCall: (dish: Dish) => void;
  onClose: () => void;
  onShowSaved: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(startIndex);
  const [muted, setMuted] = useState(() => readSession(SOUND_KEY) !== "1");
  const [paused, setPaused] = useState(!autoplay);
  const [holding, setHolding] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [activePlaying, setActivePlaying] = useState(false);
  const [sheet, setSheet] = useState<{ kind: "share" | "save"; dish: Dish } | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [hint] = useState(() => dishes.length > 1 && readSession(HINT_KEY) !== "1");
  const constrained = useConstrainedNetwork();
  const indexRef = useRef(index);
  indexRef.current = index;
  useDialog(ref, onClose);

  const { refresh, toggleLike, toggleSave, likeCount, liked, savedHere, account, notice, clearNotice } = engagement;
  const savedRef = useRef(savedHere);
  savedRef.current = savedHere;
  const accountRef = useRef(account);
  accountRef.current = account;

  useEffect(() => {
    if (hint) writeSession(HINT_KEY, "1");
    void refresh();
  }, [hint, refresh]);

  // Cada prato novo começa tocando (ou parado, sem reprodução automática).
  useEffect(() => {
    setPaused(!autoplay);
    setActivePlaying(false);
  }, [index, autoplay]);

  useEffect(() => {
    const update = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  // Abre já no prato escolhido, antes da primeira pintura.
  useLayoutEffect(() => {
    const root = track.current;
    if (root) root.scrollTop = startIndex * root.clientHeight;
  }, [startIndex]);

  // Prato atual: o slide com mais de 60% na tela (sem listeners de scroll).
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
  }, [dishes.length]);

  // Girar o celular ou a barra do navegador mudar a altura: continua alinhado no mesmo prato.
  useEffect(() => {
    const root = track.current;
    if (!root) return;
    const align = () => {
      root.scrollTop = indexRef.current * root.clientHeight;
    };
    window.addEventListener("orientationchange", align);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(align);
    observer?.observe(root);
    return () => {
      window.removeEventListener("orientationchange", align);
      observer?.disconnect();
    };
  }, []);

  const showToast = useCallback((next: Omit<Toast, "id">) => setToast({ ...next, id: Date.now() }), []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.action ? 5000 : 2600);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!notice) return;
    showToast({ text: notice });
    clearNotice();
  }, [notice, clearNotice, showToast]);

  const go = (next: number) => {
    const root = track.current;
    if (!root) return;
    const target = Math.max(0, Math.min(root.children.length - 1, next));
    root.scrollTo({ top: target * root.clientHeight, behavior: "smooth" });
  };

  const current = dishes[index] as Dish | undefined;
  const playing = !paused && !holding && !hidden;

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    writeSession(SOUND_KEY, next ? "0" : "1");
    // No iPhone o som só é liberado se o vídeo receber a ordem dentro do próprio toque.
    const el = track.current?.querySelector<HTMLVideoElement>(`[data-index="${index}"] video`);
    if (el) {
      el.muted = next;
      if (!next && playing) el.play().catch(() => undefined);
    }
  };

  const onTap = useCallback(() => setPaused((p) => !p), []);
  const onHold = useCallback((value: boolean) => setHolding(value), []);
  const onPlaying = useCallback((i: number) => i === indexRef.current && setActivePlaying(true), []);
  const onSoundBlocked = useCallback(() => {
    setMuted(true);
    showToast({ text: "Toque no alto-falante para ouvir o som" });
  }, [showToast]);

  const onLike = useCallback(
    (dish: Dish, value?: boolean) => {
      if (dish.id) toggleLike(dish.id, value);
    },
    [toggleLike],
  );

  const onShare = useCallback(
    async (dish: Dish) => {
      if (!dish.id) return;
      const result = await shareDish(restaurant.slug, dish.id, dish.name, restaurant.name);
      if (result === "fallback") setSheet({ kind: "share", dish });
    },
    [restaurant.slug, restaurant.name],
  );

  const onSave = useCallback(
    (dish: Dish) => {
      if (!dish.id) return;
      const value = !savedRef.current.has(dish.id);
      void toggleSave({ productId: dish.id, name: dish.name, priceCents: Math.round(productCents(dish)), image: dish.imageThumb || dish.videoPoster || dish.image || "" }, value);
      if (!value) showToast({ text: "Removido dos salvos" });
      else if (accountRef.current) showToast({ text: "Salvo na sua conta", action: { label: "Ver salvos", run: onShowSaved } });
      else showToast({ text: "Salvo neste celular", action: { label: "Salvar na conta", run: () => setSheet({ kind: "save", dish }) } });
    },
    [toggleSave, showToast, onShowSaved],
  );

  const onCallDish = useCallback((dish: Dish) => onCall(dish), [onCall]);

  return (
    <>
      <div
        ref={ref}
        className={`kd-reels ${holding ? "is-holding" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={mode === "reels" ? "Reels do cardápio" : "Pratos em tela cheia"}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget && (event.target as HTMLElement).closest("button, a, input")) {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          }
          if (event.key === "ArrowDown" || event.key === "PageDown" || event.key === "j") {
            event.preventDefault();
            go(index + 1);
          } else if (event.key === "ArrowUp" || event.key === "PageUp" || event.key === "k") {
            event.preventDefault();
            go(index - 1);
          } else if (event.key === " " && current?.videoUrl) {
            event.preventDefault();
            onTap();
          } else if (event.key === "m" && current?.videoUrl) {
            toggleMute();
          } else if (event.key === "l" && current) {
            onLike(current);
          }
        }}
      >
        <div className="kd-reels-bar">
          <button type="button" className="kd-reels-btn" onClick={onClose} aria-label="Voltar ao cardápio" data-autofocus>
            <ChevronLeft size={28} />
          </button>
          <p className="kd-reels-title">{mode === "reels" ? "Reels" : current?.category || "Cardápio"}</p>
          {current?.videoUrl ? (
            <button type="button" className="kd-reels-btn" onClick={toggleMute} aria-label={muted ? "Ativar som" : "Desativar som"} aria-pressed={!muted}>
              {muted ? <VolumeX size={22} /> : <Volume2 size={22} />}
            </button>
          ) : (
            <span className="kd-reels-btn-spacer" aria-hidden />
          )}
        </div>

        <div className="kd-reels-track" ref={track}>
          {dishes.map((dish, i) => {
            const distance = Math.abs(i - index);
            const id = dish.id || "";
            return (
              <ReelSlide
                key={id || `${dish.name}-${i}`}
                dish={dish}
                index={i}
                active={i === index}
                near={distance <= 1}
                render={distance <= 2}
                preload={i === index ? "auto" : i === index + 1 && activePlaying && !constrained ? "auto" : distance === 1 ? "metadata" : "none"}
                play={i === index && playing}
                paused={i === index && paused}
                muted={muted}
                liked={liked.has(id)}
                saved={savedHere.has(id)}
                likes={likeCount(id, dish.likes)}
                restaurantName={restaurant.name}
                logo={restaurant.logo}
                canCall={canCall}
                onTap={onTap}
                onHold={onHold}
                onLike={onLike}
                onShare={onShare}
                onSave={onSave}
                onCall={onCallDish}
                onPlaying={onPlaying}
                onSoundBlocked={onSoundBlocked}
              />
            );
          })}
          <section className="kd-reel kd-reel-end" data-index={dishes.length} aria-hidden={index !== dishes.length}>
            <div className="kd-reel-end-body">
              <span className="kd-reel-end-icon" aria-hidden>
                <Clapperboard size={28} />
              </span>
              <h2 className="kd-reel-end-title">{mode === "reels" ? "Você viu todos os pratos em vídeo" : "Você chegou ao fim do cardápio"}</h2>
              <div className="kd-reel-end-actions">
                <button type="button" className="kd-reel-end-btn is-primary" onClick={onClose} tabIndex={index === dishes.length ? 0 : -1}>
                  Ver o cardápio completo
                </button>
                <button type="button" className="kd-reel-end-btn" onClick={() => go(0)} tabIndex={index === dishes.length ? 0 : -1}>
                  <RotateCcw size={17} aria-hidden />
                  Ver do começo
                </button>
              </div>
            </div>
          </section>
        </div>

        {hint && index === startIndex && <p className="kd-reels-hint">Deslize para cima para ver o próximo prato</p>}
        <p className="kd-sr" aria-live="polite">
          {current ? `${current.name}, ${index + 1} de ${dishes.length}` : ""}
        </p>
        {toast && (
          <div className="kd-reels-toast" role="status" key={toast.id}>
            <span>{toast.text}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  setToast(null);
                  toast.action?.run();
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>

      {sheet?.kind === "share" && <ShareSheet dish={sheet.dish} restaurant={restaurant} onClose={() => setSheet(null)} />}
      {sheet?.kind === "save" && (
        <SaveSheet
          dish={sheet.dish}
          restaurant={restaurant}
          engagement={engagement}
          onClose={() => setSheet(null)}
          onShowSaved={() => {
            setSheet(null);
            onShowSaved();
          }}
        />
      )}
    </>
  );
}
