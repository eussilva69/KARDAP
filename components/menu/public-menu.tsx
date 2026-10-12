"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ConciergeBell, Receipt, Search, Star, UtensilsCrossed, X } from "lucide-react";
import { addPublicCall } from "@/lib/restaurant-db";
import { elapsed, plural } from "@/lib/format";
import { useNow, usePrefersReducedMotion, useRootPalette, useSaveData } from "@/lib/hooks";
import { isDefaultPalette } from "@/lib/palette";
import { Button } from "@/components/ui/primitives";
import type { Brand, RestaurantSettings } from "@/components/dashboard/types";
import { MenuHero } from "./menu-hero";
import { DishRow, type Dish } from "./dish-row";
import { CallSheet, type CallIntent } from "./call-sheet";
import { DishViewer } from "./dish-viewer";
import { MenuMessage, MenuSkeleton } from "./menu-states";

export type PublicCategory = { id: string; name: string; description?: string; order?: number; active?: boolean };
type Section = { id: string; name: string; description?: string; dishes: Dish[] };

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Dois toques curtos no celular do cliente confirmando que o chamado saiu. */
function playCallTone() {
  try {
    const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const context = new Ctx();
    [0, 0.18].forEach((delay) => {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.frequency.value = delay ? 880 : 660;
      gain.gain.setValueAtTime(0.0001, context.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + delay + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + delay + 0.14);
      osc.connect(gain).connect(context.destination);
      osc.start(context.currentTime + delay);
      osc.stop(context.currentTime + delay + 0.15);
    });
    setTimeout(() => context.close(), 500);
  } catch {}
}

/**
 * Seções na ordem definida no painel, sem as categorias ocultas.
 * Sem acesso às categorias, agrupa pelo nome salvo em cada produto (comportamento anterior).
 */
