"use client";

import { useEffect, useRef, useState } from "react";
import { Clapperboard, Search, UtensilsCrossed, X } from "lucide-react";
import { plural } from "@/lib/format";
import { Button } from "@/components/ui/primitives";
import { DishRow, type Dish } from "./dish-row";

export type PublicCategory = { id: string; name: string; description?: string; order?: number; active?: boolean };
export type Section = { id: string; name: string; description?: string; dishes: Dish[] };

export const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Seções na ordem definida no painel, sem as categorias ocultas.
 * Sem acesso às categorias, agrupa pelo nome salvo em cada produto (comportamento anterior).
 */
export function buildSections(foods: Dish[], categories: PublicCategory[] | null): Section[] {
  if (categories && categories.length) {
    const hidden = new Set(categories.filter((c) => c.active === false).map((c) => c.id));
    const known = new Set(categories.map((c) => c.id));
    const sections: Section[] = categories
      .filter((c) => c.active !== false)
      .map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        dishes: foods.filter((f) => f.categoryId === c.id).map((f) => ({ ...f, category: c.name })),
      }))
      .filter((s) => s.dishes.length > 0);
    const others = foods.filter((f) => !f.categoryId || (!known.has(f.categoryId) && !hidden.has(f.categoryId)));
    if (others.length) sections.push({ id: "outros", name: "Outros", dishes: others });
    return sections;
  }
  const groups = new Map<string, Dish[]>();
  foods.forEach((f) => {
    const key = String(f.category || "Outros").trim() || "Outros";
    groups.set(key, [...(groups.get(key) || []), f]);
  });
  return Array.from(groups.entries()).map(([name, dishes], i) => ({ id: `secao-${i}`, name, dishes }));
}

/**
 * Corpo do cardápio público: barra de seções com busca, lista de pratos por seção e resultados da busca.
 * Compartilhado pelo cardápio da mesa e pelo delivery: a aparência é uma só, cada tela decide o que o toque no prato faz.
 */
