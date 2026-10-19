"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bike,
  BookOpen,
  Check,
  ChevronRight,
  Clock,
  LoaderCircle,
  MapPin,
  Minus,
  Play,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  UtensilsCrossed,
  X,
} from "lucide-react";
import {
  watchPublicRestaurant,
  watchPublicRestaurantCategories,
  watchPublicRestaurantProducts,
  type RestaurantCategory,
  type RestaurantProduct,
} from "@/lib/restaurant-db";
import { isFirebaseConfigured } from "@/lib/firebase";
import { friendlyError } from "@/lib/async";
import { hasHours, openStatus, RESTAURANT_TIME_ZONE, WEEKDAYS, type ServiceInfo, type WeeklyHours } from "@/lib/restaurant-hours";
import type { Brand, RestaurantSettings } from "@/components/dashboard/types";
import type { DeliveryCheckoutPayload } from "@/lib/delivery/types";
import { PAYMENT_METHOD_LABELS } from "@/lib/delivery/types";
import { productPrice } from "../public-menu/public-menu";
import ReelsViewer from "./reels-viewer";
import { Panel, SubHeader } from "./panel";

type Notify = (message: string, tone?: "success" | "error") => void;
type Tab = "menu" | "search" | "cart";

// ───────────────────────── Types ─────────────────────────

type Restaurant = {
  id: string;
  name: string;
  establishmentType: string;
  brand: Partial<Brand>;
  settings: Partial<RestaurantSettings>;
};
type Section = { key: string; name: string; items: RestaurantProduct[] };

// ───────────────────────── Cart state ─────────────────────────

type CartItem = {
  productId: string;
  name: string;
  priceCents: number;
  quantity: number;
  notes: string;
  image?: string;
};

function cartStorageKey(restaurantId: string) { return `kardap_cart_dl_${restaurantId}`; }

function loadCartFromStorage(restaurantId: string): CartItem[] {
  if (!restaurantId) return [];
  try {
    const raw = localStorage.getItem(cartStorageKey(restaurantId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const MAX_AGE = 4 * 60 * 60 * 1000;
    const saved = parsed as Array<CartItem & { savedAt?: number }>;
    if (saved[0]?.savedAt && Date.now() - saved[0].savedAt > MAX_AGE) return [];
    return saved.map(({ savedAt: _, ...item }) => item);
  } catch { return []; }
}

function saveCartToStorage(restaurantId: string, items: CartItem[]) {
  if (!restaurantId) return;
  try {
    if (!items.length) { localStorage.removeItem(cartStorageKey(restaurantId)); return; }
    const withTimestamp = items.map((item, i) => i === 0 ? { ...item, savedAt: Date.now() } : item);
    localStorage.setItem(cartStorageKey(restaurantId), JSON.stringify(withTimestamp));
  } catch {}
}

function useCart(restaurantId: string) {
  const [items, setItems] = useState<CartItem[]>(() => loadCartFromStorage(restaurantId));
  const ridRef = useRef(restaurantId);

  useEffect(() => {
    if (restaurantId && restaurantId !== ridRef.current) {
      ridRef.current = restaurantId;
      setItems(loadCartFromStorage(restaurantId));
    }
  }, [restaurantId]);

  useEffect(() => { saveCartToStorage(ridRef.current, items); }, [items]);

  const add = useCallback((product: RestaurantProduct, notes = "") => {
    const priceCents = parsePriceCents(product);
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === product.id && i.notes === notes);
      if (existing) return prev.map((i) => i.productId === product.id && i.notes === notes ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { productId: product.id, name: product.name, priceCents, quantity: 1, notes, image: product.image }];
    });
  }, []);

  const remove = useCallback((productId: string) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  }, []);

  const updateQty = useCallback((productId: string, qty: number) => {
    if (qty <= 0) {
      setItems((prev) => prev.filter((i) => i.productId !== productId));
      return;
    }
    setItems((prev) => prev.map((i) => i.productId === productId ? { ...i, quantity: Math.min(99, qty) } : i));
  }, []);

  const updateNotes = useCallback((productId: string, notes: string) => {
    setItems((prev) => prev.map((i) => i.productId === productId ? { ...i, notes } : i));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const subtotalCents = items.reduce((sum, i) => sum + i.priceCents * i.quantity, 0);
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);

  return { items, add, remove, updateQty, updateNotes, clear, subtotalCents, totalItems };
}

function parsePriceCents(product: RestaurantProduct): number {
  if (typeof product.priceCents === "number" && Number.isFinite(product.priceCents)) return product.priceCents;
  const raw = String(product.price ?? "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

// ───────────────────────── Normalize (busca) ─────────────────────────

const normalize = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

// ───────────────────────── Data loading ─────────────────────────

function useDeliveryData(slug: string) {
  const [status, setStatus] = useState<"loading" | "ready" | "not-found" | "error">("loading");
  const [slow, setSlow] = useState(false);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [products, setProducts] = useState<RestaurantProduct[]>([]);
  const [categories, setCategories] = useState<RestaurantCategory[]>([]);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const restaurantId = restaurant?.id || "";

  useEffect(() => {
    if (!slug || !isFirebaseConfigured) { setStatus(slug ? "error" : "not-found"); return; }
    setStatus("loading");
    setSlow(false);
    const timer = setTimeout(() => setSlow(true), 9000);
    const stop = watchPublicRestaurant(slug, (data, meta) => {
      if (!data) { if (!meta.fromCache) { clearTimeout(timer); setStatus("not-found"); } return; }
      clearTimeout(timer);
      setSlow(false);
      setRestaurant({
        id: data.id,
        name: typeof data.name === "string" ? data.name : "",
        establishmentType: typeof data.establishmentType === "string" ? data.establishmentType : "",
        brand: (data.brand as Partial<Brand> | undefined) || {},
        settings: (data.settings as Partial<RestaurantSettings> | undefined) || {},
      });
      setStatus("ready");
    }, () => { clearTimeout(timer); setStatus("error"); });
    return () => { clearTimeout(timer); stop(); };
  }, [slug]);

  useEffect(() => {
    if (!restaurantId) return;
    setProductsLoaded(false);
    return watchPublicRestaurantProducts(restaurantId, (items, meta) => {
      if (meta.fromCache && !items.length) return;
      setProducts(items);
      setProductsLoaded(true);
    }, () => setStatus("error"));
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId) return;
    return watchPublicRestaurantCategories(restaurantId, (items) => setCategories(items), () => setCategories([]));
  }, [restaurantId]);

  const sections = useMemo<Section[]>(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    const groups = new Map<string, Section & { order: number }>();
    for (const product of products) {
      const cat = product.categoryId ? byId.get(product.categoryId) : undefined;
      if (cat && cat.active === false) continue;
      const name = cat?.name || product.category || "Outros";
      const key = cat ? cat.id : `nome:${normalize(name)}`;
      const group = groups.get(key) || { key, name, order: cat ? Number(cat.order) || 0 : Number.MAX_SAFE_INTEGER, items: [] };
      group.items.push(product);
      groups.set(key, group);
    }
    return Array.from(groups.values())
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "pt-BR"))
      .map(({ key, name, items }) => ({ key, name, items }));
  }, [products, categories]);

  return { status, slow, restaurant, sections, productsLoaded };
}

