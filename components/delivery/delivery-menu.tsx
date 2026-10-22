"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Bike, Bookmark, Plus, Receipt, ShoppingBag, Star } from "lucide-react";
import { brl, plural, productCents } from "@/lib/format";
import { usePrefersReducedMotion, useRootPalette, useSaveData } from "@/lib/hooks";
import { isDefaultPalette } from "@/lib/palette";
import { Button, ButtonLink } from "@/components/ui/primitives";
import type { Brand, Notify, RestaurantSettings } from "@/components/dashboard/types";
import { MenuHero } from "@/components/menu/menu-hero";
import type { Dish } from "@/components/menu/dish-row";
import { buildSections, MenuCatalog, type PublicCategory } from "@/components/menu/menu-catalog";
import { MenuMessage, MenuSkeleton } from "@/components/menu/menu-states";
import { ReelsRail } from "@/components/menu/reels/reels-rail";
import type { ReelsMode } from "@/components/menu/reels/reels-viewer";
import { useEngagement } from "@/components/menu/reels/use-engagement";
import { useCart, type CartLine } from "./use-cart";
import { CartSheet, type PricedLine } from "./cart-sheet";
import { ProductSheet } from "./product-sheet";
import { feeLabel, flatFee, useDeliveryConfig, useOpenStatus } from "./use-delivery";
import { clearCheckoutDraft } from "./checkout-draft";
import type { OnlinePaymentData } from "./payment-step";

// Como no cardápio: feed, salvos, checkout e acompanhamento só baixam quando são usados.
const loadViewer = () => import("@/components/menu/reels/reels-viewer");
const ReelsViewer = dynamic(() => loadViewer().then((m) => m.ReelsViewer), { ssr: false, loading: () => <div className="kd-reels" aria-busy="true" /> });
const SavedSheet = dynamic(() => import("@/components/menu/reels/saved-sheet").then((m) => m.SavedSheet), { ssr: false });
const InfoSheet = dynamic(() => import("./info-sheet").then((m) => m.InfoSheet), { ssr: false });
const Checkout = dynamic(() => import("./checkout").then((m) => m.Checkout), { ssr: false, loading: () => <MenuSkeleton /> });
const OrderTracking = dynamic(() => import("./order-tracking").then((m) => m.OrderTracking), { ssr: false });
const PaymentStep = dynamic(() => import("./payment-step").then((m) => m.PaymentStep), { ssr: false });

type Step = "menu" | "checkout" | "payment" | "done";
type Sheet = { kind: "product"; dish: Dish; edit?: CartLine } | { kind: "cart" } | { kind: "info" } | null;
type PlacedOrder = { orderId: string; orderNumber: number; totalCents?: number };
/** Pedido em andamento salvo no aparelho. `step: "menu"`: a pessoa voltou ao cardápio, mas ainda acompanha o pedido pelo topo. */
type Recovery = { order: PlacedOrder; payment: OnlinePaymentData | null; step: Step; savedAt?: number };
const RECOVERY_MAX_AGE = 12 * 60 * 60 * 1000;
const orderLabel = (orderNumber: number) => `#${String(orderNumber).padStart(3, "0")}`;

/**
 * Delivery público (/r/:slug/delivery). É o cardápio digital (mesmo cabeçalho, seções, busca, Reels e
 * esqueleto) com carrinho e finalização do pedido no lugar das ações de chamar a equipe.
 * Os dados do restaurante chegam do mesmo carregamento do cardápio (components/app.tsx).
 */
