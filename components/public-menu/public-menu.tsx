"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  ArrowLeft,
  Bike,
  BookOpen,
  ChevronRight,
  Clock,
  FileText,
  LoaderCircle,
  LogIn,
  LogOut,
  Mail,
  MapPin,
  Play,
  Search,
  ShoppingBag,
  User as UserIcon,
  UtensilsCrossed,
  X,
} from "lucide-react";
import {
  watchCustomerProfile,
  watchPublicRestaurant,
  watchPublicRestaurantCategories,
  watchPublicRestaurantProducts,
  watchPublicTable,
  type CustomerProfile,
  type RestaurantCategory,
  type RestaurantProduct,
} from "@/lib/restaurant-db";
import { getFirebaseAuth } from "@/lib/auth";
import { isFirebaseConfigured } from "@/lib/firebase";
import { friendlyError } from "@/lib/async";
import { hasHours, openStatus, RESTAURANT_TIME_ZONE, WEEKDAYS, type ServiceInfo, type WeeklyHours } from "@/lib/restaurant-hours";
import type { Brand, RestaurantSettings } from "@/components/dashboard/dashboard";
import { AccountPanel, AddressesPanel, LoginPanel, NotificationsPanel, signOutCustomer } from "./customer";
import { Panel, SubHeader } from "./panel";
import QrHome from "./qr-home";
import ReelsViewer from "./reels-viewer";

type Notify = (message: string, tone?: "success" | "error") => void;
type Tab = "menu" | "search" | "profile";
type PanelState =
  | { type: "reels"; items: RestaurantProduct[]; index: number }
  | { type: "info" }
  | { type: "login" }
  | { type: "account" }
  | { type: "notifications" }
  | { type: "addresses" }
  | null;

export type PublicRestaurant = {
  id: string;
  name: string;
  establishmentType: string;
  brand: Brand;
  settings: Partial<RestaurantSettings>;
};

