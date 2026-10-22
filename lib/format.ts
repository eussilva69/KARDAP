const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Valor em centavos formatado como moeda brasileira (R$ 49,90). */
export const brl = (cents: number) => currency.format((Number(cents) || 0) / 100);

/** Preço do produto em centavos: usa `priceCents` e, em registros antigos, o texto "49,90". */
export function productCents(product: { priceCents?: unknown; price?: unknown }) {
  if (typeof product.priceCents === "number") return product.priceCents;
  return Math.round(Number(String(product.price || "0").replace(/\./g, "").replace(",", ".")) * 100) || 0;
}

/**
 * Valor digitado ("7,50", "R$ 1.200,00", "50") → centavos. Vazio → null; texto que não é valor → NaN.
 * Use em todo campo de dinheiro: `Number("R$ 5,00")` dá NaN, e tratar isso como 0 grava entrega grátis sem aviso.
 */
export function parseMoneyCents(raw: string): number | null {
  const clean = raw.replace(/[^\d,.]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (!clean) return null;
  const value = Number(clean);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : NaN;
}

/** Centavos → texto de campo ("7,50"); vazio quando não há valor. */
export const centsToInput = (cents: number | null | undefined) => (typeof cents === "number" ? (cents / 100).toFixed(2).replace(".", ",") : "");

/** "1 produto" / "3 produtos". */
export const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Tempo decorrido em linguagem de salão: "agora", "há 4 min", "há 2 h". */
export function elapsed(iso: string | undefined, now: number) {
  if (!iso) return "";
  const diff = now - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 60_000) return "agora";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  return `há ${Math.floor(hours / 24)} d`;
}

export function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 5) return "Boa noite";
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

export const initial = (name: string, fallback = "K") => (name.trim()[0] || fallback).toUpperCase();

/** Estilo de escalonamento para o sistema de movimento (`.k-enter`). */
export const stagger = (index: number) => ({ "--k-i": Math.min(index, 10) }) as React.CSSProperties;