export function MenuCatalog({
  sections,
  allDishes,
  autoplay,
  reducedMotion,
  emptyText,
  onOpenDish,
  onOpenReels,
  dishNote,
}: {
  sections: Section[];
  allDishes: Dish[];
  autoplay: boolean;
  reducedMotion: boolean;
  /** Texto do estado vazio, abaixo de "Cardápio em preparação". */
  emptyText: string;
  /** Toque no prato: recebe a lista exibida e a posição dele nela. */
  onOpenDish: (list: Dish[], index: number) => void;
  /** Botão de vídeos ao lado da busca (só aparece quando informado). */
  onOpenReels?: () => void;
  /** Informação extra abaixo do preço (ex.: quantidade no carrinho do delivery). */
  dishNote?: (dish: Dish) => React.ReactNode;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState("");
  const navRef = useRef<HTMLElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const searchButton = useRef<HTMLButtonElement>(null);

  const term = normalize(query.trim());
  const results = searchOpen && term ? allDishes.filter((d) => normalize(d.name).includes(term) || normalize(d.description || "").includes(term)) : null;
  const hasResults = Boolean(results);

  // Seção ativa conforme o scroll, sem listeners de scroll: a primeira seção na faixa superior da tela.
  useEffect(() => {
    if (hasResults || typeof IntersectionObserver === "undefined") return;
    const visible = new Map<string, boolean>();
    const offset = (navRef.current?.offsetHeight || 56) + 8;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => visible.set(entry.target.id.slice(4), entry.isIntersecting));
        const first = sections.find((s) => visible.get(s.id));
        if (first) setActive(first.id);
      },
      { rootMargin: `-${offset}px 0px -55% 0px` },
    );
    sections.forEach((s) => {
      const node = document.getElementById(`sec-${s.id}`);
      if (node) observer.observe(node);
    });
    return () => observer.disconnect();
  }, [hasResults, sections]);

  // Mantém o chip da seção ativa visível na barra horizontal.
  useEffect(() => {
    const bar = chipsRef.current;
    const chip = bar?.querySelector<HTMLElement>(`[data-id="${CSS.escape(active)}"]`);
    if (!bar || !chip) return;
    const left = chip.offsetLeft - bar.offsetLeft;
    if (left < bar.scrollLeft || left + chip.offsetWidth > bar.scrollLeft + bar.clientWidth) {
      bar.scrollTo({ left: Math.max(0, left - 16), behavior: reducedMotion ? "auto" : "smooth" });
    }
  }, [active, reducedMotion]);

  const goTo = (id: string) => {
    document.getElementById(`sec-${id}`)?.scrollIntoView({ block: "start", behavior: reducedMotion ? "auto" : "smooth" });
    setActive(id);
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery("");
    requestAnimationFrame(() => searchButton.current?.focus());
  };

  if (sections.length === 0)
    return (
      <div className="kd-empty">
        <span className="kd-empty-icon" aria-hidden>
          <UtensilsCrossed size={22} />
        </span>
        <p className="kd-empty-title">Cardápio em preparação</p>
        <p className="kd-empty-text">{emptyText}</p>
      </div>
    );

  let running = 0;
  return (
    <>
      <nav className="kd-menu-nav" aria-label="Seções do cardápio" ref={navRef}>
        {searchOpen ? (
          <div className="kd-menu-search">
            <Search size={18} aria-hidden />
            <input
              type="search"
              enterKeyHint="search"
              placeholder="Buscar prato ou bebida"
              aria-label="Buscar no cardápio"
              value={query}
              autoFocus
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && closeSearch()}
            />
            <button type="button" className="kd-icon-btn" onClick={closeSearch} aria-label="Fechar busca">
              <X size={18} />
            </button>
          </div>
        ) : (
          <>
            <button ref={searchButton} type="button" className="kd-menu-search-btn" onClick={() => setSearchOpen(true)} aria-label="Buscar no cardápio">
              <Search size={18} />
            </button>
            {onOpenReels && (
              <button type="button" className="kd-menu-search-btn" onClick={onOpenReels} aria-label="Assistir os pratos em vídeo (Reels)">
                <Clapperboard size={18} />
              </button>
            )}
            <div className="kd-menu-chips" ref={chipsRef}>
              {sections.map((s) => (
                <a
                  key={s.id}
                  href={`#sec-${s.id}`}
                  data-id={s.id}
                  className={active === s.id ? "is-active" : ""}
                  aria-current={active === s.id ? "true" : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    goTo(s.id);
                  }}
                >
                  {s.name}
                </a>
              ))}
            </div>
          </>
        )}
      </nav>

      {results ? (
        <section className="kd-menu-results" aria-label="Resultados da busca">
          <p className="kd-menu-results-count" role="status">
            {results.length ? `${plural(results.length, "resultado", "resultados")} para “${query.trim()}”` : `Nada encontrado para “${query.trim()}”`}
          </p>
          {results.length ? (
            <ul className="kd-dish-list">
              {results.map((dish, i) => (
                <DishRow
                  key={dish.id || `${dish.name}-${i}`}
                  dish={dish}
                  categoryLabel={dish.category}
                  autoplay={autoplay}
                  onOpen={() => onOpenDish(results, i)}
                  note={dishNote?.(dish)}
                />
              ))}
            </ul>
          ) : (
            <div className="kd-empty kd-empty--compact">
              <p className="kd-empty-text">Tente outra palavra, como o nome de um ingrediente.</p>
              <Button variant="secondary" size="sm" onClick={closeSearch}>
                Ver o cardápio completo
              </Button>
            </div>
          )}
        </section>
      ) : (
        sections.map((section) => {
          const start = running;
          running += section.dishes.length;
          return (
            <section key={section.id} id={`sec-${section.id}`} className="kd-menu-section" aria-labelledby={`sec-${section.id}-title`}>
              <header className="kd-menu-section-head">
                <h2 id={`sec-${section.id}-title`} className="kd-menu-section-title">
                  {section.name}
                </h2>
                {section.description && <p>{section.description}</p>}
              </header>
              <ul className="kd-dish-list">
                {section.dishes.map((dish, j) => (
                  <DishRow key={dish.id || `${dish.name}-${j}`} dish={dish} autoplay={autoplay} onOpen={() => onOpenDish(allDishes, start + j)} note={dishNote?.(dish)} />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </>
  );
}
