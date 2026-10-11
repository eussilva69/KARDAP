"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

/** Atalho para o topo em documentos longos (páginas legais). Aparece depois de rolar a primeira tela. */
export function BackToTop() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const update = () => setVisible(window.scrollY > 640);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  return (
    <button
      type="button"
      className={`kd-backtop ${visible ? "is-visible" : ""}`}
      onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}
      aria-label="Voltar ao topo"
      tabIndex={visible ? 0 : -1}
    >
      <ArrowUp size={18} aria-hidden />
    </button>
  );
}
