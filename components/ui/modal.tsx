"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useDialog } from "@/lib/hooks";
import { Button, IconButton } from "./primitives";

/**
 * Diálogo do painel. Em telas pequenas vira folha inferior.
 * `dirty`: fechar pelo fundo ou pelo Esc pede confirmação antes de descartar o formulário.
 * `busy`: enquanto salva, não fecha.
 */
export function Modal({
  title,
  description,
  onClose,
  footer,
  children,
  size = "md",
  dirty = false,
  busy = false,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
  dirty?: boolean;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [guard, setGuard] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const requestClose = () => {
    if (busy) return;
    if (dirty) {
      setGuard(true);
      return;
    }
    onClose();
  };
  useDialog(ref, requestClose, mounted);

  if (!mounted) return null;
  return createPortal(
    <div className="kd-modal-layer">
      <div className="kd-modal-backdrop" onClick={requestClose} aria-hidden />
      <div
        ref={ref}
        className={`kd-modal kd-modal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <header className="kd-modal-head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <IconButton label="Fechar" onClick={requestClose} disabled={busy}>
            <X size={18} />
          </IconButton>
        </header>
        <div className="kd-modal-body">{children}</div>
        {guard && (
          <div className="kd-modal-guard" role="alert">
            <span>Descartar as alterações deste formulário?</span>
            <div>
              <Button size="sm" variant="secondary" onClick={() => setGuard(false)} data-autofocus>
                Continuar editando
              </Button>
              <Button size="sm" variant="danger" onClick={onClose}>
                Descartar
              </Button>
            </div>
          </div>
        )}
        {footer && <footer className="kd-modal-foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancelar",
  tone = "danger",
  onConfirm,
  onClose,
  children,
}: {
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  onConfirm: () => Promise<boolean | void> | boolean | void;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={title}
      onClose={onClose}
      busy={busy}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                if ((await onConfirm()) !== false) onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="kd-confirm-text">{description}</div>
      {children}
    </Modal>
  );
}
