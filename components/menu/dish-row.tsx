"use client";

import { useCallback, useEffect, useRef } from "react";
import { Play } from "lucide-react";
import { brl, productCents } from "@/lib/format";
import { useInView } from "@/lib/hooks";

export type Dish = {
  id?: string;
  name: string;
  description?: string;
  category?: string;
  categoryId?: string;
  price?: string;
  priceCents?: number;
  image?: string;
  videoUrl?: string;
};

/**
 * Mídia do prato. O vídeo só é criado quando a linha chega perto da tela e só toca
 * enquanto está visível, para não baixar dezenas de vídeos de uma vez no 4G do cliente.
 */
export function DishMedia({ dish, autoplay }: { dish: Dish; autoplay: boolean }) {
  const [nearRef, near] = useInView<HTMLSpanElement>({ rootMargin: "240px 0px", once: true });
  const [visibleRef, visible] = useInView<HTMLSpanElement>({ threshold: 0.6 });
  const video = useRef<HTMLVideoElement>(null);
  const setRefs = useCallback(
    (node: HTMLSpanElement | null) => {
      nearRef(node);
      visibleRef(node);
    },
    [nearRef, visibleRef],
  );

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (autoplay && visible) el.play().catch(() => undefined);
    else el.pause();
  }, [autoplay, visible, near]);

  if (!dish.image && !dish.videoUrl) return null;
  return (
    <span ref={setRefs} className="kd-dish-media">
      {dish.videoUrl && near ? (
        <video
          ref={video}
          src={dish.image ? dish.videoUrl : `${dish.videoUrl}#t=0.1`}
          poster={dish.image || undefined}
          muted
          loop
          playsInline
          preload={dish.image ? "none" : "metadata"}
          aria-hidden
          tabIndex={-1}
        />
      ) : dish.image ? (
        <img src={dish.image} alt="" width={112} height={112} loading="lazy" decoding="async" />
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
}: {
  dish: Dish;
  onOpen?: () => void;
  autoplay: boolean;
  categoryLabel?: string;
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
      </div>
      <DishMedia dish={dish} autoplay={autoplay} />
    </li>
  );
}