function buildSections(foods: Dish[], categories: PublicCategory[] | null): Section[] {
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

export default function PublicMenu({
  status,
  slow,
  onRetry,
  productsLoaded,
  restaurantId,
  table,
  brand,
  settings,
  foods,
  categories,
  restaurantName,
  billAllowed,
  suspended,
}: {
  status: "loading" | "ready" | "not-found" | "error";
  slow: boolean;
  onRetry: () => void;
  productsLoaded: boolean;
  restaurantId: string;
  table: string;
  brand: Brand;
  settings: RestaurantSettings;
  foods: Dish[];
  /** undefined: carregando · null: indisponível (usa o agrupamento antigo). */
  categories: PublicCategory[] | null | undefined;
  restaurantName: string;
  /** "Pedir a conta" depende do plano do restaurante (Pro ou período de teste). */
  billAllowed: boolean;
  /** Restaurante suspenso pela administração do Kardap. */
  suspended: boolean;
}) {
  useRootPalette(brand.palette);
  const customColors = !isDefaultPalette(brand.palette);
  const reducedMotion = usePrefersReducedMotion();
  const saveData = useSaveData();
  const autoplay = !reducedMotion && !saveData;
  const now = useNow(30_000);

  const [sheet, setSheet] = useState<CallIntent | null>(null);
  const [viewer, setViewer] = useState<{ list: Dish[]; index: number } | null>(null);
  const [lastCall, setLastCall] = useState<{ reason: string; at: number } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState("");
  const navRef = useRef<HTMLElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const searchButton = useRef<HTMLButtonElement>(null);

  const ready = status === "ready" && productsLoaded && categories !== undefined;
  const sections = useMemo(() => buildSections(foods, categories ?? null), [foods, categories]);
  const allDishes = useMemo(() => sections.flatMap((s) => s.dishes), [sections]);
  const term = normalize(query.trim());
  const results = searchOpen && term ? allDishes.filter((d) => normalize(d.name).includes(term) || normalize(d.description || "").includes(term)) : null;

  useEffect(() => {
    if (restaurantName) document.title = `${restaurantName} · Cardápio`;
  }, [restaurantName]);

  useEffect(() => {
    if (lastCall && now - lastCall.at > 15 * 60_000) setLastCall(null);
  }, [now, lastCall]);

  // Seção ativa conforme o scroll, sem listeners de scroll: a primeira seção na faixa superior da tela.
  useEffect(() => {
    if (!ready || results || typeof IntersectionObserver === "undefined") return;
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
  }, [ready, results, sections]);

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

  const sendCall = useCallback(
    async (reason: string, tableLabel: string) => {
      if (!restaurantId) throw new Error("O cardápio ainda está conectando. Tente de novo em instantes.");
      await addPublicCall(restaurantId, { table: tableLabel, type: reason });
      playCallTone();
      setLastCall({ reason, at: Date.now() });
    },
    [restaurantId],
  );

  if (status === "not-found" || status === "error") return <MenuMessage status={status} onRetry={onRetry} />;
  if (status === "ready" && suspended) return <MenuMessage status="unavailable" onRetry={onRetry} />;
  if (!ready) return slow ? <MenuMessage status="slow" onRetry={onRetry} /> : <MenuSkeleton />;

  const billOn = settings.bill && billAllowed;
  const canCall = settings.waiter || billOn;
  let running = 0;

  return (
    <div className={`kd-menu kd-menu-page ${canCall ? "has-bar" : ""} ${customColors ? "has-palette" : ""}`}>
      <div className="kd-menu-column">
        <MenuHero name={restaurantName} brand={brand} table={table}>
          {settings.google && settings.googleReviewUrl && (
            <a className="kd-menu-review" href={settings.googleReviewUrl} target="_blank" rel="noopener noreferrer">
              <Star size={15} aria-hidden />
              Avaliar no Google
              <span className="kd-sr"> (abre em nova aba)</span>
            </a>
          )}
        </MenuHero>

        {sections.length === 0 ? (
          <div className="kd-empty">
            <span className="kd-empty-icon" aria-hidden>
              <UtensilsCrossed size={22} />
            </span>
            <p className="kd-empty-title">Cardápio em preparação</p>
            <p className="kd-empty-text">A equipe ainda está cadastrando os pratos. {settings.waiter ? "Se quiser, chame alguém para ver as opções do dia." : ""}</p>
          </div>
        ) : (
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
                        onOpen={() => setViewer({ list: results, index: i })}
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
                        <DishRow key={dish.id || `${dish.name}-${j}`} dish={dish} autoplay={autoplay} onOpen={() => setViewer({ list: allDishes, index: start + j })} />
                      ))}
                    </ul>
                  </section>
                );
              })
            )}
          </>
        )}
      </div>

      {canCall && (
        <div className="kd-menu-bar">
          {lastCall && (
            <p className="kd-menu-bar-status" role="status">
              <Check size={15} strokeWidth={2.8} aria-hidden />
              Equipe avisada {elapsed(new Date(lastCall.at).toISOString(), now)}
            </p>
          )}
          <div className="kd-menu-bar-actions">
            {settings.waiter && (
              <Button variant="signal" size="lg" icon={<ConciergeBell size={19} aria-hidden />} onClick={() => setSheet("waiter")}>
                Chamar garçom
              </Button>
            )}
            {billOn && (
              <Button variant={settings.waiter ? "secondary" : "signal"} size="lg" icon={<Receipt size={18} aria-hidden />} onClick={() => setSheet("bill")}>
                Pedir a conta
              </Button>
            )}
          </div>
        </div>
      )}

      {viewer && (
        <DishViewer
          dishes={viewer.list}
          startIndex={viewer.index}
          autoplay={autoplay}
          canCall={settings.waiter}
          onCall={() => setSheet("order")}
          onClose={() => setViewer(null)}
        />
      )}
      {sheet && (
        <CallSheet
          table={table}
          intent={sheet}
          allowWaiter={settings.waiter}
          allowBill={billOn}
          onSend={sendCall}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}

export { MenuSkeleton };
