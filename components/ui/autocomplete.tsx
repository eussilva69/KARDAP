"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertCircle, LoaderCircle } from "lucide-react";

/** Token de sessão do Google Places: agrupa as buscas e a escolha final numa única cobrança. */
export function newSessionToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Campo com sugestões (combobox acessível): espera o usuário parar de digitar, cancela a busca anterior,
 * guarda as respostas da sessão e navega por teclado (setas, Enter, Esc).
 */
export function Autocomplete<T>({
  label,
  hideLabel = false,
  placeholder,
  hint,
  error,
  icon,
  minChars = 3,
  debounceMs = 300,
  fetchItems,
  itemKey,
  renderItem,
  onSelect,
  emptyText = "Nenhum resultado.",
  disabled,
  busy = false,
  id: givenId,
  inputMode,
}: {
  label: string;
  hideLabel?: boolean;
  placeholder?: string;
  hint?: React.ReactNode;
  error?: string;
  icon?: React.ReactNode;
  minChars?: number;
  debounceMs?: number;
  fetchItems: (query: string, signal: AbortSignal) => Promise<T[]>;
  itemKey: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  onSelect: (item: T) => void | Promise<void>;
  emptyText?: string;
  disabled?: boolean;
  busy?: boolean;
  id?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  const autoId = useId();
  const id = givenId || autoId;
  const listId = `${id}-list`;
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [failure, setFailure] = useState("");
  const cache = useRef(new Map<string, T[]>());
  const boxRef = useRef<HTMLDivElement>(null);
  const fetchRef = useRef(fetchItems);
  fetchRef.current = fetchItems;

  useEffect(() => {
    const q = query.trim();
    setFailure("");
    if (q.length < minChars) {
      setItems([]);
      setLoading(false);
      return;
    }
    const cached = cache.current.get(q.toLowerCase());
    if (cached) {
      setItems(cached);
      setActive(-1);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const result = await fetchRef.current(q, controller.signal);
        if (controller.signal.aborted) return;
        cache.current.set(q.toLowerCase(), result);
        setItems(result);
        setActive(-1);
      } catch (err) {
        if (controller.signal.aborted) return;
        setItems([]);
        setFailure((err as Error)?.message || "Não foi possível buscar agora.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, debounceMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, minChars, debounceMs]);

  useEffect(() => {
    const close = (event: MouseEvent | TouchEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, []);

  const choose = async (item: T) => {
    setOpen(false);
    setQuery("");
    setItems([]);
    cache.current.clear();
    await onSelect(item);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (items.length ? (i + 1) % items.length : -1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (items.length ? (i <= 0 ? items.length - 1 : i - 1) : -1));
    } else if (event.key === "Enter") {
      if (open && active >= 0 && items[active]) {
        event.preventDefault();
        choose(items[active]);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const showList = open && query.trim().length >= minChars && !loading && (items.length > 0 || !failure);
  const message = error || failure;

  return (
    <div className="kd-field kd-ac" ref={boxRef}>
      <div className={`kd-label ${hideLabel ? "kd-sr" : ""}`}>
        <label htmlFor={id}>{label}</label>
      </div>
      <div className={`kd-ac-control ${icon ? "has-icon" : ""}`}>
        {icon && <span className="kd-ac-icon" aria-hidden>{icon}</span>}
        <input
          id={id}
          className="kd-input"
          type="search"
          role="combobox"
          autoComplete="off"
          inputMode={inputMode}
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${id}-opt-${active}` : undefined}
          aria-invalid={message ? true : undefined}
          aria-describedby={message || hint ? `${id}-msg` : undefined}
          placeholder={placeholder}
          value={query}
          disabled={disabled || busy}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {(loading || busy) && <LoaderCircle className="k-spin kd-ac-spin" size={17} aria-hidden />}
        {showList && (
          <ul id={listId} role="listbox" className="kd-ac-list" aria-label={label}>
            {items.map((item, index) => (
              <li
                key={itemKey(item)}
                id={`${id}-opt-${index}`}
                role="option"
                aria-selected={index === active}
                className={index === active ? "is-active" : undefined}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(item)}
              >
                {renderItem(item)}
              </li>
            ))}
            {!items.length && (
              <li className="kd-ac-empty" role="option" aria-selected={false} aria-disabled="true">
                {emptyText}
              </li>
            )}
          </ul>
        )}
      </div>
      {message ? (
        <p id={`${id}-msg`} className="kd-error" role="alert">
          <AlertCircle size={14} aria-hidden />
          {message}
        </p>
      ) : hint ? (
        <p id={`${id}-msg`} className="kd-hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
