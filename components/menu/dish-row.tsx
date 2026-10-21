"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { Play } from "lucide-react";
import { brl, productCents } from "@/lib/format";
import { useInView } from "@/lib/hooks";
import { currentPreloadBudget, pauseVideo, pickVideoSource, playExclusive, releaseVideo, useFeedOpen, type VideoSourceInfo } from "@/lib/video-playback";

export type Dish = {
  id?: string;
  name: string;
  description?: string;
  category?: string;
  categoryId?: string;
  price?: string;
  priceCents?: number;
  image?: string;
  /** Versão pequena da foto (400 px), usada na lista. */
  imageThumb?: string;
  videoUrl?: string;
  /** Capa WebP gerada na otimização (vídeos novos). */
  videoPoster?: string;
  /** Resumo do vídeo otimizado (vídeos novos): dimensões e, quando geradas, as versões extras (`pickVideoSource`). */
  video?: VideoSourceInfo["video"];
  /** Curtidas nos Reels (contador mantido junto com cada curtida, ver lib/reels.ts). */
  likes?: number;
};

/**
 * Mídia do prato na lista. O vídeo só existe enquanto a linha está perto da tela (sai e devolve
 * rede e memória quando se afasta), só toca visível e um de cada vez. Antes de carregar,
 * aparece a capa gerada na otimização, então não há quadro preto nem salto de layout.
 */
export function DishMedia({ dish, autoplay, onClick }: { dish: Dish; autoplay: boolean; onClick?: () => void }) {
  const [nearRef, near] = useInView<HTMLSpanElement>({ rootMargin: "400px 0px" });
  const [visibleRef, visible] = useInView<HTMLSpanElement>({ threshold: 0.6 });
  const video = useRef<HTMLVideoElement>(null);
  const setRefs = useCallback(
    (node: HTMLSpanElement | null) => {
      nearRef(node);
      visibleRef(node);
    },
    [nearRef, visibleRef],
  );
  // Com o feed em tela cheia aberto, a lista fica atrás dele: o vídeo sai e volta quando o feed fecha.
  const covered = useFeedOpen();
  const mounted = near && !covered;
  // Na lista basta a versão pequena (400 px): a foto principal (1200 px) fica para a tela cheia.
  const poster = dish.videoPoster || dish.imageThumb || dish.image || "";
  // A mesma versão do vídeo que o feed em tela cheia usaria nesta rede: quem toca no prato continua do que a lista já
  // baixou (cache). Com rede fraca ou economia de dados, as duas usam a versão menor.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const source = useMemo(() => pickVideoSource(dish, currentPreloadBudget()), [dish.videoUrl, dish.video, mounted]);

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (autoplay && visible) playExclusive(el);
    else pauseVideo(el);
  }, [autoplay, visible, mounted]);

  // Ao sair de perto da tela (ou ficar coberto), o elemento é desmontado: cancela o download antes.
  useEffect(() => {
    const el = video.current;
    return () => releaseVideo(el);
  }, [mounted]);

  if (!dish.image && !dish.videoUrl) return null;
  return (
    <span ref={setRefs} className="kd-dish-media" onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined} onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && onClick() : undefined}>
      {dish.videoUrl && mounted ? (
        <video
          ref={video}
          src={poster ? source : `${source}#t=0.1`}
          poster={poster || undefined}
          muted
          loop
          playsInline
          preload={poster ? "none" : "metadata"}
          aria-hidden
          tabIndex={-1}
        />
      ) : poster ? (
        <img src={poster} alt="" width={112} height={112} loading="lazy" decoding="async" />
      ) : null}
      {dish.videoUrl && (
        <span className="kd-dish-video-tag">
          <Play size={10} fill="currentColor" aria-hidden />
          Vídeo
        </span>
      )}
    </span>
  );
}

/** Linha de prato no estilo de cardápio impresso: nome, descrição e preço à esquerda, mídia à direita. */
export function DishRow({
  dish,
  onOpen,
  autoplay,
  categoryLabel,
  note,
}: {
  dish: Dish;
  onOpen?: () => void;
  autoplay: boolean;
  categoryLabel?: string;
  /** Linha extra abaixo do preço (o delivery mostra quantos já estão no carrinho). */
  note?: React.ReactNode;
}) {
  return (
    <li className="kd-dish">
      <div className="kd-dish-text">
        {categoryLabel && <p className="kd-dish-cat">{categoryLabel}</p>}
        <h3 className="kd-dish-name">
          {onOpen ? (
            <button type="button" className="kd-dish-open" onClick={onOpen}>
              {dish.name}
            </button>
          ) : (
            dish.name
          )}
        </h3>
        {dish.description && <p className="kd-dish-desc">{dish.description}</p>}
        <p className="kd-dish-price kd-num">{brl(productCents(dish))}</p>
        {note}
      </div>
      <DishMedia dish={dish} autoplay={autoplay} onClick={onOpen} />
    </li>
  );
}
