"use client";

import { useId } from "react";
import Link from "next/link";
import { AlertCircle, LoaderCircle } from "lucide-react";

/* ───────────── Botões ───────────── */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "signal" | "link";
type ButtonSize = "sm" | "md" | "lg";

type ButtonBaseProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  iconEnd?: React.ReactNode;
  block?: boolean;
  className?: string;
  children?: React.ReactNode;
};

const buttonClass = (variant: ButtonVariant, size: ButtonSize, block?: boolean, extra?: string) =>
  ["kd-btn", `kd-btn--${variant}`, size !== "md" && `kd-btn--${size}`, block && "kd-btn--block", extra].filter(Boolean).join(" ");

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  iconEnd,
  block,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonBaseProps & { loading?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, block, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <LoaderCircle className="k-spin" size={size === "sm" ? 15 : 17} aria-hidden /> : icon}
      {children !== undefined && children !== null && children !== false && <span>{children}</span>}
      {!loading && iconEnd}
    </button>
  );
}

export function ButtonLink({
  variant = "secondary",
  size = "md",
  icon,
  iconEnd,
  block,
  className,
  children,
  href,
  external,
  onClick,
}: ButtonBaseProps & { href: string; external?: boolean; onClick?: () => void }) {
  const cls = buttonClass(variant, size, block, className);
  const body = (
    <>
      {icon}
      {children !== undefined && children !== null && <span>{children}</span>}
      {iconEnd}
      {external && <span className="kd-sr"> (abre em nova aba)</span>}
    </>
  );
  if (external)
    return (
      <a className={cls} href={href} target="_blank" rel="noopener noreferrer" onClick={onClick}>
        {body}
      </a>
    );
  return (
    <Link className={cls} href={href} onClick={onClick}>
      {body}
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
      className={`kd-icon-btn ${tone === "danger" ? "kd-icon-btn--danger" : ""} ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ───────────── Rótulos e superfícies ───────────── */

export type BadgeTone = "neutral" | "signal" | "success" | "danger" | "ink" | "outline";

export function Badge({ tone = "neutral", children, className = "" }: { tone?: BadgeTone; children: React.ReactNode; className?: string }) {
  return <span className={`kd-badge kd-badge--${tone} ${className}`.trim()}>{children}</span>;
}

export function Card({
  as: Tag = "section",
  flush = false,
  className = "",
  children,
  ...rest
}: {
  as?: "section" | "article" | "div" | "li";
  flush?: boolean;
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={`kd-card ${flush ? "kd-card--flush" : ""} ${className}`.trim()} {...rest}>
      {children}
    </Tag>
  );
}

/** Cabeçalho de cartão: título com rótulo opcional e uma ação à direita. */
export function CardHead({ kicker, title, action, id }: { kicker?: React.ReactNode; title: string; action?: React.ReactNode; id?: string }) {
  return (
    <div className="kd-card-head">
      <div>
        {kicker && <p className="kd-overline">{kicker}</p>}
        <h2 className="kd-h3" id={id}>
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

/** Cabeçalho da página: o único h1 da tela. */
export function PageHeader({
  kicker,
  title,
  description,
  actions,
  display = false,
}: {
  kicker?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  display?: boolean;
}) {
  return (
    <header className="kd-page-head">
      <div className="kd-page-head-text">
        {kicker && <p className="kd-overline">{kicker}</p>}
        <h1 className={display ? "kd-display" : "kd-h1"}>{title}</h1>
        {description && <p className="kd-lead">{description}</p>}
      </div>
      {actions && <div className="kd-page-head-actions">{actions}</div>}
    </header>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`kd-empty ${compact ? "kd-empty--compact" : ""}`}>
      {icon && (
        <span className="kd-empty-icon" aria-hidden>
          {icon}
        </span>
      )}
      <p className="kd-empty-title">{title}</p>
      {description && <p className="kd-empty-text">{description}</p>}
      {action && <div className="kd-empty-action">{action}</div>}
    </div>
  );
}

export function Callout({
  tone = "info",
  icon,
  title,
  children,
  action,
  role,
  style,
  className,
}: {
  tone?: "info" | "warn" | "danger" | "success";
  icon?: React.ReactNode;
  title?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  role?: "status" | "alert";
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <div className={`kd-callout kd-callout--${tone}${className ? ` ${className}` : ""}`} role={role} style={style}>
      {icon}
      <div className="kd-callout-body">
        {title && <b>{title}</b>}
        {children && <span>{children}</span>}
      </div>
      {action && <div className="kd-callout-action">{action}</div>}
    </div>
  );
}

/* ───────────── Carregamento ───────────── */

export function Skeleton({ rows = 3, height = 56, label = "Carregando" }: { rows?: number; height?: number; label?: string }) {
  return (
    <div className="kd-skel-list" role="status" aria-label={label}>
      {Array.from({ length: rows }).map((_, i) => (
        <span key={i} className="kd-skel" style={{ height }} aria-hidden />
      ))}
    </div>
  );
}

/** As três linhas de velocidade da logo, usadas como indicador de carregamento da marca. */
export function SpeedLoader({ label = "Carregando", large = false }: { label?: string; large?: boolean }) {
  return (
    <span className={`kd-speed ${large ? "kd-speed--lg" : ""}`} role="status" aria-label={label}>
      <i aria-hidden />
      <i aria-hidden />
      <i aria-hidden />
    </span>
  );
}

/* ───────────── Campos ───────────── */

type FieldProps = {
  label: string;
  hint?: React.ReactNode;
  error?: string;
  optional?: boolean;
  className?: string;
  labelAside?: React.ReactNode;
};

function FieldFrame({
  id,
  label,
  hint,
  error,
  optional,
  className = "",
  labelAside,
  children,
}: FieldProps & { id: string; children: React.ReactNode }) {
  return (
    <div className={`kd-field ${className}`.trim()}>
      <div className="kd-label">
        <label htmlFor={id}>
          {label}
          {optional && <span className="kd-label-opt"> (opcional)</span>}
        </label>
        {labelAside}
      </div>
      {children}
      {error ? (
        <p id={`${id}-msg`} className="kd-error">
          <AlertCircle size={14} aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-msg`} className="kd-hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextField({
  label,
  hint,
  error,
  optional,
  className,
  labelAside,
  trailing,
  id: givenId,
  ...input
}: FieldProps & { trailing?: React.ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  const autoId = useId();
  const id = givenId || autoId;
  const field = (
    <input
      id={id}
      className="kd-input"
      aria-invalid={error ? true : undefined}
      aria-describedby={error || hint ? `${id}-msg` : undefined}
      {...input}
    />
  );
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} optional={optional} className={className} labelAside={labelAside}>
      {trailing ? (
        <div className="kd-input-wrap">
          {field}
          <span className="kd-input-trailing">{trailing}</span>
        </div>
      ) : (
        field
      )}
    </FieldFrame>
  );
}