// ───────────────────────── Delivery config ─────────────────────────

type DeliveryMenuConfig = {
  deliveryFeeCents: number;
  deliveryEta: string;
  deliveryArea: string;
  minOrderCents: number;
  paymentMethods: string[];
  notes: string;
  feeMode: "taxa_fixa" | "taxa_por_bairro";
  servedCities: { ibgeCode: string; name: string; uf: string }[];
};

function useDeliveryConfig(restaurantId: string) {
  const [config, setConfig] = useState<DeliveryMenuConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!restaurantId) return;
    setLoading(true);
    fetch(`/api/delivery/menu?restaurantId=${encodeURIComponent(restaurantId)}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || "Delivery indisponível.");
        }
        return res.json();
      })
      .then(setConfig)
      .catch((err) => setError(err.message || "Delivery indisponível."))
      .finally(() => setLoading(false));
  }, [restaurantId]);

  return { config, loading, error };
}

type FeeState = { feeCents: number | null; loading: boolean; matched: boolean; reason?: string; servedNeighborhoods?: { name: string; slug: string }[] };

function useDeliveryFee(
  restaurantId: string,
  feeMode: "taxa_fixa" | "taxa_por_bairro" | undefined,
  city: string,
  district: string,
  uf: string,
  flatFeeCents: number,
  servedCities: { ibgeCode: string; name: string; uf: string }[],
): FeeState {
  const [state, setState] = useState<FeeState>({ feeCents: flatFeeCents, loading: false, matched: true });
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const lastQuery = useRef("");

  useEffect(() => {
    if (!feeMode || (feeMode === "taxa_fixa" && !servedCities.length)) {
      setState({ feeCents: flatFeeCents, loading: false, matched: true });
      return;
    }

    const q = `${city}|${district}|${uf}`;
    if (q === lastQuery.current) return;

    if (!city) {
      setState({ feeCents: null, loading: false, matched: true });
      return;
    }

    setState((s) => ({ ...s, loading: true }));
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      lastQuery.current = q;
      try {
        const params = new URLSearchParams({ restaurantId, city, district, uf });
        const res = await fetch(`/api/delivery/fee?${params}`);
        const data = await res.json();
        setState({
          feeCents: data.matched ? data.feeCents : null,
          loading: false,
          matched: data.matched,
          reason: data.reason,
          servedNeighborhoods: data.servedNeighborhoods,
        });
      } catch {
        setState({ feeCents: flatFeeCents, loading: false, matched: true });
      }
    }, 500);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [restaurantId, feeMode, city, district, uf, flatFeeCents, servedCities]);

  return state;
}

// ───────────────────────── Open Status (para o header) ─────────────────────────

function useOpenStatus(hours?: WeeklyHours) {
  const [open, setOpen] = useState<boolean | null>(() => openStatus(hours));
  useEffect(() => {
    setOpen(openStatus(hours));
    const timer = setInterval(() => setOpen(openStatus(hours)), 60_000);
    return () => clearInterval(timer);
  }, [hours]);
  return open;
}

// ───────────────────────── Main component ─────────────────────────

type Step = "menu" | "checkout" | "confirmation";
type PanelState =
  | { type: "reels"; items: RestaurantProduct[]; index: number }
  | { type: "product"; product: RestaurantProduct }
  | { type: "info" }
  | null;

export default function DeliveryMenu({ slug, notify }: { slug: string; notify: Notify }) {
  const { status, slow, restaurant, sections, productsLoaded } = useDeliveryData(slug);
  const cart = useCart(restaurant?.id || "");
  const [step, setStep] = useState<Step>("menu");
  const [tab, setTab] = useState<Tab>("menu");
  const [panel, setPanel] = useState<PanelState>(null);
  const [orderResult, setOrderResult] = useState<{ orderId: string; orderNumber: number } | null>(null);
  const deliveryConfig = useDeliveryConfig(restaurant?.id || "");
  const menuScroll = useRef(0);

  const goTo = (next: Tab) => {
    if (next === tab) {
      if (next === "menu") window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (tab === "menu") menuScroll.current = window.scrollY;
    setTab(next);
  };

  useEffect(() => {
    window.scrollTo(0, tab === "menu" ? menuScroll.current : 0);
  }, [tab]);

  const openReels = (product: RestaurantProduct, list: RestaurantProduct[]) =>
    setPanel({ type: "reels", items: list, index: Math.max(0, list.findIndex((item) => item.id === product.id)) });

  const openProduct = (product: RestaurantProduct) =>
    setPanel({ type: "product", product });

  if (status !== "ready" || !restaurant) {
    return (
      <div className="pm-app">
        <div className="pm-column">
          <div className="pm-platform" aria-hidden>
            <span>KARDAP</span>
          </div>
          <DeliveryMenuState status={status} slow={slow} />
        </div>
      </div>
    );
  }

  if (deliveryConfig.error) {
    return (
      <div className="pm-app">
        <div className="pm-column">
          <div className="pm-platform"><span>KARDAP</span></div>
          <div className="pm-state">
            <h1 className="pm-state-title">Delivery indisponível</h1>
            <p className="pm-state-text">{deliveryConfig.error}</p>
            <Link href={`/r/${slug}`} className="pm-btn" style={{ marginTop: 12 }}>Ver cardápio</Link>
          </div>
        </div>
      </div>
    );
  }

  const feeMode = deliveryConfig.config?.feeMode || "taxa_fixa";
  const servedCities = deliveryConfig.config?.servedCities || [];
  const flatFeeCents = deliveryConfig.config?.deliveryFeeCents ?? 0;
  const showFeeInCart = feeMode === "taxa_fixa" || !servedCities.length;
  const deliveryFeeCents = showFeeInCart ? flatFeeCents : null;

  if (step === "checkout") {
    return (
      <div className="pm-app">
        <div className="pm-column">
          <div className="pm-platform">
            <button className="pm-platform-back" onClick={() => setStep("menu")}>
              <ArrowLeft size={15} />
              <span>Voltar</span>
            </button>
            <span>Delivery</span>
          </div>
          <CheckoutForm
            restaurantId={restaurant.id}
            cart={cart}
            deliveryFeeCents={flatFeeCents}
            feeMode={feeMode}
            servedCities={servedCities}
            paymentMethods={deliveryConfig.config?.paymentMethods ?? []}
            notify={notify}
            onSuccess={(result) => {
              setOrderResult(result);
              cart.clear();
              setStep("confirmation");
            }}
          />
        </div>
      </div>
    );
  }

  if (step === "confirmation" && orderResult) {
    return (
      <div className="pm-app">
        <div className="pm-column">
          <div className="pm-platform">
            <Link className="pm-platform-back" href={`/r/${slug}/delivery`}>
              <ArrowLeft size={15} />
              <span>Novo pedido</span>
            </Link>
            <span>Delivery</span>
          </div>
          <OrderConfirmation
            orderNumber={orderResult.orderNumber}
            orderId={orderResult.orderId}
            restaurantId={restaurant.id}
            restaurantName={restaurant.name}
            slug={slug}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="pm-app">
      <div className="pm-column">
        {tab !== "cart" && (
          <div className="pm-platform">
            <Link className="pm-platform-back" href={`/r/${slug}`} aria-label="Ver cardápio do restaurante">
              <ArrowLeft size={15} aria-hidden />
              <span>Cardápio</span>
            </Link>
            <span>Delivery</span>
          </div>
        )}

        <div hidden={tab !== "menu"}>
          <DeliveryRestaurantHeader
            restaurant={restaurant}
            deliveryConfig={deliveryConfig.config}
            onInfo={() => setPanel({ type: "info" })}
          />
          <DeliveryMenuList
            active={tab === "menu"}
            sections={sections}
            loaded={productsLoaded}
            cart={cart}
            onOpen={openReels}
            onAddToCart={openProduct}
          />
        </div>

        {tab === "search" && (
          <DeliverySearchScreen
            sections={sections}
            loaded={productsLoaded}
            cart={cart}
            onOpen={openReels}
            onAddToCart={openProduct}
          />
        )}

        {tab === "cart" && (
          <DeliveryCartScreen
            cart={cart}
            deliveryFeeCents={deliveryFeeCents}
            minOrderCents={deliveryConfig.config?.minOrderCents ?? 0}
            onCheckout={() => setStep("checkout")}
            onBack={() => goTo("menu")}
          />
        )}

        <DeliveryBottomNav tab={tab} cartCount={cart.totalItems} onChange={goTo} />
      </div>

      {panel?.type === "reels" && (
        <ReelsViewer
          items={panel.items}
          startIndex={panel.index}
          priceOf={productPrice}
          onClose={() => setPanel(null)}
        />
      )}
      {panel?.type === "product" && (
        <ProductDetailPanel
          product={panel.product}
          cart={cart}
          onClose={() => setPanel(null)}
          notify={notify}
        />
      )}
      {panel?.type === "info" && restaurant && (
        <DeliveryInfoPanel
          restaurant={restaurant}
          deliveryConfig={deliveryConfig.config}
          onClose={() => setPanel(null)}
        />
      )}
    </div>
  );
}

// ───────────────────────── Loading state ─────────────────────────

function DeliveryMenuState({ status, slow }: { status: "loading" | "ready" | "not-found" | "error"; slow: boolean }) {
  if (status !== "not-found" && status !== "error" && !slow)
    return (
      <div aria-busy="true" aria-label="Carregando delivery">
        <div className="pm-restaurant">
          <div className="pm-restaurant-main">
            <span className="pm-skel" style={{ width: 38, height: 38 }} />
            <span className="pm-restaurant-text">
              <span className="pm-skel" style={{ width: "55%", height: 14 }} />
              <span className="pm-skel" style={{ width: "35%", height: 11 }} />
            </span>
          </div>
        </div>
        <DeliveryProductSkeleton />
      </div>
    );
  const copy =
    status === "not-found"
      ? { title: "Delivery não encontrado", text: "Este link não corresponde a nenhum restaurante ativo." }
      : status === "error"
        ? { title: "Não foi possível abrir o delivery", text: "Verifique sua conexão e tente de novo." }
        : { title: "A conexão está lenta", text: "Ainda carregando. Aguarde um momento." };
  return (
    <div className="pm-state" role={status === "error" ? "alert" : "status"}>
      {status === "loading" && <LoaderCircle className="pm-spin" size={20} aria-hidden />}
      <h1 className="pm-state-title">{copy.title}</h1>
      <p className="pm-state-text">{copy.text}</p>
    </div>
  );
}

function DeliveryProductSkeleton() {
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

// ───────────────────────── Cabeçalho do restaurante ─────────────────────────

function StatusPill({ open }: { open: boolean }) {
  return (
    <span className={`pm-status ${open ? "" : "pm-status--closed"}`}>
      <Clock size={10} strokeWidth={2.4} aria-hidden />
      {open ? "Aberto" : "Fechado"}
    </span>
  );
}

function RestaurantLogo({ restaurant, size = 38 }: { restaurant: Restaurant; size?: number }) {
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

function DeliveryRestaurantHeader({
  restaurant,
  deliveryConfig,
  onInfo,
}: {
  restaurant: Restaurant;
  deliveryConfig: DeliveryMenuConfig | null;
  onInfo: () => void;
}) {
  const open = useOpenStatus(restaurant.settings.hours);
  return (
    <header className="pm-restaurant">
      <button type="button" className="pm-restaurant-main" onClick={onInfo} aria-label={`Informações de ${restaurant.name || "estabelecimento"}`}>
        <RestaurantLogo restaurant={restaurant} />
        <span className="pm-restaurant-text">
          <h1 className="pm-restaurant-name">{restaurant.name || "Delivery"}</h1>
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
        <ChevronRight className="pm-chevron" size={16} aria-hidden />
      </button>
      <div className="pm-restaurant-links">
        <button type="button" className="pm-text-link" onClick={onInfo}>
          <Bike size={13} aria-hidden />
          {deliveryConfig
            ? `${deliveryConfig.deliveryEta ? deliveryConfig.deliveryEta + " · " : ""}${
                deliveryConfig.feeMode === "taxa_por_bairro"
                  ? "Taxa por bairro"
                  : deliveryConfig.deliveryFeeCents === 0
                  ? "Entrega grátis"
                  : `Taxa: ${brl.format(deliveryConfig.deliveryFeeCents / 100)}`
              }`
            : "Ver tempo e taxa de entrega"}
        </button>
      </div>
    </header>
  );
}

// ───────────────────────── Lista de produtos (com carrinho) ─────────────────────────

type OpenProduct = (product: RestaurantProduct, list: RestaurantProduct[]) => void;
type AddToCart = (product: RestaurantProduct) => void;

function DeliveryMenuList({
  active,
  sections,
  loaded,
  cart,
  onOpen,
  onAddToCart,
}: {
  active: boolean;
  sections: Section[];
  loaded: boolean;
  cart: ReturnType<typeof useCart>;
  onOpen: OpenProduct;
  onAddToCart: AddToCart;
}) {
  const [current, setCurrent] = useState("");
  const barRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const lock = useRef<{ key: string; until: number } | null>(null);
  const activeKey = current || sections[0]?.key || "";

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
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [active, sections]);

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

  if (!loaded) return <DeliveryProductSkeleton />;
  if (!sections.length)
    return (
      <p className="pm-empty" role="status">
        <b>O cardápio está sendo preparado</b>
        Ainda não há produtos publicados.
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
            <DeliveryProductList items={section.items} cart={cart} onOpen={onOpen} onAddToCart={onAddToCart} />
          </section>
        ))}
      </div>
    </>
  );
}

function DeliveryProductList({
  items,
  cart,
  onOpen,
  onAddToCart,
}: {
  items: RestaurantProduct[];
  cart: ReturnType<typeof useCart>;
  onOpen: OpenProduct;
  onAddToCart: AddToCart;
}) {
  return (
    <ul className="pm-products">
      {items.map((product) => (
        <li key={product.id}>
          <DeliveryProductRow
            product={product}
            cart={cart}
            onOpen={() => onOpen(product, items)}
            onAddToCart={() => onAddToCart(product)}
          />
        </li>
      ))}
    </ul>
  );
}

function DeliveryProductRow({
  product,
  cart,
  onOpen,
  onAddToCart,
}: {
  product: RestaurantProduct;
  cart: ReturnType<typeof useCart>;
  onOpen: () => void;
  onAddToCart: () => void;
}) {
  const price = productPrice(product);
  const inCart = cart.items.find((i) => i.productId === product.id);

  return (
    <div className="dl-product-row">
      <button type="button" className="pm-product" onClick={onOpen} style={{ cursor: "pointer" }}>
        <span className="pm-product-info">
          <span className="pm-product-name">{product.name}</span>
          {product.description?.trim() && <span className="pm-product-desc">{product.description.trim()}</span>}
          <span className="pm-more">Ver mais</span>
          {price && <span className="pm-price">{price}</span>}
        </span>
        <DeliveryProductThumb product={product} />
      </button>
      <div className="dl-cart-controls">
        {inCart ? (
          <div className="dl-qty-row">
            <button
              type="button"
              className="pm-qty-btn"
              onClick={() => cart.updateQty(product.id, inCart.quantity - 1)}
              aria-label="Diminuir quantidade"
            >
              <Minus size={14} />
            </button>
            <span className="dl-qty-count">{inCart.quantity}</span>
            <button
              type="button"
              className="pm-qty-btn"
              onClick={() => cart.updateQty(product.id, inCart.quantity + 1)}
              aria-label="Aumentar quantidade"
            >
              <Plus size={14} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="dl-add-btn"
            onClick={onAddToCart}
            aria-label={`Adicionar ${product.name} ao carrinho`}
          >
            <Plus size={14} aria-hidden />
            Adicionar
          </button>
        )}
      </div>
    </div>
  );
}

function DeliveryProductThumb({ product }: { product: RestaurantProduct }) {
  const [failed, setFailed] = useState(false);
  if (product.image && !failed)
    return (
      <span className="pm-thumb">
        <img src={product.image} alt="" width={80} height={80} loading="lazy" decoding="async" onError={() => setFailed(true)} />
      </span>
    );
  return (
    <span className="pm-thumb" aria-hidden>
      {product.videoUrl ? <Play size={20} /> : <UtensilsCrossed size={20} strokeWidth={1.5} />}
    </span>
  );
}

// ───────────────────────── Tela de busca (Delivery) ─────────────────────────

function DeliverySearchScreen({
  sections,
  loaded,
  cart,
  onOpen,
  onAddToCart,
}: {
  sections: Section[];
  loaded: boolean;
  cart: ReturnType<typeof useCart>;
  onOpen: OpenProduct;
  onAddToCart: AddToCart;
}) {
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
            <DeliveryProductSkeleton />
          ) : results.length ? (
            <>
              <p className="pm-results-count">
                {results.length} {results.length === 1 ? "produto encontrado" : "produtos encontrados"}
              </p>
              <DeliveryProductList
                items={results.map((entry) => entry.product)}
                cart={cart}
                onOpen={onOpen}
                onAddToCart={onAddToCart}
              />
            </>
          ) : (
            <p className="pm-empty">
              <b>Nenhum produto encontrado</b>
              {needle ? `Não há resultados para "${deferred.trim()}".` : "Esta categoria não tem produtos."}
            </p>
          )}
        </div>
      )}

      <Signature />
    </div>
  );
}

// ───────────────────────── Carrinho (aba) ─────────────────────────

function DeliveryCartScreen({
  cart,
  deliveryFeeCents,
  minOrderCents,
  onCheckout,
  onBack,
}: {
  cart: ReturnType<typeof useCart>;
  deliveryFeeCents: number | null;
  minOrderCents: number;
  onCheckout: () => void;
  onBack: () => void;
}) {
  const totalCents = cart.subtotalCents + (deliveryFeeCents ?? 0);
  const belowMin = minOrderCents > 0 && cart.subtotalCents < minOrderCents;

  return (
    <>
      <div className="pm-platform">
        <button className="pm-platform-back" onClick={onBack}>
          <ArrowLeft size={15} />
          <span>Cardápio</span>
        </button>
        <span>Carrinho</span>
      </div>

      {!cart.items.length ? (
        <div className="pm-state">
          <ShoppingBag size={32} strokeWidth={1.2} />
          <h1 className="pm-state-title">Carrinho vazio</h1>
          <p className="pm-state-text">Adicione produtos do cardápio para fazer seu pedido.</p>
          <button type="button" className="pm-btn" onClick={onBack} style={{ marginTop: 12, width: "auto" }}>
            Ver cardápio
          </button>
        </div>
      ) : (
        <div className="dl-cart-view">
          <h2 className="dl-cart-title">Seu pedido</h2>
          <ul className="dl-cart-items">
            {cart.items.map((item) => (
              <li key={item.productId} className="dl-cart-item">
                {item.image && <img src={item.image} alt="" width={52} height={52} className="dl-cart-img" />}
                <div className="dl-cart-item-info">
                  <div className="dl-cart-item-name">{item.name}</div>
                  {item.notes && <div className="dl-cart-item-notes">{item.notes}</div>}
                  <div className="dl-cart-item-price">{brl.format(item.priceCents / 100)} × {item.quantity}</div>
                </div>
                <div className="dl-cart-item-controls">
                  <div className="dl-qty-row">
                    <button type="button" className="pm-qty-btn" onClick={() => cart.updateQty(item.productId, item.quantity - 1)}>
                      <Minus size={14} />
                    </button>
                    <span className="dl-qty-count">{item.quantity}</span>
                    <button type="button" className="pm-qty-btn" onClick={() => cart.updateQty(item.productId, item.quantity + 1)}>
                      <Plus size={14} />
                    </button>
                  </div>
                  <button type="button" className="dl-remove-btn" onClick={() => cart.remove(item.productId)} title="Remover item">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="dl-cart-item-total">{brl.format((item.priceCents * item.quantity) / 100)}</div>
              </li>
            ))}
          </ul>

          <div className="dl-cart-summary">
            <div className="dl-cart-row">
              <span>Subtotal</span>
              <span>{brl.format(cart.subtotalCents / 100)}</span>
            </div>
            <div className="dl-cart-row">
              <span>Taxa de entrega</span>
              <span>{deliveryFeeCents === null ? "Calculado no checkout" : deliveryFeeCents === 0 ? "Grátis" : brl.format(deliveryFeeCents / 100)}</span>
            </div>
            <div className="dl-cart-row dl-cart-total">
              <span>Total</span>
              <span>{deliveryFeeCents === null ? `${brl.format(cart.subtotalCents / 100)} + frete` : brl.format(totalCents / 100)}</span>
            </div>
          </div>

          {belowMin && (
            <p className="dl-below-min">
              Pedido mínimo: {brl.format(minOrderCents / 100)}. Adicione mais itens.
            </p>
          )}

          <div className="dl-cart-actions">
            <button type="button" className="pm-btn pm-btn--primary" disabled={belowMin} onClick={onCheckout}>
              Continuar para entrega
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ───────────────────────── Painel de detalhe do produto ─────────────────────────

function ProductDetailPanel({
  product,
  cart,
  onClose,
  notify,
}: {
  product: RestaurantProduct;
  cart: ReturnType<typeof useCart>;
  onClose: () => void;
  notify: Notify;
}) {
  const [notes, setNotes] = useState("");
  const [qty, setQty] = useState(1);
  const price = productPrice(product);
  const priceCents = parsePriceCents(product);
  const inCart = cart.items.find((i) => i.productId === product.id);

  const handleAdd = () => {
    for (let i = 0; i < qty; i++) {
      cart.add(product, notes);
    }
    notify(`${qty}× ${product.name} adicionado${qty > 1 ? "s" : ""} ao carrinho`, "success");
    onClose();
  };

  return (
    <Panel title={product.name} onClose={onClose}>
      {product.videoUrl ? (
        <div className="pm-detail-media">
          <video src={product.videoUrl} poster={product.image || undefined} muted loop playsInline autoPlay className="rv-media" />
        </div>
      ) : product.image ? (
        <div className="pm-detail-media">
          <img src={product.image} alt={product.name} />
        </div>
      ) : null}

      <div className="pm-block">
        <h2 className="pm-detail-name">{product.name}</h2>
        {product.description?.trim() && <p className="pm-detail-desc">{product.description.trim()}</p>}
        {price && <p className="pm-detail-price">{price}</p>}
      </div>

      <div className="pm-block">
        <label className="pm-field">
          Observações
          <textarea
            className="pm-input"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Alguma observação? (ex: sem cebola)"
            style={{ resize: "vertical", height: 72 }}
          />
        </label>
      </div>

      <div className="pm-panel-footer">
        <div className="dl-detail-footer">
          <div className="dl-qty-row">
            <button type="button" className="pm-qty-btn" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Diminuir">
              <Minus size={16} />
            </button>
            <span className="dl-qty-count" style={{ fontSize: 16 }}>{qty}</span>
            <button type="button" className="pm-qty-btn" onClick={() => setQty((q) => Math.min(99, q + 1))} aria-label="Aumentar">
              <Plus size={16} />
            </button>
          </div>
          <button type="button" className="pm-btn pm-btn--primary dl-detail-add-btn" onClick={handleAdd}>
            <ShoppingBag size={16} aria-hidden />
            {inCart ? "Adicionar mais" : "Adicionar"}
            {priceCents > 0 && ` · ${brl.format((priceCents * qty) / 100)}`}
          </button>
        </div>
      </div>
    </Panel>
  );
}

// ───────────────────────── Info do delivery ─────────────────────────

function DeliveryInfoPanel({
  restaurant,
  deliveryConfig,
  onClose,
}: {
  restaurant: Restaurant;
  deliveryConfig: DeliveryMenuConfig | null;
  onClose: () => void;
}) {
  const { settings, brand } = restaurant;
  const open = useOpenStatus(settings.hours);
  const today = useMemo(() => {
    const name = new Intl.DateTimeFormat("en-US", { timeZone: RESTAURANT_TIME_ZONE, weekday: "short" }).format(new Date());
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
  }, []);

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

      {deliveryConfig && (
        <div className="pm-block">
          <h3 className="pm-block-title">Entrega</h3>
          <ul className="pm-info-list">
            {deliveryConfig.deliveryEta && (
              <li className="pm-info-row">
                <Clock size={15} aria-hidden />
                <span>Tempo estimado: {deliveryConfig.deliveryEta}</span>
              </li>
            )}
            <li className="pm-info-row">
              <Bike size={15} aria-hidden />
              <span>
                {deliveryConfig.feeMode === "taxa_por_bairro"
                  ? "Taxa de entrega por bairro"
                  : deliveryConfig.deliveryFeeCents === 0
                  ? "Entrega grátis"
                  : `Taxa de entrega: ${brl.format(deliveryConfig.deliveryFeeCents / 100)}`}
              </span>
            </li>
            {deliveryConfig.deliveryArea && (
              <li className="pm-info-row">
                <MapPin size={15} aria-hidden />
                <span>Área: {deliveryConfig.deliveryArea}</span>
              </li>
            )}
            {deliveryConfig.minOrderCents > 0 && (
              <li className="pm-info-row">
                <ShoppingBag size={15} aria-hidden />
                <span>Pedido mínimo: {brl.format(deliveryConfig.minOrderCents / 100)}</span>
              </li>
            )}
          </ul>
          {deliveryConfig.notes && (
            <p className="pm-muted pm-small" style={{ marginTop: 8 }}>{deliveryConfig.notes}</p>
          )}
        </div>
      )}

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

function formatRange(day?: { open: boolean; from: string; to: string }) {
  return day?.open && day.from && day.to ? `${day.from} às ${day.to}` : "Fechado";
}

// ───────────────────────── Bottom Nav ─────────────────────────

function DeliveryBottomNav({ tab, cartCount, onChange }: { tab: Tab; cartCount: number; onChange: (tab: Tab) => void }) {
  const items: { key: Tab; label: string; icon: typeof BookOpen }[] = [
    { key: "menu", label: "Cardápio", icon: BookOpen },
    { key: "search", label: "Busca", icon: Search },
    { key: "cart", label: "Carrinho", icon: ShoppingBag },
  ];
  return (
    <nav className="pm-nav" aria-label="Navegação do delivery">
      {items.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          className={`pm-nav-item ${tab === key ? "is-active" : ""}`}
          aria-current={tab === key ? "page" : undefined}
          onClick={() => onChange(key)}
        >
          <span className="dl-nav-icon-wrap">
            <Icon size={16} strokeWidth={tab === key ? 2.2 : 1.7} aria-hidden />
            {key === "cart" && cartCount > 0 && (
              <span className="dl-nav-badge" aria-label={`${cartCount} itens no carrinho`}>{cartCount > 9 ? "9+" : cartCount}</span>
            )}
          </span>
          {label}
        </button>
      ))}
    </nav>
  );
}

// ───────────────────────── Signature ─────────────────────────

function Signature() {
  return (
    <p className="pm-signature">
      Uma experiência <b>KARDAP</b>
    </p>
  );
}

// ───────────────────────── Checkout form ─────────────────────────

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function formatCep(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

async function fetchCep(cep: string): Promise<{ street: string; district: string; city: string; uf: string } | null> {
  const digits = cep.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.erro) return null;
    return { street: data.logradouro || "", district: data.bairro || "", city: data.localidade || "", uf: data.uf || "" };
  } catch { return null; }
}

function CheckoutForm({
  restaurantId,
  cart,
  deliveryFeeCents: flatFeeCents,
  feeMode,
  servedCities,
  paymentMethods,
  notify,
  onSuccess,
}: {
  restaurantId: string;
  cart: ReturnType<typeof useCart>;
  deliveryFeeCents: number;
  feeMode: "taxa_fixa" | "taxa_por_bairro";
  servedCities: { ibgeCode: string; name: string; uf: string }[];
  paymentMethods: string[];
  notify: Notify;
  onSuccess: (result: { orderId: string; orderNumber: number }) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [cep, setCep] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [district, setDistrict] = useState("");
  const [city, setCity] = useState("");
  const [reference, setReference] = useState("");
  const [uf, setUf] = useState("");
  const [profileLoaded, setProfileLoaded] = useState(false);

  useEffect(() => {
    if (profileLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const { getFirebaseAuth } = await import("@/lib/auth");
        const user = getFirebaseAuth().currentUser;
        if (!user || cancelled) return;
        const { watchCustomerProfile } = await import("@/lib/restaurant-db");
        const unsub = watchCustomerProfile(user.uid, (profile) => {
          if (!profile || cancelled) { unsub(); return; }
          setName((v) => v || profile.name || "");
          setPhone((v) => v || (profile.phone ? formatPhone(profile.phone) : ""));
          if (profile.addresses?.length) {
            const addr = profile.addresses[0];
            setStreet((v) => v || addr.street || "");
            setNumber((v) => v || addr.number || "");
            setComplement((v) => v || addr.complement || "");
            setDistrict((v) => v || addr.district || "");
            setCity((v) => v || addr.city || "");
            setReference((v) => v || addr.reference || "");
          }
          setProfileLoaded(true);
          unsub();
        }, () => {});
      } catch {}
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [paymentMethod, setPaymentMethod] = useState(paymentMethods[0] || "");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [cepLoading, setCepLoading] = useState(false);

  const fee = useDeliveryFee(restaurantId, feeMode, city, district, uf, flatFeeCents, servedCities);
  const deliveryFeeCents = fee.feeCents ?? 0;

  const handleCepChange = useCallback(async (raw: string) => {
    const formatted = formatCep(raw);
    setCep(formatted);
    const digits = formatted.replace(/\D/g, "");
    if (digits.length === 8) {
      setCepLoading(true);
      const result = await fetchCep(digits);
      setCepLoading(false);
      if (result) {
        if (result.street) setStreet(result.street);
        if (result.district) setDistrict(result.district);
        if (result.city) setCity(result.city);
        if (result.uf) setUf(result.uf);
      }
    }
  }, []);

  const submittedRef = useRef(false);
  const idempotencyKey = useRef(`del_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
  const totalCents = cart.subtotalCents + deliveryFeeCents;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittedRef.current) return;

    const phoneDigits = phone.replace(/\D/g, "");
    if (!name.trim()) { setError("Informe seu nome."); return; }
    if (phoneDigits.length < 10) { setError("Informe um telefone válido com DDD."); return; }
    if (!cep.trim()) { setError("Informe o CEP."); return; }
    if (!street.trim()) { setError("Informe a rua."); return; }
    if (!number.trim()) { setError("Informe o número."); return; }
    if (!district.trim()) { setError("Informe o bairro."); return; }
    if (!city.trim()) { setError("Informe a cidade."); return; }
    if (!paymentMethod) { setError("Selecione a forma de pagamento."); return; }
    if (!fee.matched) { setError(fee.reason || "Endereço fora da área de entrega."); return; }
    if (fee.loading) { setError("Aguarde o cálculo do frete."); return; }

    setSubmitting(true);
    setError("");
    submittedRef.current = true;

    try {
      const payload: DeliveryCheckoutPayload = {
        restaurantId,
        customer: { name: name.trim(), phone: phoneDigits },
        address: { cep: cep.trim(), street: street.trim(), number: number.trim(), complement: complement.trim() || undefined, district: district.trim(), city: city.trim(), uf: uf.trim() || undefined, reference: reference.trim() || undefined },
        items: cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity, notes: i.notes || undefined })),
        paymentMethod,
        notes: notes.trim() || undefined,
        idempotencyKey: idempotencyKey.current,
      };

      const headers: HeadersInit = { "Content-Type": "application/json" };
      try {
        const { getFirebaseAuth } = await import("@/lib/auth");
        const token = await getFirebaseAuth().currentUser?.getIdToken();
        if (token) headers.Authorization = `Bearer ${token}`;
      } catch {}

      const res = await fetch("/api/delivery/orders", { method: "POST", headers, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Não foi possível enviar o pedido.");

      try {
        const { getFirebaseAuth } = await import("@/lib/auth");
        const uid = getFirebaseAuth().currentUser?.uid;
        if (uid) {
          const { saveCustomerProfile } = await import("@/lib/restaurant-db");
          saveCustomerProfile(uid, {
            name: name.trim(),
            phone: phoneDigits,
            addresses: [{ id: "main", label: "Principal", street: street.trim(), number: number.trim(), complement: complement.trim() || "", district: district.trim(), city: city.trim(), reference: reference.trim() || "" }],
          }).catch(() => {});
        }
      } catch {}

      onSuccess({ orderId: data.orderId, orderNumber: data.orderNumber });
    } catch (err) {
      submittedRef.current = false;
      setError(friendlyError(err, "Não foi possível enviar o pedido. Tente de novo."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ padding: 16 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Dados para entrega</h2>

      <fieldset style={{ border: "none", padding: 0, margin: "0 0 16px" }}>
        <legend style={{ fontWeight: 600, marginBottom: 8 }}>Seus dados</legend>
        <div className="pm-checkout-fields">
          <label className="pm-field">Nome<input className="pm-input" value={name} onChange={(e) => setName(e.target.value)} required /></label>
          <label className="pm-field">Telefone (WhatsApp)<input className="pm-input" inputMode="numeric" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} required /></label>
        </div>
      </fieldset>

      <fieldset style={{ border: "none", padding: 0, margin: "0 0 16px" }}>
        <legend style={{ fontWeight: 600, marginBottom: 8 }}><MapPin size={14} style={{ verticalAlign: -2 }} /> Endereço de entrega</legend>
        <div className="pm-checkout-fields">
          <label className="pm-field">CEP{cepLoading && <LoaderCircle size={14} className="pm-spin" style={{ marginLeft: 6, verticalAlign: -2 }} />}<input className="pm-input" value={cep} onChange={(e) => handleCepChange(e.target.value)} inputMode="numeric" maxLength={9} required placeholder="00000-000" /></label>
          <label className="pm-field">Rua<input className="pm-input" value={street} onChange={(e) => setStreet(e.target.value)} required /></label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8 }}>
            <label className="pm-field">Número<input className="pm-input" value={number} onChange={(e) => setNumber(e.target.value)} required /></label>
            <label className="pm-field">Complemento<input className="pm-input" value={complement} onChange={(e) => setComplement(e.target.value)} placeholder="Apto, bloco..." /></label>
          </div>
          <label className="pm-field">
            Bairro
            {!district && fee.servedNeighborhoods?.length ? (
              <select className="pm-input" value={district} onChange={(e) => setDistrict(e.target.value)} required>
                <option value="">Selecione seu bairro</option>
                {fee.servedNeighborhoods.map((n) => <option key={n.slug} value={n.name}>{n.name}</option>)}
              </select>
            ) : (
              <input className="pm-input" value={district} onChange={(e) => setDistrict(e.target.value)} required />
            )}
          </label>
          <label className="pm-field">Cidade<input className="pm-input" value={city} onChange={(e) => setCity(e.target.value)} required /></label>
          <label className="pm-field">Referência<input className="pm-input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Próximo a..." /></label>
        </div>
        {!fee.matched && fee.reason && (
          <p style={{ color: "var(--pm-danger, #c00)", fontSize: 13, marginTop: 8, padding: "8px 10px", background: "var(--pm-danger-bg, #fff0f0)", borderRadius: 6 }}>
            {fee.reason}
          </p>
        )}
      </fieldset>

      <fieldset style={{ border: "none", padding: 0, margin: "0 0 16px" }}>
        <legend style={{ fontWeight: 600, marginBottom: 8 }}>Forma de pagamento</legend>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {paymentMethods.map((method) => (
            <button
              key={method}
              type="button"
              onClick={() => setPaymentMethod(method)}
              className={`pm-pill ${paymentMethod === method ? "is-active" : ""}`}
            >
              {PAYMENT_METHOD_LABELS[method] || method}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="pm-field" style={{ marginBottom: 16 }}>
        Observações do pedido
        <textarea className="pm-input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Alguma observação?" style={{ resize: "vertical" }} />
      </label>

      <div style={{ background: "var(--pm-bg-alt, #f8f8f8)", borderRadius: 8, padding: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span>Subtotal ({cart.totalItems} {cart.totalItems === 1 ? "item" : "itens"})</span>
          <span>{brl.format(cart.subtotalCents / 100)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span>Taxa de entrega</span>
          <span>
            {fee.loading ? <LoaderCircle size={14} className="pm-spin" /> : !fee.matched ? "—" : deliveryFeeCents === 0 ? "Grátis" : brl.format(deliveryFeeCents / 100)}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16, marginTop: 8, paddingTop: 8, borderTop: "2px solid var(--pm-text, #000)" }}>
          <span>Total</span>
          <span>{fee.loading ? "..." : !fee.matched ? "—" : brl.format(totalCents / 100)}</span>
        </div>
      </div>

      {error && <p style={{ color: "var(--pm-danger, #c00)", fontSize: 13, marginBottom: 12 }}>{error}</p>}

      <button type="submit" className="pm-btn pm-btn--primary" disabled={submitting || !fee.matched || fee.loading} style={{ width: "100%", position: "relative" }}>
        {submitting ? <LoaderCircle size={18} className="pm-spin" /> : <Check size={16} />}
        {submitting ? "Enviando pedido..." : fee.loading ? "Calculando frete..." : !fee.matched ? "Endereço não atendido" : `Confirmar pedido · ${brl.format(totalCents / 100)}`}
      </button>
    </form>
  );
}

// ───────────────────────── Order tracking ─────────────────────────

const TRACKING_STEPS: { status: string; label: string; icon: string }[] = [
  { status: "pendente", label: "Pedido recebido", icon: "📋" },
  { status: "confirmado", label: "Pedido confirmado", icon: "✅" },
  { status: "em_preparo", label: "Em preparação", icon: "👨‍🍳" },
  { status: "pronto", label: "Pedido pronto", icon: "📦" },
  { status: "saiu_para_entrega", label: "Saiu para entrega", icon: "🛵" },
  { status: "entregue", label: "Entregue", icon: "🎉" },
];

function stepIndex(status: string): number {
  const idx = TRACKING_STEPS.findIndex((s) => s.status === status);
  return idx >= 0 ? idx : 0;
}

type TrackingData = {
  status: string;
  orderNumber: number;
  statusHistory: { status: string; at: string; by?: string }[];
  updatedAt: string;
};

function OrderConfirmation({
  orderNumber,
  orderId,
  restaurantId,
  restaurantName,
  slug,
}: {
  orderNumber: number;
  orderId: string;
  restaurantId: string;
  restaurantName: string;
  slug: string;
}) {
  const [tracking, setTracking] = useState<TrackingData | null>(null);
  const [trackError, setTrackError] = useState(false);

  useEffect(() => {
    if (!restaurantId || !orderId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/delivery/orders/${encodeURIComponent(orderId)}/status?restaurantId=${encodeURIComponent(restaurantId)}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!cancelled) setTracking(data);
      } catch {
        if (!cancelled) setTrackError(true);
      }
    };
    poll();
    const interval = setInterval(poll, 8000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [restaurantId, orderId]);

  const currentStatus = tracking?.status || "pendente";
  const isCancelled = currentStatus === "cancelado" || currentStatus === "recusado";
  const isDelivered = currentStatus === "entregue";
  const current = stepIndex(currentStatus);

  const historyTime = (status: string) => {
    const entry = tracking?.statusHistory?.find((h) => h.status === status);
    if (!entry) return null;
    try { return new Date(entry.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); } catch { return null; }
  };

  return (
    <div className="dl-tracking">
      <div className="dl-tracking-header">
        <div className="dl-tracking-check">
          {isDelivered ? "🎉" : isCancelled ? "❌" : <Check size={28} />}
        </div>
        <h2 className="dl-tracking-title">
          {isDelivered ? "Pedido entregue!" : isCancelled ? (currentStatus === "recusado" ? "Pedido recusado" : "Pedido cancelado") : "Pedido enviado!"}
        </h2>
        <p className="dl-tracking-sub">
          Pedido #{String(orderNumber).padStart(3, "0")} · <strong>{restaurantName}</strong>
        </p>
      </div>

      {!isCancelled && (
        <div className="dl-timeline">
          {TRACKING_STEPS.map((step, i) => {
            const done = i <= current;
            const active = i === current;
            const time = historyTime(step.status);
            return (
              <div key={step.status} className={`dl-timeline-step${done ? " is-done" : ""}${active ? " is-active" : ""}`}>
                <div className="dl-timeline-marker">
                  <span className="dl-timeline-dot">{done ? step.icon : ""}</span>
                  {i < TRACKING_STEPS.length - 1 && <span className="dl-timeline-line" />}
                </div>
                <div className="dl-timeline-content">
                  <span className="dl-timeline-label">{step.label}</span>
                  {time && <span className="dl-timeline-time">{time}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isCancelled && (
        <p className="dl-tracking-cancelled">
          {currentStatus === "recusado" ? "O restaurante não pôde aceitar seu pedido no momento." : "Este pedido foi cancelado."}
        </p>
      )}

      {trackError && !tracking && (
        <p style={{ fontSize: 13, color: "var(--pm-muted, #888)", textAlign: "center", marginTop: 12 }}>
          Não foi possível carregar o acompanhamento. Atualize a página.
        </p>
      )}

      <div className="dl-tracking-actions">
        <Link href={`/r/${slug}/delivery`} className="pm-btn">
          Fazer novo pedido
        </Link>
      </div>
    </div>
  );
}
