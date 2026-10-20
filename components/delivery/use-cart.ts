"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { productCents } from "@/lib/format";
import type { Dish } from "@/components/menu/dish-row";

/** Uma linha do carrinho: o mesmo produto com observações diferentes vira linhas separadas. */
export type CartLine = {
  key: string;
  productId: string;
  name: string;
  priceCents: number;
  quantity: number;
  notes: string;
  image?: string;
};

export const MAX_QTY = 99;
const MAX_AGE = 4 * 60 * 60 * 1000;

const lineKey = (productId: string, notes: string) => `${productId}::${notes.trim()}`;
const storageKey = (restaurantId: string) => `kardap_cart_dl_${restaurantId}`;

/** Carrinho salvo no aparelho (vale por 4 horas). Aceita o formato antigo, sem `key`. */
function load(restaurantId: string): CartLine[] {
  if (!restaurantId) return [];
  try {
    const raw = localStorage.getItem(storageKey(restaurantId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Partial<CartLine> & { savedAt?: number }>;
    if (!Array.isArray(parsed)) return [];
    if (parsed[0]?.savedAt && Date.now() - parsed[0].savedAt > MAX_AGE) return [];
    return parsed
      .filter((item) => typeof item.productId === "string" && item.productId)
      .map((item) => {
        const notes = typeof item.notes === "string" ? item.notes : "";
        return {
          key: lineKey(item.productId!, notes),
          productId: item.productId!,
          name: String(item.name || ""),
          priceCents: Number(item.priceCents) || 0,
          quantity: Math.max(1, Math.min(MAX_QTY, Math.floor(Number(item.quantity) || 1))),
          notes,
          image: typeof item.image === "string" ? item.image : undefined,
        };
      });
  } catch {
    return [];
  }
}

function save(restaurantId: string, items: CartLine[]) {
  if (!restaurantId) return;
  try {
    if (!items.length) {
      localStorage.removeItem(storageKey(restaurantId));
      return;
    }
    localStorage.setItem(storageKey(restaurantId), JSON.stringify(items.map((item, i) => (i === 0 ? { ...item, savedAt: Date.now() } : item))));
  } catch {}
}

/** Junta linhas com a mesma chave (mesmo produto e mesma observação). */
function merge(items: CartLine[]): CartLine[] {
  const out: CartLine[] = [];
  for (const item of items) {
    const same = out.find((o) => o.key === item.key);
    if (same) same.quantity = Math.min(MAX_QTY, same.quantity + item.quantity);
    else out.push({ ...item });
  }
  return out;
}

export function useCart(restaurantId: string) {
  const [items, setItems] = useState<CartLine[]>([]);
  const owner = useRef("");

  // Lê o carrinho do restaurante assim que ele é identificado (e troca se o restaurante mudar).
  useEffect(() => {
    if (!restaurantId || owner.current === restaurantId) return;
    owner.current = restaurantId;
    setItems(load(restaurantId));
  }, [restaurantId]);

  useEffect(() => {
    if (owner.current) save(owner.current, items);
  }, [items]);

  const add = useCallback((dish: Dish, quantity: number, notes: string) => {
    if (!dish.id) return;
    const clean = notes.trim();
    const line: CartLine = {
      key: lineKey(dish.id, clean),
      productId: dish.id,
      name: dish.name,
      priceCents: productCents(dish),
      quantity: Math.max(1, Math.min(MAX_QTY, quantity)),
      notes: clean,
      image: dish.imageThumb || dish.image || dish.videoPoster,
    };
    setItems((prev) => merge([...prev, line]));
  }, []);

  /** Edita uma linha (quantidade e observação). Se a nova observação coincidir com outra linha, as duas se juntam. */
  const update = useCallback((key: string, quantity: number, notes: string) => {
    const clean = notes.trim();
    setItems((prev) =>
      merge(prev.map((item) => (item.key === key ? { ...item, key: lineKey(item.productId, clean), notes: clean, quantity: Math.max(1, Math.min(MAX_QTY, quantity)) } : item))),
    );
  }, []);

  const setQuantity = useCallback((key: string, quantity: number) => {
    setItems((prev) => (quantity <= 0 ? prev.filter((item) => item.key !== key) : prev.map((item) => (item.key === key ? { ...item, quantity: Math.min(MAX_QTY, quantity) } : item))));
  }, []);

  const remove = useCallback((key: string) => setItems((prev) => prev.filter((item) => item.key !== key)), []);
  const clear = useCallback(() => setItems([]), []);

  return { items, add, update, setQuantity, remove, clear };
}

export type Cart = ReturnType<typeof useCart>;