export type MenuSection = { key: string; name: string; items: RestaurantProduct[] };

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Preço real do produto; vazio quando não foi cadastrado (nunca exibe um valor inventado). */
export function productPrice(product: RestaurantProduct) {
  if (typeof product.priceCents === "number" && Number.isFinite(product.priceCents)) return brl.format(product.priceCents / 100);
  const raw = String(product.price ?? "").trim();
  if (!raw) return "";
  const value = Number(raw.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(value) ? brl.format(value) : "";
}

/** Busca sem acento e sem diferença de maiúsculas. */
const normalize = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/* ───────────────────────── Dados ───────────────────────── */

export type TableState = "none" | "checking" | "valid" | "invalid";

function usePublicMenuData(slug: string, tableToken: string, retryKey: number, loadProducts: boolean) {
  const [status, setStatus] = useState<"loading" | "ready" | "not-found" | "error">("loading");
  const [slow, setSlow] = useState(false);
  const [restaurant, setRestaurant] = useState<PublicRestaurant | null>(null);
  const [products, setProducts] = useState<RestaurantProduct[]>([]);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [categories, setCategories] = useState<RestaurantCategory[]>([]);
  const [tableName, setTableName] = useState("");
  const [tableState, setTableState] = useState<TableState>(tableToken ? "checking" : "none");
  const restaurantId = restaurant?.id || "";

  useEffect(() => {
    if (!slug) return;
    setStatus("loading");
    setSlow(false);
    if (!isFirebaseConfigured) {
      setStatus("error");
      return;
    }
    const timer = setTimeout(() => setSlow(true), 9000);
    const stop = watchPublicRestaurant(
      slug,
      (data, meta) => {
        if (!data) {
          if (meta.fromCache) return;
          clearTimeout(timer);
          setStatus("not-found");
          return;
        }
        clearTimeout(timer);
        setSlow(false);
        setRestaurant({
          id: data.id,
          name: typeof data.name === "string" ? data.name : "",
          establishmentType: typeof data.establishmentType === "string" ? data.establishmentType : "",
          brand: { logo: "", cover: "", logoSmall: "", coverSmall: "", palette: null, customPalette: null, panelPalette: null, panelCustomPalette: null, ...(data.brand as Partial<Brand> | undefined) },
          settings: (data.settings as Partial<RestaurantSettings> | undefined) || {},
        });
        setStatus("ready");
      },
      () => {
        clearTimeout(timer);
        setStatus("error");
      },
    );
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [slug, retryKey]);

  // Os produtos só são lidos quando o cliente abre o cardápio (a página inicial não precisa deles).
  useEffect(() => {
    if (!restaurantId || !loadProducts) return;
    setProductsLoaded(false);
    return watchPublicRestaurantProducts(
      restaurantId,
      (items, meta) => {
        if (meta.fromCache && !items.length) return;
        setProducts(items);
        setProductsLoaded(true);
      },
      () => setStatus("error"),
    );
  }, [restaurantId, retryKey, loadProducts]);

  useEffect(() => {
    if (!restaurantId || !loadProducts) return;
    // Sem categorias o cardápio ainda funciona, agrupando pelo nome salvo no produto.
    return watchPublicRestaurantCategories(restaurantId, (items) => setCategories(items), () => setCategories([]));
  }, [restaurantId, retryKey, loadProducts]);

  useEffect(() => {
    if (!tableToken) {
      setTableName("");
      setTableState("none");
      return;
    }
    if (!restaurantId) return;
    setTableState("checking");
    // O token só identifica uma mesa se existir dentro deste restaurante.
    return watchPublicTable(
      restaurantId,
      tableToken,
      (table) => {
        setTableName(table?.name || "");
        setTableState(table ? "valid" : "invalid");
      },
      () => setTableState("invalid"),
    );
  }, [restaurantId, tableToken]);

  const sections = useMemo<MenuSection[]>(() => {
    const byId = new Map(categories.map((category) => [category.id, category]));
    const groups = new Map<string, MenuSection & { order: number }>();
    for (const product of products) {
      const category = product.categoryId ? byId.get(product.categoryId) : undefined;
      // Categoria oculta no painel esconde seus produtos do link público.
      if (category && category.active === false) continue;
      const name = category?.name || product.category || "Outros";
      const key = category ? category.id : `nome:${normalize(name)}`;
      const group = groups.get(key) || { key, name, order: category ? Number(category.order) || 0 : Number.MAX_SAFE_INTEGER, items: [] };
      group.items.push(product);
      groups.set(key, group);
    }
    return Array.from(groups.values())
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "pt-BR"))
      .map(({ key, name, items }) => ({ key, name, items }));
  }, [products, categories]);

  return { status, slow, restaurant, productsLoaded, sections, tableName, tableState };
}

function useCustomer() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return onAuthStateChanged(getFirebaseAuth(), setUser);
  }, []);
  const uid = user?.uid || "";
  useEffect(() => {
    setProfile(null);
    setProfileLoaded(false);
    if (!uid) return;
    return watchCustomerProfile(
      uid,
      (data, meta) => {
        if (!data && meta.fromCache) return;
        setProfile(data);
        setProfileLoaded(true);
      },
      () => setProfileLoaded(true),
    );
  }, [uid]);
  return { user, profile, profileLoaded };
}

/* ───────────────────────── Tela principal ───────────────────────── */

/**
 * Experiência pública do restaurante:
 *  - /r/[slug]?mesa=TOKEN           → página inicial do QR Code (ações de atendimento)
 *  - /r/[slug]/cardapio?mesa=TOKEN  → cardápio digital
 * As duas telas compartilham os dados já carregados ao navegar entre elas.
 */
