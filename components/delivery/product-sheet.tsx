"use client";

import { useId, useRef, useState } from "react";
import { Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { brl, productCents } from "@/lib/format";
import { useDialog } from "@/lib/hooks";
import { Button, TextArea } from "@/components/ui/primitives";
import type { Dish } from "@/components/menu/dish-row";
import { MAX_QTY } from "./use-cart";

/** Seletor de quantidade (− 2 +). Com `onRemove`, o "−" na quantidade 1 vira lixeira. */
export function Stepper({
  value,
  onChange,
  label,
  min = 1,
  small = false,
  onRemove,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  min?: number;
  small?: boolean;
  onRemove?: () => void;
}) {
  const removing = Boolean(onRemove) && value <= min;
  return (
    <div className={`kd-stepper ${small ? "kd-stepper--sm" : ""}`} role="group" aria-label={`Quantidade de ${label}`}>
      <button
        type="button"
        onClick={() => (removing ? onRemove?.() : onChange(value - 1))}
        disabled={!removing && value <= min}
        aria-label={removing ? `Remover ${label}` : "Diminuir quantidade"}
      >
        {removing ? <Trash2 size={small ? 15 : 17} aria-hidden /> : <Minus size={small ? 15 : 18} aria-hidden />}
      </button>
      <output className="kd-num" aria-live="polite">
        {value}
      </output>
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= MAX_QTY} aria-label="Aumentar quantidade">
        <Plus size={small ? 15 : 18} aria-hidden />
      </button>
    </div>
  );
}

/**
 * Detalhe do produto no delivery: mídia, descrição, preço, observação e quantidade.
 * Também edita uma linha do carrinho (`initial`), trocando o botão por "Salvar alterações".
 */
export function ProductSheet({
  dish,
  available,
  autoplay,
  initial,
  onConfirm,
  onClose,
}: {
  dish: Dish;
  /** Produto ainda publicado e disponível no cardápio. */
  available: boolean;
  autoplay: boolean;
  initial?: { quantity: number; notes: string };
  onConfirm: (quantity: number, notes: string) => void;
  onClose: () => void;
}) {
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialog(ref, onClose);

  const unit = productCents(dish);
  const image = dish.image || dish.imageThumb || dish.videoPoster || "";
  // A miniatura (já baixada na lista) aparece enquanto a foto grande carrega.
  const thumb = dish.imageThumb && dish.imageThumb !== image ? ({ "--kd-thumb": `url("${dish.imageThumb}")` } as React.CSSProperties) : undefined;
  const editing = Boolean(initial);

  return (
    <div className="kd-sheet-layer">
      <div className="kd-sheet-backdrop" onClick={onClose} aria-hidden />
      <div ref={ref} className="kd-sheet kd-sheet--product" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <button type="button" className="kd-product-close" onClick={onClose} aria-label="Fechar">
          <X size={20} />
        </button>
        <div className="kd-sheet-body">
          {dish.videoUrl ? (
            <div className="kd-product-media">
              <video
                src={dish.videoUrl}
                poster={dish.videoPoster || image || undefined}
                muted
                loop
                playsInline
                autoPlay={autoplay}
                controls={!autoplay}
                preload={autoplay ? "auto" : "none"}
                aria-label={`Vídeo de ${dish.name}`}
              />
            </div>
          ) : image ? (
            <div className="kd-product-media">
              <img src={image} alt="" decoding="async" style={thumb} />
            </div>
          ) : null}
          <header className="kd-product-head">
            {dish.category && <p className="kd-overline">{dish.category}</p>}
            <h2 id={titleId} className="kd-h2">
              {dish.name}
            </h2>
            {dish.description && <p className="kd-product-desc">{dish.description}</p>}
            <p className="kd-detail-price kd-num">{brl(unit)}</p>
          </header>
          {available ? (
            <TextArea
              label="Observações"
              optional
              rows={3}
              maxLength={300}
              placeholder="Ex.: sem cebola, molho à parte…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          ) : (
            <p className="kd-notice" role="status">
              Este produto não está disponível no momento.
            </p>
          )}
        </div>
        <footer className="kd-sheet-foot">
          <div className="kd-sheet-foot-row">
            <Stepper value={quantity} onChange={setQuantity} label={dish.name} />
            <Button
              variant="signal"
              size="lg"
              disabled={!available || !dish.id}
              onClick={() => onConfirm(quantity, notes)}
              icon={<ShoppingBag size={18} aria-hidden />}
              data-autofocus
            >
              {editing ? "Salvar" : "Adicionar"} · <span className="kd-num">{brl(unit * quantity)}</span>
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
