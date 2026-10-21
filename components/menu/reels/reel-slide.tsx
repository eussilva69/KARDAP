"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Bookmark, ConciergeBell, Heart, LoaderCircle, Play, Send, ShoppingBag } from "lucide-react";
import { brl, initial, productCents } from "@/lib/format";
import { pauseVideo, playExclusiveReporting, releaseVideo, reportStall } from "@/lib/video-playback";
import type { Dish } from "../dish-row";

const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
/** Descrições maiores que isso ganham o "mais" (cabem cerca de duas linhas no celular). */
const LONG_CAPTION = 90;
const HOLD_MS = 250;
const DOUBLE_TAP_MS = 300;
/** Segundos do próximo vídeo baixados de antemão: começa na hora sem baixar o arquivo inteiro de quem não desliza. */
const AHEAD_SECONDS = 3;
/** Falhas de rede: novas tentativas em 1 s, 2 s e 4 s; depois fica a capa. */
const MAX_RETRIES = 3;
const RETRY_MS = 1000;
/** Tocando, sem chegar nenhum dado por este tempo e com rede: recarrega (conta como tentativa). */
const STUCK_MS = 10_000;

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
  /** O slide atual já tem o primeiro quadro (ou não tem vídeo que dê para tocar): os vizinhos podem baixar. */
  onReady: (index: number) => void;
  onSoundBlocked: () => void;
  /** O navegador recusou tocar sozinho mesmo sem som: fica parado com o ícone de play, um toque inicia. */
  onAutoplayBlocked: () => void;
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
  onReady,
  onSoundBlocked,
  onAutoplayBlocked,
}: ReelSlideProps) {
  const video = useRef<HTMLVideoElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const gesture = useRef<Gesture | null>(null);
  /** Último toque e se ele pausou/continuou o vídeo (para desfazer caso vire toque duplo). */
  const lastTap = useRef<{ x: number; y: number; t: number; toggled: boolean } | null>(null);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [buffering, setBuffering] = useState(false);
  /** O vídeo não carregou (sem rede, arquivo indisponível): fica a capa, sem o "carregando" eterno. */
  const [failed, setFailed] = useState(false);
  const poster = dish.videoPoster || dish.image || "";
  const hasVideo = Boolean(dish.videoUrl) && !failed;
  // Vídeo horizontal numa tela em pé: aparece inteiro (sem corte) sobre a própria capa desfocada.
  const landscape = Boolean(dish.video && dish.video.width > dish.video.height);
  const tab = active ? 0 : -1;

  const playRef = useRef(play);
  playRef.current = play;
  /** Tentativas seguidas que falharam por rede (zera quando o vídeo volta a tocar). */
  const retries = useRef(0);
  /** Cancela a nova tentativa agendada (espera crescente ou volta da conexão). */
  const cancelRetry = useRef<() => void>(() => undefined);

  // Tenta de novo quando o endereço muda ou a conexão volta.
  useEffect(() => {
    setFailed(false);
    retries.current = 0;
  }, [dish.videoUrl]);
  useEffect(() => {
    if (!failed) return;
    const retry = () => {
      retries.current = 0;
      setFailed(false);
    };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [failed]);
  useEffect(() => () => cancelRetry.current(), []);

  const startPlayback = useCallback(
    (el: HTMLVideoElement) => {
      const soundWanted = !el.muted;
      // O pré-carregamento limitado (ver abaixo) pode ter deixado "metadata": no slide atual, baixa normalmente.
      if (el.preload !== "auto") el.preload = "auto";
      playExclusiveReporting(el).then((result) => {
        if (result === "muted" && soundWanted) onSoundBlocked();
        else if (result === "blocked" && playRef.current) onAutoplayBlocked();
      });
    },
    [onSoundBlocked, onAutoplayBlocked],
  );

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    el.muted = muted;
    if (play) startPlayback(el);
    else pauseVideo(el);
  }, [play, muted, near, hasVideo, startPlayback]);

  /** Recarrega o mesmo elemento no ponto em que estava (sem trocar de nó nem piscar a capa). */
  const reload = useCallback(() => {
    const el = video.current;
    if (!el) return;
    const at = el.currentTime;
    el.load();
    if (at > 0) el.currentTime = at;
    if (playRef.current) startPlayback(el);
  }, [startPlayback]);

  /**
   * Falha de rede: tenta de novo com espera crescente (sem rede, espera a conexão voltar). Arquivo inexistente,
   * corrompido ou em formato que o aparelho não toca não melhora tentando: fica a capa.
   */
  const recover = useCallback(() => {
    cancelRetry.current();
    const code = video.current?.error?.code;
    if (code === 3 || code === 4 || retries.current >= MAX_RETRIES) {
      setFailed(true);
      return;
    }
    retries.current++;
    if (!navigator.onLine) {
      const back = () => {
        cancelRetry.current();
        reload();
      };
      window.addEventListener("online", back);
      cancelRetry.current = () => window.removeEventListener("online", back);
      return;
    }
    const timer = setTimeout(reload, RETRY_MS * 2 ** (retries.current - 1));
    cancelRetry.current = () => clearTimeout(timer);
  }, [reload]);

  // O slide atual sem vídeo tocável, ou com o primeiro quadro já baixado (era o próximo), libera os vizinhos.
  useEffect(() => {
    if (!active) return;
    const el = video.current;
    if (!hasVideo || (el && el.readyState >= 2)) onReady(index);
  }, [active, hasVideo, near, index, onReady]);

  // Próximo da fila com pré-carregamento completo: só os primeiros segundos. Depois de baixá-los, volta a
  // "metadata" e o navegador para de baixar (o resto vem quando ele virar o atual).
  useEffect(() => {
    const el = video.current;
    if (!el || active || preload !== "auto") return;
    const enough = () => {
      const b = el.buffered;
      const target = Math.min(AHEAD_SECONDS, (el.duration || Infinity) - 0.25);
      if (b.length && b.start(0) <= 0.25 && b.end(0) >= target) el.preload = "metadata";
    };
    el.addEventListener("progress", enough);
    enough();
    return () => el.removeEventListener("progress", enough);
  }, [active, preload, near, hasVideo]);

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
  }, [near, hasVideo]);

  // Progresso, "carregando" e vigia de travamento só no slide atual.
  useEffect(() => {
    const el = video.current;
    const line = bar.current;
    if (!el || !active) {
      setBuffering(false);
      return;
    }
    let frame = 0;
    let wait: ReturnType<typeof setTimeout> | undefined;
    /** Já tocou neste slide: uma espera depois disso é travada (a do começo é só o carregamento). */
    let started = !el.paused && el.readyState >= 3;
    let lastData = Date.now();
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
      wait = setTimeout(() => {
        setBuffering(true);
        if (started) reportStall();
      }, 450);
    };
    const ready = () => {
      clearTimeout(wait);
      setBuffering(false);
    };
    const playing = () => {
      started = true;
      retries.current = 0;
      ready();
    };
    const data = () => {
      lastData = Date.now();
    };
    // Rede que some sem erro (conexão pendurada): nenhum dado chegando enquanto deveria tocar.
    const watch = setInterval(() => {
      if (el.paused || el.readyState >= 3 || !navigator.onLine || Date.now() - lastData < STUCK_MS) return;
      lastData = Date.now();
      recover();
    }, 2000);
    el.addEventListener("play", start);
    el.addEventListener("pause", stop);
    el.addEventListener("waiting", waiting);
    el.addEventListener("playing", playing);
    el.addEventListener("pause", ready);
    el.addEventListener("progress", data);
    el.addEventListener("timeupdate", data);
    el.addEventListener("loadstart", data);
    if (!el.paused) start();
    return () => {
      stop();
      clearTimeout(wait);
      clearInterval(watch);
      el.removeEventListener("play", start);
      el.removeEventListener("pause", stop);
      el.removeEventListener("waiting", waiting);
      el.removeEventListener("playing", playing);
      el.removeEventListener("pause", ready);
      el.removeEventListener("progress", data);
      el.removeEventListener("timeupdate", data);
      el.removeEventListener("loadstart", data);
    };
  }, [active, near, hasVideo, recover]);

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
    if (last && now - last.t < DOUBLE_TAP_MS && Math.hypot(event.clientX - last.x, event.clientY - last.y) < 80) {
      // Dois toques (ou mais, em sequência): só curte, nunca descurte, e não pausa. O primeiro toque já
      // pausou (ou continuou) na hora; aqui ele é desfeito.
      lastTap.current = { x: event.clientX, y: event.clientY, t: now, toggled: false };
      if (last.toggled) onTap();
      const rect = event.currentTarget.getBoundingClientRect();
      burst(event.clientX - rect.left, event.clientY - rect.top);
      onLike(dish, true);
      return;
    }
    // Toque simples responde no mesmo quadro, sem esperar a janela do toque duplo.
    lastTap.current = { x: event.clientX, y: event.clientY, t: now, toggled: hasVideo };
    if (hasVideo) onTap();
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
                onLoadedData={() => active && onReady(index)}
                onError={recover}
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