export default function PublicMenu({ slug, tableToken, view, notify }: { slug: string; tableToken: string; view: "home" | "menu"; notify: Notify }) {
  const [retryKey, setRetryKey] = useState(0);
  const [menuOpened, setMenuOpened] = useState(view === "menu");
  useEffect(() => {
    if (view === "menu") setMenuOpened(true);
  }, [view]);
  const { status, slow, restaurant, productsLoaded, sections, tableName, tableState } = usePublicMenuData(slug, tableToken, retryKey, menuOpened);
  const mesaQuery = tableToken ? `?mesa=${encodeURIComponent(tableToken)}` : "";
  const homeHref = `/r/${slug}${mesaQuery}`;
  const customer = useCustomer();
  const [tab, setTab] = useState<Tab>("menu");
  const [panel, setPanel] = useState<PanelState>(null);
  const menuScroll = useRef(0);

  const goTo = (next: Tab) => {
    if (next === tab) {
      if (next === "menu") window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (tab === "menu") menuScroll.current = window.scrollY;
    setTab(next);
  };
  // Ao voltar ao cardápio, a rolagem (e a categoria ativa) continuam de onde o cliente parou.
  useEffect(() => {
    window.scrollTo(0, tab === "menu" ? menuScroll.current : 0);
  }, [tab]);

  // Abre o visualizador no produto tocado, navegando pela lista em que ele está (categoria ou busca).
  const openReels = (product: RestaurantProduct, list: RestaurantProduct[]) =>
    setPanel({ type: "reels", items: list, index: Math.max(0, list.findIndex((item) => item.id === product.id)) });

  const requireLogin = (next: Exclude<PanelState, null>) => setPanel(customer.user ? next : { type: "login" });

  if (status !== "ready" || !restaurant) {
    return (
      <div className="pm-app">
        <div className="pm-column">
          <div className="pm-platform" aria-hidden>
            <span>KARDAP</span>
          </div>
          <MenuState status={status} slow={slow} onRetry={() => setRetryKey((key) => key + 1)} />
        </div>
      </div>
    );
  }

  if (view === "home")
    return (
      <QrHome
        restaurant={restaurant}
        tableToken={tableToken}
        tableName={tableName}
        tableState={tableState}
        menuHref={`/r/${slug}/cardapio${mesaQuery}`}
      />
    );

  return (
    <div className="pm-app">
      <div className="pm-column">
        {tab !== "profile" && (
          <div className="pm-platform">
            <Link className="pm-platform-back" href={homeHref} aria-label="Voltar ao início (chamar garçom, pedir a conta)">
              <ArrowLeft size={15} aria-hidden />
              <span>Início</span>
            </Link>
            <span>KARDAP</span>
          </div>
        )}

        <div hidden={tab !== "menu"}>
          <RestaurantHeader
            restaurant={restaurant}
            tableName={tableName}
            onInfo={() => setPanel({ type: "info" })}
          />
          <MenuList
            active={tab === "menu"}
            sections={sections}
            loaded={productsLoaded}
            onOpen={openReels}
          />
        </div>

        {tab === "search" && <SearchScreen sections={sections} loaded={productsLoaded} onOpen={openReels} />}

        {tab === "profile" && (
          <ProfileScreen
            user={customer.user}
            profile={customer.profile}
            onBack={() => goTo("menu")}
            onOpen={requireLogin}
            onLogin={() => setPanel({ type: "login" })}
            onLogout={async () => {
              try {
                await signOutCustomer();
                notify("Você saiu da sua conta");
              } catch (error) {
                notify(friendlyError(error, "Não foi possível sair agora. Tente de novo."), "error");
              }
            }}
          />
        )}

        <BottomNav tab={tab} onChange={goTo} />
      </div>

      {panel?.type === "reels" && <ReelsViewer items={panel.items} startIndex={panel.index} priceOf={productPrice} onClose={() => setPanel(null)} />}
      {panel?.type === "info" && (
        <InfoPanel restaurant={restaurant} onClose={() => setPanel(null)} />
      )}
      {panel?.type === "login" && <LoginPanel onClose={() => setPanel(null)} onDone={() => { setPanel(null); notify("Você entrou na sua conta"); }} />}
      {panel?.type === "account" && customer.user && (
        <AccountPanel user={customer.user} profile={customer.profile} onClose={() => setPanel(null)} notify={notify} />
      )}
      {panel?.type === "notifications" && customer.user && (
        <NotificationsPanel user={customer.user} profile={customer.profile} onClose={() => setPanel(null)} notify={notify} />
      )}
      {panel?.type === "addresses" && customer.user && (
        <AddressesPanel user={customer.user} profile={customer.profile} loaded={customer.profileLoaded} onClose={() => setPanel(null)} notify={notify} />
      )}
    </div>
  );
}

function MenuState({ status, slow, onRetry }: { status: "loading" | "ready" | "not-found" | "error"; slow: boolean; onRetry: () => void }) {
  if (status !== "not-found" && status !== "error" && !slow)
    return (
      <div aria-busy="true" aria-label="Carregando cardápio">
        <div className="pm-restaurant">
          <div className="pm-restaurant-main">
            <span className="pm-skel" style={{ width: 38, height: 38 }} />
            <span className="pm-restaurant-text">
              <span className="pm-skel" style={{ width: "55%", height: 14 }} />
              <span className="pm-skel" style={{ width: "35%", height: 11 }} />
            </span>
          </div>
        </div>
        <ProductSkeleton />
      </div>
    );
  const copy =
    status === "not-found"
      ? { title: "Cardápio não encontrado", text: "Este link não corresponde a nenhum restaurante ativo. Confira o QR Code ou peça ajuda à equipe." }
      : status === "error"
        ? { title: "Não foi possível abrir o cardápio", text: "Verifique sua conexão e tente de novo. Se continuar, peça o cardápio à equipe." }
        : { title: "A conexão está lenta", text: "Ainda estamos carregando o cardápio. Você pode esperar mais um pouco ou tentar de novo." };
  return (
    <div className="pm-state" role={status === "error" ? "alert" : "status"}>
      {status === "loading" && <LoaderCircle className="pm-spin" size={20} aria-hidden />}
      <h1 className="pm-state-title">{copy.title}</h1>
      <p className="pm-state-text">{copy.text}</p>
      {status !== "not-found" && (
        <button type="button" className="pm-btn" onClick={onRetry}>
          Tentar de novo
        </button>
      )}
    </div>
  );
}

function ProductSkeleton() {
  return (
    <div className="pm-sections" aria-hidden>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="pm-product">
          <span className="pm-product-info" style={{ gap: 6 }}>
            <span className="pm-skel" style={{ width: "40%", height: 13 }} />
            <span className="pm-skel" style={{ width: "92%", height: 11 }} />
            <span className="pm-skel" style={{ width: "80%", height: 11 }} />
            <span className="pm-skel" style={{ width: 54, height: 12, marginTop: 8 }} />
          </span>
          <span className="pm-skel" style={{ width: 80, height: 80, borderRadius: 6 }} />
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────── Cabeçalho ───────────────────────── */

function useOpenStatus(hours?: WeeklyHours) {
  const [open, setOpen] = useState<boolean | null>(() => openStatus(hours));
  useEffect(() => {
    setOpen(openStatus(hours));
    const timer = setInterval(() => setOpen(openStatus(hours)), 60_000);
    return () => clearInterval(timer);
  }, [hours]);
  return open;
}

function StatusPill({ open }: { open: boolean }) {
  return (
    <span className={`pm-status ${open ? "" : "pm-status--closed"}`}>
      <Clock size={10} strokeWidth={2.4} aria-hidden />
      {open ? "Aberto" : "Fechado"}
    </span>
  );
}

function RestaurantLogo({ restaurant, size = 38 }: { restaurant: PublicRestaurant; size?: number }) {
  return (
    <span className="pm-logo" style={size !== 38 ? { width: size, height: size } : undefined}>
      {restaurant.brand.logo ? (
        <img src={restaurant.brand.logo} alt="" width={size} height={size} decoding="async" />
      ) : (
        (restaurant.name.trim()[0] || "K").toUpperCase()
      )}
    </span>
  );
}

function RestaurantHeader({ restaurant, tableName, onInfo }: { restaurant: PublicRestaurant; tableName: string; onInfo: () => void }) {
  const open = useOpenStatus(restaurant.settings.hours);
  const delivery = restaurant.settings.service?.delivery;
  return (
    <header className="pm-restaurant">
      <button type="button" className="pm-restaurant-main" onClick={onInfo} aria-label={`Informações de ${restaurant.name || "estabelecimento"}`}>
        <RestaurantLogo restaurant={restaurant} />
        <span className="pm-restaurant-text">
          <h1 className="pm-restaurant-name">{restaurant.name || "Cardápio"}</h1>
          <span className="pm-restaurant-meta">
            {restaurant.establishmentType && (
              <span className="pm-kind">
                <UtensilsCrossed size={11} aria-hidden />
                {restaurant.establishmentType}
              </span>
            )}
            {open !== null && <StatusPill open={open} />}
            {tableName && <span>{tableName}</span>}
          </span>
        </span>
        <ChevronRight className="pm-chevron" size={16} aria-hidden />
      </button>
      <div className="pm-restaurant-links">
        <button type="button" className="pm-text-link" onClick={onInfo}>
          {delivery ? <Bike size={13} aria-hidden /> : <Clock size={12} aria-hidden />}
          {delivery ? "Ver tempo e taxa de entrega" : "Ver horários e atendimento"}
        </button>
      </div>
    </header>
  );
}

/* ───────────────────────── Listagem ───────────────────────── */

function MenuList({
  active,
  sections,
  loaded,
  onOpen,
}: {
  active: boolean;
  sections: MenuSection[];
  loaded: boolean;
  onOpen: OpenProduct;
}) {
  const [current, setCurrent] = useState("");
  const barRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const lock = useRef<{ key: string; until: number } | null>(null);
  const activeKey = current || sections[0]?.key || "";

  // A categoria ativa acompanha a seção que está logo abaixo da barra fixa.
  useEffect(() => {
    if (!active || !sections.length) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      if (lock.current && Date.now() < lock.current.until) return;
      lock.current = null;
      const barBottom = barRef.current?.getBoundingClientRect().bottom ?? 0;
      let key = sections[0].key;
      for (const section of sections) {
        const el = document.getElementById(`pm-sec-${section.key}`);
        if (el && el.getBoundingClientRect().top - barBottom <= 12) key = section.key;
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) key = sections[sections.length - 1].key;
      setCurrent(key);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [active, sections]);

  // Mantém o botão ativo visível na rolagem horizontal da barra.
  useEffect(() => {
    const track = trackRef.current;
    const button = track?.querySelector<HTMLElement>(`[data-key="${CSS.escape(activeKey)}"]`);
    if (!track || !button) return;
    const left = button.offsetLeft - 12;
    const right = button.offsetLeft + button.offsetWidth + 12 - track.clientWidth;
    if (track.scrollLeft > left) track.scrollTo({ left, behavior: "smooth" });
    else if (track.scrollLeft < right) track.scrollTo({ left: right, behavior: "smooth" });
  }, [activeKey]);

  const select = (key: string) => {
    const el = document.getElementById(`pm-sec-${key}`);
    if (!el) return;
    const barHeight = barRef.current?.offsetHeight ?? 0;
    const top = el.getBoundingClientRect().top + window.scrollY - barHeight + 1;
    lock.current = { key, until: Date.now() + 900 };
    setCurrent(key);
    window.scrollTo({ top, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  if (!loaded) return <ProductSkeleton />;
  if (!sections.length)
    return (
      <p className="pm-empty" role="status">
        <b>O cardápio está sendo preparado</b>
        Ainda não há produtos publicados. Peça o cardápio à equipe.
      </p>
    );

  return (
    <>
      <nav className="pm-categories" ref={barRef} aria-label="Categorias do cardápio">
        <div className="pm-categories-track" ref={trackRef}>
          {sections.map((section) => (
            <button
              key={section.key}
              type="button"
              data-key={section.key}
              className={`pm-category ${section.key === activeKey ? "is-active" : ""}`}
              aria-current={section.key === activeKey ? "true" : undefined}
              onClick={() => select(section.key)}
            >
              {section.name}
            </button>
          ))}
        </div>
      </nav>
      <div className="pm-sections">
        {sections.map((section) => (
          <section key={section.key} id={`pm-sec-${section.key}`} className="pm-section" aria-labelledby={`pm-sec-title-${section.key}`}>
            <h2 className="pm-section-title" id={`pm-sec-title-${section.key}`}>
              {section.name}
            </h2>
            <ProductList items={section.items} onOpen={onOpen} />
          </section>
        ))}
      </div>
    </>
  );
}

type OpenProduct = (product: RestaurantProduct, list: RestaurantProduct[]) => void;

function ProductList({ items, onOpen }: { items: RestaurantProduct[]; onOpen: OpenProduct }) {
  return (
    <ul className="pm-products">
      {items.map((product) => (
        <li key={product.id}>
          <ProductRow product={product} onOpen={() => onOpen(product, items)} />
        </li>
      ))}
    </ul>
  );
}

function ProductRow({ product, onOpen }: { product: RestaurantProduct; onOpen: () => void }) {
  const price = productPrice(product);
  return (
    <button type="button" className="pm-product" onClick={onOpen}>
      <span className="pm-product-info">
        <span className="pm-product-name">{product.name}</span>
        {product.description?.trim() && <span className="pm-product-desc">{product.description.trim()}</span>}
        <span className="pm-more">Ver mais</span>
        {price && <span className="pm-price">{price}</span>}
      </span>
      <ProductThumb product={product} />
    </button>
  );
}

function ProductThumb({ product }: { product: RestaurantProduct }) {
  const [failed, setFailed] = useState(false);
  if (product.image && !failed)
    return (
      <span className="pm-thumb">
        <img src={product.image} alt="" width={80} height={80} loading="lazy" decoding="async" onError={() => setFailed(true)} />
      </span>
    );
  // Placeholder neutro: não simula uma foto que o restaurante não enviou.
  return (
    <span className="pm-thumb" aria-hidden>
      {product.videoUrl ? <Play size={20} /> : <UtensilsCrossed size={20} strokeWidth={1.5} />}
    </span>
  );
}

/* ───────────────────────── Busca ───────────────────────── */

function SearchScreen({ sections, loaded, onOpen }: { sections: MenuSection[]; loaded: boolean; onOpen: OpenProduct }) {
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState("");
  const deferred = useDeferredValue(term);
  const needle = normalize(deferred);
  const index = useMemo(
    () =>
      sections.flatMap((section) =>
        section.items.map((product) => ({
          product,
          section: section.key,
          text: normalize(`${product.name} ${product.description || ""} ${section.name}`),
        })),
      ),
    [sections],
  );
  const searching = Boolean(needle || category);
  const results = searching
    ? index.filter((entry) => (!category || entry.section === category) && needle.split(/\s+/).every((word) => entry.text.includes(word)))
    : [];

  return (
    <div className="pm-screen">
      <div className="pm-search">
        <label className="pm-search-field">
          <span className="sr-only">Buscar produtos</span>
          <Search size={15} aria-hidden />
          <input
            className="pm-input"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            placeholder="Buscar produtos"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
          {term && (
            <button type="button" className="pm-search-clear" onClick={() => setTerm("")} aria-label="Limpar busca">
              <X size={15} />
            </button>
          )}
        </label>
        {sections.length > 0 && (
          <>
            <p className="pm-search-label">Categorias:</p>
            <div className="pm-pills">
              {sections.map((section) => (
                <button
                  key={section.key}
                  type="button"
                  className={`pm-pill ${category === section.key ? "is-active" : ""}`}
                  aria-pressed={category === section.key}
                  onClick={() => setCategory((current) => (current === section.key ? "" : section.key))}
                >
                  {section.name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {searching && (
        <div className="pm-results" aria-live="polite">
          {!loaded ? (
            <ProductSkeleton />
          ) : results.length ? (
            <>
              <p className="pm-results-count">
                {results.length} {results.length === 1 ? "produto encontrado" : "produtos encontrados"}
              </p>
              <ProductList items={results.map((entry) => entry.product)} onOpen={onOpen} />
            </>
          ) : (
            <p className="pm-empty">
              <b>Nenhum produto encontrado</b>
              {needle ? `Não há resultados para “${deferred.trim()}”.` : "Esta categoria não tem produtos."}
            </p>
          )}
        </div>
      )}

      <Signature />
    </div>
  );
}

function Signature() {
  return (
    <p className="pm-signature">
      Uma experiência <b>KARDAP</b>
    </p>
  );
}

/* ───────────────────────── Perfil ───────────────────────── */

function ProfileScreen({
  user,
  profile,
  onBack,
  onOpen,
  onLogin,
  onLogout,
}: {
  user: User | null;
  profile: CustomerProfile | null;
  onBack: () => void;
  onOpen: (panel: Exclude<PanelState, null>) => void;
  onLogin: () => void;
  onLogout: () => void;
}) {
  const name = profile?.name || user?.displayName || user?.email || "visitante";
  const options = [
    { panel: { type: "account" } as const, icon: FileText, title: "Meu perfil", sub: "Edite ou atualize seus dados" },
    { panel: { type: "notifications" } as const, icon: Mail, title: "Notificações por e-mail", sub: "Receba notificações direto no e-mail" },
    { panel: { type: "addresses" } as const, icon: MapPin, title: "Meus endereços", sub: "Edite ou atualize seus endereços" },
  ];
  return (
    <>
      <SubHeader title="Perfil" onBack={onBack} />
      <div className="pm-profile">
        <div className="pm-greeting">
          <span>Olá,</span>
          <strong>{name}</strong>
        </div>
        <div className="pm-options">
          {options.map(({ panel, icon: Icon, title, sub }) => (
            <button key={title} type="button" className="pm-option" onClick={() => onOpen(panel)}>
              <Icon size={17} strokeWidth={1.6} aria-hidden />
              <span className="pm-option-text">
                <span className="pm-option-title">{title}</span>
                <span className="pm-option-sub">{sub}</span>
              </span>
              <ChevronRight size={14} aria-hidden />
            </button>
          ))}
        </div>
        <div className="pm-profile-bottom">
          {user ? (
            <button type="button" className="pm-option pm-option--danger" onClick={onLogout}>
              <LogOut size={17} strokeWidth={1.6} aria-hidden />
              <span className="pm-option-text">
                <span className="pm-option-title">Sair</span>
              </span>
              <ChevronRight size={14} aria-hidden />
            </button>
          ) : (
            <button type="button" className="pm-option" onClick={onLogin}>
              <LogIn size={17} strokeWidth={1.6} aria-hidden />
              <span className="pm-option-text">
                <span className="pm-option-title">Entrar ou criar conta</span>
                <span className="pm-option-sub">Salve seus dados e endereços</span>
              </span>
              <ChevronRight size={14} aria-hidden />
            </button>
          )}
          <p className="pm-profile-note">Seu cadastro é uma conta KARDAP e pode ser utilizado em todos os estabelecimentos que usam o KARDAP.</p>
          <Signature />
        </div>
      </div>
    </>
  );
}

/* ───────────────────────── Navegação ───────────────────────── */

function BottomNav({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  const items: { key: Tab; label: string; icon: typeof BookOpen }[] = [
    { key: "menu", label: "Cardápio", icon: BookOpen },
    { key: "search", label: "Busca", icon: Search },
    { key: "profile", label: "Perfil", icon: UserIcon },
  ];
  return (
    <nav className="pm-nav" aria-label="Navegação do cardápio">
      {items.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          className={`pm-nav-item ${tab === key ? "is-active" : ""}`}
          aria-current={tab === key ? "page" : undefined}
          onClick={() => onChange(key)}
        >
          <Icon size={16} strokeWidth={tab === key ? 2.2 : 1.7} aria-hidden />
          {label}
        </button>
      ))}
    </nav>
  );
}

/* ───────────────────────── Painéis ───────────────────────── */

function formatRange(day?: { open: boolean; from: string; to: string }) {
  return day?.open && day.from && day.to ? `${day.from} às ${day.to}` : "Fechado";
}

function InfoPanel({ restaurant, onClose }: { restaurant: PublicRestaurant; onClose: () => void }) {
  const { settings, brand } = restaurant;
  const open = useOpenStatus(settings.hours);
  const service: Partial<ServiceInfo> = settings.service || {};
  const today = useMemo(() => {
    const name = new Intl.DateTimeFormat("en-US", { timeZone: RESTAURANT_TIME_ZONE, weekday: "short" }).format(new Date());
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
  }, []);
  const modes = [
    service.dineIn && { icon: UtensilsCrossed, title: "Consumo no local", detail: "" },
    service.pickup && { icon: ShoppingBag, title: "Retirada", detail: service.pickupEta ? `Pronto em ${service.pickupEta}` : "" },
    service.delivery && {
      icon: Bike,
      title: "Entrega",
      detail: [
        service.deliveryEta && `Tempo: ${service.deliveryEta}`,
        typeof service.deliveryFeeCents === "number" && `Taxa: ${service.deliveryFeeCents === 0 ? "grátis" : brl.format(service.deliveryFeeCents / 100)}`,
        service.deliveryArea && `Área: ${service.deliveryArea}`,
      ]
        .filter(Boolean)
        .join(" · "),
    },
  ].filter(Boolean) as { icon: typeof Bike; title: string; detail: string }[];

  return (
    <Panel title={restaurant.name || "Informações"} onClose={onClose}>
      {brand.cover && <img className="pm-info-cover" src={brand.cover} alt="" decoding="async" />}
      <div className="pm-block">
        <div className="pm-restaurant-main" style={{ gridTemplateColumns: "38px minmax(0, 1fr)" }}>
          <RestaurantLogo restaurant={restaurant} />
          <span className="pm-restaurant-text">
            <h2 className="pm-restaurant-name">{restaurant.name}</h2>
            <span className="pm-restaurant-meta">
              {restaurant.establishmentType && (
                <span className="pm-kind">
                  <UtensilsCrossed size={11} aria-hidden />
                  {restaurant.establishmentType}
                </span>
              )}
              {open !== null && <StatusPill open={open} />}
            </span>
          </span>
        </div>
      </div>
      <div className="pm-block">
        <h3 className="pm-block-title">Atendimento</h3>
        {modes.length ? (
          <ul className="pm-info-list">
            {modes.map(({ icon: Icon, title, detail }) => (
              <li key={title} className="pm-info-row">
                <Icon size={15} aria-hidden />
                <span>
                  {title}
                  {detail && <small>{detail}</small>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pm-muted pm-small">O estabelecimento ainda não informou tempo, taxa de entrega ou formas de atendimento.</p>
        )}
      </div>
      <div className="pm-block">
        <h3 className="pm-block-title">Horário de funcionamento</h3>
        {hasHours(settings.hours) ? (
          <ul className="pm-hours">
            {WEEKDAYS.map((label, day) => (
              <li key={label} className={day === today ? "is-today" : ""}>
                <span>{label}</span>
                <span>{formatRange(settings.hours?.[String(day)])}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pm-muted pm-small">Horários não informados pelo estabelecimento.</p>
        )}
      </div>
    </Panel>
  );
}
