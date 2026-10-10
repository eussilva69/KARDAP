"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { LoaderCircle, X } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "link";
type Size = "md" | "sm";

type ButtonBaseProps = {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
};

const buttonClass = (variant: Variant, size: Size, extra = "") =>
  `kd-btn kd-btn--${variant} kd-btn--${size} ${extra}`.trim();

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonBaseProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <LoaderCircle className="kd-spin" size={16} aria-hidden /> : icon}
      {children && <span>{children}</span>}
    </button>
  );
}

export function ButtonLink({
  variant = "secondary",
  size = "md",
  icon,
  className,
  children,
  href,
  external,
}: ButtonBaseProps & { href: string; external?: boolean }) {
  const cls = buttonClass(variant, size, className);
  if (external)
    return (
      <a className={cls} href={href} target="_blank" rel="noopener noreferrer">
        {icon}
        {children && <span>{children}</span>}
      </a>
    );
  return (
    <Link className={cls} href={href}>
      {icon}
      {children && <span>{children}</span>}
    </Link>
  );
}

export function IconButton({
  label,
  tone = "default",
  className = "",
  children,
  ...rest
}: { label: string; tone?: "default" | "danger" } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`kd-icon-btn ${tone === "danger" ? "kd-icon-btn--danger" : ""} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "warning" | "accent" | "muted";
  children: React.ReactNode;
}) {
  return <span className={`kd-badge kd-badge--${tone}`}>{children}</span>;
}

export function Card({
  as: Tag = "section",
  className = "",
  children,
  style,
  ...rest
}: {
  as?: "section" | "article" | "div";
  className?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={`kd-card ${className}`} style={style} {...rest}>
      {children}
    </Tag>
  );
}

export function PageIntro({
  kicker,
  title,
  description,
  actions,
}: {
  kicker?: string;
  title?: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="kd-intro">
      <div>
        {kicker && <p className="kd-kicker">{kicker}</p>}
        {title && <h2 className="kd-title">{title}</h2>}
        {description && <p className="kd-lead">{description}</p>}
      </div>
      {actions && <div className="kd-intro-actions">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="kd-empty">
      {icon && <span className="kd-empty-icon" aria-hidden>{icon}</span>}
      <p className="kd-empty-title">{title}</p>
      {description && <p className="kd-empty-text">{description}</p>}
      {action && <div className="kd-empty-action">{action}</div>}
    </div>
  );
}

export function Skeleton({ rows = 3, height = 56 }: { rows?: number; height?: number }) {
  return (
    <div className="kd-skeleton-list" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: rows }).map((_, i) => (
        <span key={i} className="kd-skeleton" style={{ height }} />
      ))}
    </div>
  );
}

type FieldProps = {
  label: string;
  hint?: React.ReactNode;
  error?: string;
  className?: string;
};

export function TextField({
  label,
  hint,
  error,
  className = "",
  ...input
}: FieldProps & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className={`kd-field ${error ? "is-invalid" : ""} ${className}`}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? `${id}-hint` : undefined}
        {...input}
      />
      {(error || hint) && (
        <p id={`${id}-hint`} className={error ? "kd-field-error" : "kd-field-hint"}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

export function TextArea({
  label,
  hint,
  error,
  className = "",
  ...input
}: FieldProps & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <div className={`kd-field ${error ? "is-invalid" : ""} ${className}`}>
      <label htmlFor={id}>{label}</label>
      <textarea id={id} aria-invalid={error ? true : undefined} {...input} />
      {(error || hint) && <p className={error ? "kd-field-error" : "kd-field-hint"}>{error || hint}</p>}
    </div>
  );
}

export function SelectField({
  label,
  hint,
  error,
  className = "",
  children,
  ...select
}: FieldProps & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <div className={`kd-field ${error ? "is-invalid" : ""} ${className}`}>
      <label htmlFor={id}>{label}</label>
      <select id={id} aria-invalid={error ? true : undefined} {...select}>
        {children}
      </select>
      {(error || hint) && <p className={error ? "kd-field-error" : "kd-field-hint"}>{error || hint}</p>}
    </div>
  );
}

export function Switch({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="kd-switch-row">
      <span>
        <b>{label}</b>
        {description && <small>{description}</small>}
      </span>
      <span className="kd-switch">
        <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span aria-hidden />
      </span>
    </label>
  );
}

export function Modal({
  title,
  description,
  onClose,
  footer,
  children,
  size = "md",
}: {
  title: string;
  description?: string;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
  size?: "sm" | "md";
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ) || [],
      );
    (focusable().find((el) => el.tagName !== "BUTTON") || focusable()[0])?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key === "Tab") {
        const items = focusable();
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  return (
    <div className="kd-modal-layer">
      <div className="kd-modal-backdrop" onClick={onClose} aria-hidden />
      <div
        ref={dialogRef}
        className={`kd-modal kd-modal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="kd-modal-head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <IconButton label="Fechar" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>
        <div className="kd-modal-body">{children}</div>
        {footer && <footer className="kd-modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<boolean | void> | boolean | void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={title}
      onClose={busy ? () => undefined : onClose}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant="danger"
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
      <p className="kd-confirm-text">{description}</p>
    </Modal>
  );
}
