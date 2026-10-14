"use client";

import { Clapperboard, Play } from "lucide-react";
import type { Dish } from "../dish-row";

const MAX_BUBBLES = 20;

/** Entrada dos Reels no topo do cardápio: bolhas com os pratos em vídeo (como os stories). */
export function ReelsRail({ dishes, onOpen }: { dishes: Dish[]; onOpen: (index: number) => void }) {
  if (!dishes.length) return null;
  return (
    <section className="kd-reels-rail" aria-labelledby="kd-reels-rail-title">
      <div className="kd-reels-rail-head">
        <h2 id="kd-reels-rail-title" className="kd-reels-rail-title">
          <Clapperboard size={17} aria-hidden />
          Pratos em vídeo
        </h2>
        <button type="button" className="kd-reels-rail-all" onClick={() => onOpen(0)}>
          Assistir
          <Play size={12} fill="currentColor" strokeWidth={0} aria-hidden />
        </button>
      </div>
      <ul className="kd-reels-rail-list">
        {dishes.slice(0, MAX_BUBBLES).map((dish, i) => {
          // Bolha de 68 px: basta a versão pequena da foto (a capa do vídeo fica para a tela cheia).
          const src = dish.imageThumb || dish.videoPoster || dish.image || "";
          return (
            <li key={dish.id || `${dish.name}-${i}`}>
              <button type="button" className="kd-reels-bubble" onClick={() => onOpen(i)} aria-label={`Assistir vídeo: ${dish.name}`}>
                <span className="kd-reels-bubble-ring">{src ? <img src={src} alt="" width={68} height={68} loading="lazy" decoding="async" /> : <Play size={20} aria-hidden />}</span>
                <span className="kd-reels-bubble-name">{dish.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
