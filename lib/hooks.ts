"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isDark, isDefaultPalette, paletteVars, type BrandPalette, type PaletteColors } from "./palette";

/** Relógio que avança sozinho: mantém "há 4 min" correto sem depender de novos dados. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

/** true quando o aparelho pede economia de dados: nesse caso vídeos não tocam sozinhos. */
export function useSaveData() {
  const [saveData, setSaveData] = useState(false);
  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    setSaveData(Boolean(connection?.saveData));
  }, []);
  return saveData;
}

/** Observa quando um elemento entra na tela (IntersectionObserver, sem listeners de scroll). */
export function useInView<T extends Element>(options: IntersectionObserverInit & { once?: boolean } = {}) {
  const { once = false, root = null, rootMargin = "0px", threshold = 0 } = options;
  const [inView, setInView] = useState(false);
  // O observador vive num efeito ligado ao elemento: sobrevive à montagem dupla do modo estrito do React.
  const [node, setNode] = useState<T | null>(null);
  const ref = useCallback((next: T | null) => setNode(next), []);
  useEffect(() => {
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting);
        if (entry.isIntersecting && once) observer.disconnect();
      },
      { root, rootMargin, threshold },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, once, root, rootMargin, threshold]);
  return [ref, inView] as const;
}

let scrollLocks = 0;
let savedOverflow = "";
let savedPadding = "";

/** Trava o scroll da página enquanto um diálogo está aberto (suporta diálogos empilhados). */
export function lockScroll() {
  if (typeof document === "undefined") return () => undefined;
  const body = document.body;
  if (scrollLocks === 0) {
    savedOverflow = body.style.overflow;
    savedPadding = body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    body.style.overflow = "hidden";
  }
  scrollLocks += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    scrollLocks = Math.max(0, scrollLocks - 1);
    if (scrollLocks === 0) {
      body.style.overflow = savedOverflow;
      body.style.paddingRight = savedPadding;
    }
  };
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Diálogos abertos, do mais antigo ao mais recente: só o do topo responde ao teclado. */
const dialogStack: symbol[] = [];

/**
 * Comportamento de diálogo acessível: foco inicial, Tab preso dentro do diálogo,
 * Esc para fechar, scroll da página travado e foco devolvido ao fechar.
 */
export function useDialog(ref: React.RefObject<HTMLElement>, onEscape: () => void, active = true) {
  const escape = useRef(onEscape);
  escape.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const id = Symbol("dialog");
    dialogStack.push(id);
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusables = () => Array.from(node?.querySelectorAll<HTMLElement>(FOCUSABLE) || []).filter((el) => el.getClientRects().length > 0);
    const preferred = node?.querySelector<HTMLElement>("[data-autofocus]");
    (preferred || focusables()[0] || node)?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (dialogStack[dialogStack.length - 1] !== id) return;
      if (event.key === "Escape") {
        event.preventDefault();
        escape.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (!items.length) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (!node?.contains(current)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const release = lockScroll();
    return () => {
      document.removeEventListener("keydown", onKey);
      const index = dialogStack.indexOf(id);
      if (index >= 0) dialogStack.splice(index, 1);
      release();
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, [active, ref]);
}

/**
 * Aplica a paleta do restaurante em <html> enquanto o componente estiver na tela.
 * Fica na raiz (e não no contêiner) para valer também em diálogos, gaveta e notificações.
 * A paleta padrão do Kardap não escreve nada: valem as cores de app/globals.css.
 */
export function useRootPalette(palette: BrandPalette | null, enabled = true) {
  const colors = palette && enabled && !isDefaultPalette(palette) ? JSON.stringify(palette.colors) : "";
  useEffect(() => {
    if (!colors) return;
    const root = document.documentElement;
    const parsed = JSON.parse(colors) as PaletteColors;
    const vars = paletteVars(parsed);
    const previousScheme = root.style.colorScheme;
    for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
    root.style.colorScheme = isDark(parsed.background) ? "dark" : "light";
    return () => {
      for (const name of Object.keys(vars)) root.style.removeProperty(name);
      root.style.colorScheme = previousScheme;
    };
  }, [colors]);
}

type NetworkInformation = { saveData?: boolean; effectiveType?: string; addEventListener?: (type: "change", listener: () => void) => void; removeEventListener?: (type: "change", listener: () => void) => void };

/**
 * true em conexão lenta (2G/3G) ou com economia de dados ligada: vídeos vizinhos não são
 * pré-carregados para não competir com o que está na tela. Sem a API (Safari), assume conexão boa.
 */
export function useConstrainedNetwork() {
  const [constrained, setConstrained] = useState(false);
  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
    if (!connection) return;
    const update = () => setConstrained(Boolean(connection.saveData) || /(^|-)(2g|3g)$/.test(connection.effectiveType || ""));
    update();
    connection.addEventListener?.("change", update);
    return () => connection.removeEventListener?.("change", update);
  }, []);
  return constrained;
}