export default function DeliveryMenu({
  status,
  slow,
  onRetry,
  productsLoaded,
  restaurantId,
  slug,
  brand,
  settings,
  foods,
  categories,
  restaurantName,
  suspended,
  notify,
  isDemo = false,
}: {
  status: "loading" | "ready" | "not-found" | "error";
  slow: boolean;
  onRetry: () => void;
  productsLoaded: boolean;
  restaurantId: string;
  slug: string;
  brand: Brand;
  settings: RestaurantSettings;
  foods: Dish[];
  categories: PublicCategory[] | null | undefined;
  restaurantName: string;
  suspended: boolean;
  notify: Notify;
  /** Conta demonstrativa: aviso discreto de dados simulados no rodapé. */
  isDemo?: boolean;
}) {
  useRootPalette(brand.palette, true, `kardap-theme-menu:${slug}:v1`);
  const customColors = !isDefaultPalette(brand.palette);
  const reducedMotion = usePrefersReducedMotion();
  const saveData = useSaveData();
  const autoplay = !reducedMotion && !saveData;

  const delivery = useDeliveryConfig(restaurantId);
  const cart = useCart(restaurantId);
  const open = useOpenStatus(settings.hours);

  const [step, setStep] = useState<Step>("menu");
  const [order, setOrder] = useState<PlacedOrder | null>(null);
  const [orderSettled, setOrderSettled] = useState(false);
  const [onlinePayment, setOnlinePayment] = useState<OnlinePaymentData | null>(null);
  /** Etapa em que o checkout abre: volta direto ao pagamento quando a pessoa troca a forma de pagar. */
  const [checkoutStart, setCheckoutStart] = useState<1 | 3>(1);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [viewer, setViewer] = useState<{ mode: ReelsMode; list: Dish[]; index: number; key: number } | null>(null);
  const [savedOpen, setSavedOpen] = useState(false);
  const menuScroll = useRef(0);
  const recoveryKey = `kardap:delivery-checkout:${restaurantId}`;

  const remember = useCallback(
    (next: Recovery | null) => {
      try {
        if (next) localStorage.setItem(recoveryKey, JSON.stringify({ ...next, savedAt: Date.now() }));
        else localStorage.removeItem(recoveryKey);
      } catch {}
    },
    [recoveryKey],
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(recoveryKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<Recovery>;
      if (!saved.order || (saved.savedAt && Date.now() - saved.savedAt > RECOVERY_MAX_AGE)) {
        localStorage.removeItem(recoveryKey);
        return;
      }
      setOrder(saved.order);
      if (saved.step === "payment" || saved.step === "done") {
        setOnlinePayment(saved.payment || null);
        setStep(saved.step);
      }
    } catch {
      try {
        localStorage.removeItem(recoveryKey);
      } catch {}
    }
  }, [recoveryKey]);

  const ready = status === "ready" && productsLoaded && categories !== undefined;
  const sections = useMemo(() => buildSections(foods, categories ?? null), [foods, categories]);
  const allDishes = useMemo(() => sections.flatMap((s) => s.dishes), [sections]);
  const videoDishes = useMemo(() => allDishes.filter((d) => d.videoUrl), [allDishes]);
  const liveDishes = useMemo(() => new Map(allDishes.filter((d) => d.id).map((d) => [d.id as string, d])), [allDishes]);
  const viewerDishes = useMemo(() => (viewer ? viewer.list.map((d) => (d.id && liveDishes.get(d.id)) || d) : []), [viewer, liveDishes]);
  const restaurant = useMemo(
    () => ({ id: restaurantId, slug, name: restaurantName, logo: brand.logoSmall || brand.logo }),
    [restaurantId, slug, restaurantName, brand.logoSmall, brand.logo],
  );
  const engagement = useEngagement(restaurant);
  const viewerOpen = useRef(false);
  viewerOpen.current = Boolean(viewer);

  // Carrinho conferido com o cardápio ao vivo: preço atual e itens que saíram do cardápio ou ficaram indisponíveis.
  const lines = useMemo<PricedLine[]>(
    () =>
      cart.items.map((item) => {
        const live = liveDishes.get(item.productId);
        return {
          ...item,
          name: live?.name || item.name,
          priceCents: live ? productCents(live) : item.priceCents,
          image: (live && (live.imageThumb || live.image || live.videoPoster)) || item.image,
          unavailable: productsLoaded && !live,
        };
      }),
    [cart.items, liveDishes, productsLoaded],
  );
  const validLines = useMemo(() => lines.filter((line) => !line.unavailable), [lines]);
  const cartCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const cartTotal = validLines.reduce((sum, line) => sum + line.priceCents * line.quantity, 0);
  const inCart = useMemo(() => {
    const map = new Map<string, number>();
    cart.items.forEach((item) => map.set(item.productId, (map.get(item.productId) || 0) + item.quantity));
    return map;
  }, [cart.items]);

  useEffect(() => {
    if (restaurantName) document.title = `${restaurantName} · Delivery`;
  }, [restaurantName]);

  /** Abre o feed. Cria uma entrada no histórico: o "voltar" do celular fecha o feed, não sai do delivery. */
  const openViewer = useCallback((mode: ReelsMode, list: Dish[], index: number) => {
    if (!list.length) return;
    if (!viewerOpen.current) {
      try {
        window.history.pushState({ kdReel: true }, "");
      } catch {}
    }
    setViewer({ mode, list, index: Math.max(0, Math.min(list.length - 1, index)), key: Date.now() });
  }, []);

  const closeViewer = useCallback(() => {
    if ((window.history.state as { kdReel?: boolean } | null)?.kdReel) window.history.back();
    else setViewer(null);
  }, []);

  useEffect(() => {
    if (!viewer) return;
    const onPop = () => {
      if (!(window.history.state as { kdReel?: boolean } | null)?.kdReel) setViewer(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [viewer]);

  // Com o cardápio na tela e o celular ocioso, adianta o download do feed (como no cardápio).
  useEffect(() => {
    if (!ready || saveData || !videoDishes.length) return;
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    const run = () => void loadViewer().catch(() => undefined);
    if (idle) idle(run);
    else setTimeout(run, 2000);
  }, [ready, saveData, videoDishes.length]);

  const openProduct = useCallback((dish: Dish) => setSheet({ kind: "product", dish: (dish.id && liveDishes.get(dish.id)) || dish }), [liveDishes]);
  // Callbacks fixos: abrir o feed, abrir um produto ou curtir não renderiza de novo o trilho nem a lista de pratos.
  const openDishProduct = useCallback((list: Dish[], index: number) => openProduct(list[index]), [openProduct]);
  const openReelsAt = useCallback((index: number) => openViewer("reels", videoDishes, index), [openViewer, videoDishes]);
  const openReels = useCallback(() => openViewer("reels", videoDishes, 0), [openViewer, videoDishes]);
  const dishNote = useCallback(
    (dish: Dish) => {
      const qty = dish.id ? inCart.get(dish.id) : 0;
      // A chave muda com a quantidade: o selo entra de novo a cada item somado (confirmação na própria linha).
      return qty ? (
        <p key={qty} className="kd-dish-incart">
          <ShoppingBag size={12} aria-hidden />
          {qty} no carrinho
        </p>
      ) : null;
    },
    [inCart],
  );

  // "+" da miniatura: adiciona uma unidade sem observação. Observações e quantidade ficam na folha do produto.
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const { add: addToCart } = cart;
  const dishAction = useCallback(
    (dish: Dish) =>
      dish.id ? (
        <button
          type="button"
          className="kd-dish-add"
          aria-label={`Adicionar 1 ${dish.name} ao carrinho`}
          onClick={() => {
            addToCart(dish, 1, "");
            notifyRef.current(`1× ${dish.name} no carrinho`, "success");
          }}
        >
          <Plus size={18} strokeWidth={2.6} aria-hidden />
        </button>
      ) : null,
    [addToCart],
  );

  // Checkout ganha uma entrada no histórico: o "voltar" do celular retorna ao cardápio com o carrinho.
  const goToCheckout = () => {
    if (!delivery.config) {
      notify("Carregando as informações de entrega. Tente de novo em instantes.", "error");
      return;
    }
    menuScroll.current = window.scrollY;
    setSheet(null);
    try {
      window.history.pushState({ kdCheckout: true }, "");
    } catch {}
    setCheckoutStart(1);
    setStep("checkout");
  };

  /**
   * Sai do pagamento online sem pagar (trocar a forma de pagamento ou Pix expirado). O pedido preparado não chega
   * ao restaurante sem pagamento aprovado; o carrinho e os dados digitados continuam, e o checkout abre no pagamento.
   */
  const changePayment = () => {
    setOrder(null);
    setOnlinePayment(null);
    remember(null);
    try {
      window.history.pushState({ kdCheckout: true }, "");
    } catch {}
    setCheckoutStart(3);
    setStep("checkout");
  };

  const finishPayment = () => {
    if (!order) return;
    cart.clear();
    clearCheckoutDraft(restaurantId);
    setOnlinePayment(null);
    setStep("done");
    remember({ order, payment: null, step: "done" });
  };
  const leaveCheckout = useCallback(() => {
    if ((window.history.state as { kdCheckout?: boolean } | null)?.kdCheckout) window.history.back();
    else setStep("menu");
  }, []);

  useEffect(() => {
    if (step !== "checkout") return;
    const onPop = () => {
      if (!(window.history.state as { kdCheckout?: boolean } | null)?.kdCheckout) setStep("menu");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [step]);

  // Volta ao ponto do cardápio onde a pessoa estava; checkout e acompanhamento começam no topo.
  useEffect(() => {
    window.scrollTo(0, step === "menu" ? menuScroll.current : 0);
  }, [step]);

  if (status === "not-found" || status === "error") return <MenuMessage status={status} onRetry={onRetry} />;
  if (status === "ready" && suspended) return <MenuMessage status="unavailable" onRetry={onRetry} />;
  if (!ready) return slow ? <MenuMessage status="slow" onRetry={onRetry} /> : <MenuSkeleton />;

  if (delivery.error)
    return (
      <div className={`kd-menu kd-menu-page ${customColors ? "has-palette" : ""}`}>
        <div className="kd-state" role="status">
          <span className="kd-empty-icon" aria-hidden>
            <Bike size={22} />
          </span>
          <h1 className="kd-state-title">Delivery indisponível</h1>
          <p className="kd-state-text">{delivery.error}</p>
          <ButtonLink variant="primary" href={`/r/${slug}`}>
            Ver o cardápio
          </ButtonLink>
        </div>
      </div>
    );

  const config = delivery.config;
  const showBar = (step === "menu" && cartCount > 0) || step === "checkout";

  return (
    <div className={`kd-menu kd-menu-page kd-delivery ${showBar ? "has-bar" : ""} ${customColors ? "has-palette" : ""}`}>
      <div className="kd-menu-column" hidden={step !== "menu"}>
        <MenuHero
          name={restaurantName}
          brand={brand}
          subtitle={
            <>
              {open === null ? <Bike size={14} aria-hidden /> : <span className={`kd-open-dot ${open ? "" : "is-closed"}`} aria-hidden />}
              <span>
                {open === null ? "Delivery" : open ? "Aberto agora · Delivery" : "Fechado agora · Delivery"}
                {config?.deliveryEta ? ` · ${config.deliveryEta}` : ""}
              </span>
            </>
          }
        >
          <div className="kd-menu-pills">
            {order && (
              <button type="button" className="kd-menu-review kd-menu-track" onClick={() => setStep("done")}>
                <Receipt size={15} aria-hidden />
                Acompanhar pedido <span className="kd-num">{orderLabel(order.orderNumber)}</span>
              </button>
            )}
            <button type="button" className={`kd-menu-review kd-menu-info ${open === false ? "is-closed" : ""}`} onClick={() => setSheet({ kind: "info" })}>
              <Bike size={15} aria-hidden />
              {config ? feeLabel(config) : "Entrega e horários"}
            </button>
            {settings.google && settings.googleReviewUrl && (
              <a className="kd-menu-review" href={settings.googleReviewUrl} target="_blank" rel="noopener noreferrer">
                <Star size={15} aria-hidden />
                Avaliar no Google
                <span className="kd-sr"> (abre em nova aba)</span>
              </a>
            )}
            {(engagement.saved.length > 0 || engagement.account) && (
              <button type="button" className="kd-menu-review kd-menu-saved" onClick={() => setSavedOpen(true)}>
                <Bookmark size={15} aria-hidden />
                Salvos
                {engagement.saved.length > 0 && <span className="kd-menu-pill-count kd-num">{engagement.saved.length}</span>}
              </button>
            )}
          </div>
        </MenuHero>

        <ReelsRail dishes={videoDishes} onOpen={openReelsAt} />

        <MenuCatalog
          sections={sections}
          allDishes={allDishes}
          autoplay={autoplay && step === "menu"}
          reducedMotion={reducedMotion}
          emptyText="O restaurante ainda está cadastrando os produtos do delivery."
          onOpenDish={openDishProduct}
          onOpenReels={videoDishes.length > 0 ? openReels : undefined}
          dishNote={dishNote}
          dishAction={dishAction}
          photoOnly
        />
        {isDemo && <p className="kd-menu-demo-note">Cardápio de demonstração do KARDAP · dados e pedidos simulados</p>}
      </div>

      {step === "checkout" && config && (
        <div className="kd-menu-column">
          <Checkout
            restaurantId={restaurantId}
            restaurantName={restaurantName}
            slug={slug}
            config={config}
            lines={validLines}
            initialStep={checkoutStart}
            reducedMotion={reducedMotion}
            onBack={leaveCheckout}
            onEditCart={() => {
              leaveCheckout();
              setSheet({ kind: "cart" });
            }}
            onSuccess={(result) => {
              const nextOrder = { orderId: result.orderId, orderNumber: result.orderNumber, totalCents: result.totalCents };
              setOrder(nextOrder);
              setOrderSettled(false);
              try {
                window.history.replaceState(null, "");
              } catch {}
              if (result.payment) {
                // Pagamento online: o carrinho só é esvaziado com o pagamento aprovado (quem troca a forma de pagar não perde os itens).
                setOnlinePayment(result.payment);
                setStep("payment");
                remember({ order: nextOrder, payment: result.payment, step: "payment" });
              } else {
                cart.clear();
                clearCheckoutDraft(restaurantId);
                setStep("done");
                remember({ order: nextOrder, payment: null, step: "done" });
              }
            }}
          />
        </div>
      )}

      {step === "payment" && order && onlinePayment && (
        <div className="kd-menu-column">
          <PaymentStep
            payment={onlinePayment}
            orderId={order.orderId}
            restaurantId={restaurantId}
            orderNumber={order.orderNumber}
            restaurantName={restaurantName}
            totalCents={order.totalCents || 0}
            onPaid={finishPayment}
            onChangePayment={changePayment}
          />
        </div>
      )}

      {step === "done" && order && (
        <div className="kd-menu-column">
          <OrderTracking
            orderId={order.orderId}
            orderNumber={order.orderNumber}
            restaurantId={restaurantId}
            restaurantName={restaurantName}
            onSettled={() => {
              // Entregue, cancelado ou recusado: a pessoa já viu o resultado, o pedido sai do aparelho.
              setOrderSettled(true);
              remember(null);
            }}
            onNewOrder={() => {
              if (orderSettled) setOrder(null);
              else remember({ order, payment: null, step: "menu" });
              menuScroll.current = 0;
              setStep("menu");
            }}
          />
        </div>
      )}

      {step === "menu" && cartCount > 0 && (
        <div className="kd-menu-bar">
          <div className="kd-menu-bar-actions">
            <Button variant="signal" size="lg" className="kd-cart-cta" onClick={() => setSheet({ kind: "cart" })} aria-label={`Ver carrinho: ${plural(cartCount, "item", "itens")}, ${brl(cartTotal)}`}>
              <span className="kd-cart-cta-label">
                <span className="kd-cart-cta-count kd-num" aria-hidden>
                  {cartCount}
                </span>
                Ver carrinho
              </span>
              <span className="kd-num">{brl(cartTotal)}</span>
            </Button>
          </div>
        </div>
      )}

      {viewer && (
        <ReelsViewer
          key={viewer.key}
          dishes={viewerDishes}
          startIndex={viewer.index}
          mode={viewer.mode}
          autoplay={autoplay}
          restaurant={restaurant}
          engagement={engagement}
          canCall
          callKind="cart"
          onCall={(dish) => {
            closeViewer();
            openProduct(dish);
          }}
          onClose={closeViewer}
          onShowSaved={() => setSavedOpen(true)}
        />
      )}
      {savedOpen && (
        <SavedSheet
          restaurant={restaurant}
          engagement={engagement}
          dishes={liveDishes}
          onOpen={(productId) => {
            setSavedOpen(false);
            const dish = liveDishes.get(productId);
            if (dish) openProduct(dish);
          }}
          onClose={() => setSavedOpen(false)}
        />
      )}

      {sheet?.kind === "product" && (
        <ProductSheet
          key={sheet.edit?.key || sheet.dish.id}
          dish={sheet.dish}
          available={Boolean(sheet.dish.id && liveDishes.has(sheet.dish.id))}
          autoplay={autoplay}
          initial={sheet.edit ? { quantity: sheet.edit.quantity, notes: sheet.edit.notes } : undefined}
          onConfirm={(quantity, notes) => {
            if (sheet.edit) {
              cart.update(sheet.edit.key, quantity, notes);
              setSheet({ kind: "cart" });
            } else {
              cart.add(sheet.dish, quantity, notes);
              setSheet(null);
              notify(`${quantity}× ${sheet.dish.name} no carrinho`, "success");
            }
          }}
          onClose={() => setSheet(sheet.edit ? { kind: "cart" } : null)}
        />
      )}
      {sheet?.kind === "cart" && (
        <CartSheet
          lines={lines}
          feeCents={flatFee(config)}
          minOrderCents={config?.minOrderCents ?? 0}
          closedNow={open === false}
          onQuantity={cart.setQuantity}
          onRemove={cart.remove}
          onEdit={(line) => {
            const dish = liveDishes.get(line.productId);
            if (dish) setSheet({ kind: "product", dish, edit: line });
          }}
          onCheckout={goToCheckout}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === "info" && <InfoSheet name={restaurantName} hours={settings.hours} open={open} config={config} onClose={() => setSheet(null)} />}
    </div>
  );
}
