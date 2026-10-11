"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, X } from "lucide-react";
import { IconButton } from "./primitives";

export type ToastAction = { label: string; onAction: () => void };
export type ToastTone = "success" | "error";
export type ToastState = { id: number; message: string; tone: ToastTone; action?: ToastAction } | null;

/**
 * Notificações globais. As regiões ao vivo ficam sempre montadas para que leitores de tela
 * anunciem a mensagem; erros usam a região assertiva. O tempo pausa enquanto o mouse ou o
 * foco estão sobre a notificação, e mensagens com ação ficam mais tempo na tela.
 */
export function Toaster({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(0);
  const startedAt = useRef(0);

  useEffect(() => {
    if (!toast) return;
    remaining.current = toast.tone === "error" ? 8000 : toast.action ? 6500 : 3800;
    setPaused(false);
  }, [toast]);

  useEffect(() => {
    if (!toast || paused) return;
    startedAt.current = Date.now();
    const timer = setTimeout(onDismiss, remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(1500, remaining.current - (Date.now() - startedAt.current));
    };
  }, [toast, paused, onDismiss]);

  const card = toast && (
    <div
      key={toast.id}
      className={`kd-toast ${toast.tone === "error" ? "kd-toast--error" : ""}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="kd-toast-icon" aria-hidden>
        {toast.tone === "error" ? <AlertCircle size={15} strokeWidth={2.5} /> : <Check size={15} strokeWidth={3} />}
      </span>
      <p className="kd-toast-msg">{toast.message}</p>
      {toast.action && (
        <button
          type="button"
          className="kd-toast-action"
          onClick={() => {
            toast.action?.onAction();
            onDismiss();
          }}
        >
          {toast.action.label}
        </button>
      )}
      <IconButton label="Fechar notificação" onClick={onDismiss}>
        <X size={16} />
      </IconButton>
    </div>
  );

  return (
    <div className="kd-toaster">
      <div aria-live="polite" aria-atomic="true">
        {toast?.tone === "success" && card}
      </div>
      <div aria-live="assertive" aria-atomic="true">
        {toast?.tone === "error" && card}
      </div>
    </div>
  );
}