export function TextArea({
  label,
  hint,
  error,
  optional,
  className,
  ...input
}: FieldProps & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} optional={optional} className={className}>
      <textarea
        id={id}
        className="kd-input"
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-msg` : undefined}
        {...input}
      />
    </FieldFrame>
  );
}

export function SelectField({
  label,
  hint,
  error,
  optional,
  className,
  children,
  id: givenId,
  ...select
}: FieldProps & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const autoId = useId();
  const id = givenId || autoId;
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} optional={optional} className={className}>
      <select
        id={id}
        className="kd-input"
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-msg` : undefined}
        {...select}
      >
        {children}
      </select>
    </FieldFrame>
  );
}

export function Switch({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label className="kd-switch-row" htmlFor={id}>
      <span>
        <b>{label}</b>
        {description && <small id={`${id}-desc`}>{description}</small>}
      </span>
      <span className="kd-switch">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          aria-describedby={description ? `${id}-desc` : undefined}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span aria-hidden />
      </span>
    </label>
  );
}

/** Filtro de opções exclusivas (Abertos / Concluídos / Todos). */
export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; count?: number }[];
}) {
  return (
    <div className="kd-seg" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
          {option.label}
          {option.count !== undefined && <span className="kd-seg-count">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function RadioCard<T extends string>({
  name,
  value,
  checked,
  onChange,
  title,
  description,
  icon,
  disabled,
}: {
  name: string;
  value: T;
  checked: boolean;
  onChange: (value: T) => void;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={`kd-radio-card ${checked ? "is-checked" : ""}`}>
      <input
        className="kd-radio-input"
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
      />
      {icon && (
        <span className="kd-radio-icon" aria-hidden>
          {icon}
        </span>
      )}
      <span className="kd-radio-text">
        <b>{title}</b>
        {description && <small>{description}</small>}
      </span>
      <span className="kd-radio-mark" aria-hidden />
    </label>
  );
}
