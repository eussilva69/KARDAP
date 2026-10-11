"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  const observer = useRef<IntersectionObserver | null>(null);
  const ref = useCallback(
    (node: T | null) => {
      observer.current?.disconnect();
      if (!node) return;
      if (typeof IntersectionObserver === "undefined") {
        setInView(true);
        return;
      }
      observer.current = new IntersectionObserver(
        ([entry]) => {
          setInView(entry.isIntersecting);
          if (entry.isIntersecting && once) observer.current?.disconnect();
        },
        { root, rootMargin, threshold },
      );
      observer.current.observe(node);
    },
    [once, root, rootMargin, threshold],
  );
  useEffect(() => () => observer.current?.disconnect(), []);
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
