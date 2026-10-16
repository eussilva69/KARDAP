"use client";

import { useEffect, useRef } from "react";
import { ArrowLeft } from "lucide-react";

export function SubHeader({ title, onBack, backRef }: { title: string; onBack: () => void; backRef?: React.Ref<HTMLButtonElement> }) {
  return (
    <header className="pm-subheader">
      <button type="button" ref={backRef} className="pm-subheader-back" onClick={onBack} aria-label="Voltar">
        <ArrowLeft size={18} />
      </button>
      <h1 className="pm-subheader-title">{title}</h1>
      <span aria-hidden />
    </header>
  );
}

/** Tela interna em tela cheia (detalhe do produto, informações, conta), com o mesmo cabeçalho do Perfil. */
export function Panel({
  title,
  onClose,
  footer,
  children,
}: {
  title: string;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const backRef = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    backRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.({ preventScroll: true });
    };
  }, []);

  return (
    <div className="pm-app pm-panel" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="pm-panel-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <SubHeader title={title} onBack={onClose} backRef={backRef} />
        <div className="pm-panel-body">{children}</div>
        {footer && <div className="pm-panel-footer">{footer}</div>}
      </div>
    </div>
  );
}
