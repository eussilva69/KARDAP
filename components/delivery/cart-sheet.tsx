"use client";

import { useId, useRef } from "react";
import { ArrowRight, Pencil, ShoppingBag, UtensilsCrossed, X } from "lucide-react";
import { brl, plural } from "@/lib/format";
import { useDialog } from "@/lib/hooks";
import { Button } from "@/components/ui/primitives";
import type { CartLine } from "./use-cart";
import { Stepper } from "./product-sheet";

/** Linha do carrinho já conferida com o cardápio atual (preço vigente e disponibilidade). */
export type PricedLine = CartLine & { unavailable: boolean };

/** Resumo de valores. `feeCents` null: taxa calculada só com o endereço (taxa por bairro). */
export function OrderSummary({ subtotalCents, feeCents, feeLoading = false, count }: { subtotalCents: number; feeCents: number | null; feeLoading?: boolean; count: number }) {
  const feeText = feeLoading ? "Calculando…" : feeCents === null ? "Calculada no endereço" : feeCents === 0 ? "Grátis" : brl(feeCents);
  return (
    <dl className="kd-summary">
      <div>
        <dt>Subtotal ({plural(count, "item", "itens")})</dt>
        <dd className="kd-num">{brl(subtotalCents)}</dd>
      </div>
      <div>
        <dt>Taxa de entrega</dt>
        <dd className="kd-num">{feeText}</dd>
      </div>
      <div className="is-total">
        <dt>Total</dt>
        <dd className="kd-num">{feeCents === null || feeLoading ? `${brl(subtotalCents)} + entrega` : brl(subtotalCents + feeCents)}</dd>
      </div>
    </dl>
  );
}

export function CartSheet({
  lines,
  feeCents,
  minOrderCents,
  closedNow,
  onQuantity,
  onRemove,
  onEdit,
  onCheckout,
  onClose,
}: {
  lines: PricedLine[];
  feeCents: number | null;
  minOrderCents: number;
  closedNow: boolean;
  onQuantity: (key: string, quantity: number) => void;
  onRemove: (key: string) => void;
  onEdit: (line: PricedLine) => void;
  onCheckout: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialog(ref, onClose);

  const valid = lines.filter((line) => !line.unavailable);
  const subtotal = valid.reduce((sum, line) => sum + line.priceCents * line.quantity, 0);
  const count = valid.reduce((sum, line) => sum + line.quantity, 0);
  const hasUnavailable = valid.length !== lines.length;
  const missing = minOrderCents > 0 && subtotal < minOrderCents ? minOrderCents - subtotal : 0;

  return (
    <div className="kd-sheet-layer">
      <div className="kd-sheet-backdrop" onClick={onClose} aria-hidden />
      <div ref={ref} className="kd-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="kd-sheet-head">
          <div>
            <p className="kd-overline">Delivery</p>
            <h2 id={titleId} className="kd-h2">
              Seu carrinho
            </h2>
          </div>
          <button type="button" className="kd-icon-btn" onClick={onClose} aria-label="Fechar">
            <X size={20} />
          </button>
        </header>

        {lines.length === 0 ? (
          <div className="kd-empty kd-empty--compact">
            <span className="kd-empty-icon" aria-hidden>
              <ShoppingBag size={22} />
            </span>
            <p className="kd-empty-title">Seu carrinho está vazio</p>
            <p className="kd-empty-text">Escolha os pratos no cardápio para montar o pedido.</p>
            <Button variant="secondary" size="sm" onClick={onClose}>
              Ver o cardápio
            </Button>
          </div>
        ) : (
          <>
            <div className="kd-sheet-body">
              <ul className="kd-cart-list">
                {lines.map((line) => (
                  <li key={line.key} className="kd-cart-line">
                    <span className="kd-cart-thumb" aria-hidden>
                      {line.image ? <img src={line.image} alt="" width={56} height={56} loading="lazy" decoding="async" /> : <UtensilsCrossed size={20} />}
                    </span>
                    <div className="kd-cart-info">
                      <div className="kd-cart-top">
                        <h3 className="kd-cart-name">{line.name}</h3>
                        <span className="kd-cart-total kd-num">{brl(line.priceCents * line.quantity)}</span>
                      </div>
                      <p className="kd-cart-meta kd-num">{brl(line.priceCents)} cada</p>
                      {line.notes && <p className="kd-cart-notes">“{line.notes}”</p>}
                      {line.unavailable && <p className="kd-cart-warn">Indisponível no momento. Remova para continuar.</p>}
                      <div className="kd-cart-actions">
                        <Stepper small value={line.quantity} label={line.name} onChange={(q) => onQuantity(line.key, q)} onRemove={() => onRemove(line.key)} />
                        {!line.unavailable && (
                          <Button variant="ghost" size="sm" className="kd-cart-edit" icon={<Pencil size={14} aria-hidden />} onClick={() => onEdit(line)} aria-label={`Editar ${line.name}`}>
                            Editar
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <OrderSummary subtotalCents={subtotal} feeCents={feeCents} count={count} />
              {missing > 0 && (
                <p className="kd-notice" role="status">
                  Pedido mínimo de {brl(minOrderCents)}: faltam <span className="kd-num">{brl(missing)}</span>.
                </p>
              )}
              {closedNow && <p className="kd-notice">Pelo horário informado, o estabelecimento está fechado agora.</p>}
            </div>
            <footer className="kd-sheet-foot">
              <Button
                variant="signal"
                size="lg"
                block
                disabled={missing > 0 || hasUnavailable || count === 0}
                onClick={onCheckout}
                iconEnd={<ArrowRight size={18} aria-hidden />}
              >
                Continuar para entrega
              </Button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
