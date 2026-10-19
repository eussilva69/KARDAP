"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  LoaderCircle,
  MapPin,
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
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
import type { Brand, RestaurantSettings } from "@/components/dashboard/types";
import type { DeliveryCheckoutPayload, DeliveryAddress, DeliveryConfig } from "@/lib/delivery/types";
import { PAYMENT_METHOD_LABELS } from "@/lib/delivery/types";
import { productPrice } from "../public-menu/public-menu";

type Notify = (message: string, tone?: "success" | "error") => void;

// ───────────────────────── Cart state ─────────────────────────

type CartItem = {
  productId: string;
  name: string;
  priceCents: number;
  quantity: number;
  notes: string;
  image?: string;
};

function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);

  const add = useCallback((product: RestaurantProduct) => {
    const priceCents = parsePriceCents(product);
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) return prev.map((i) => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { productId: product.id, name: product.name, priceCents, quantity: 1, notes: "", image: product.image }];
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

// ───────────────────────── Data loading ─────────────────────────

type Restaurant = { id: string; name: string; brand: Partial<Brand>; settings: Partial<RestaurantSettings> };
type Section = { key: string; name: string; items: RestaurantProduct[] };

function useDeliveryData(slug: string) {
  const [status, setStatus] = useState<"loading" | "ready" | "not-found" | "error">("loading");
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [products, setProducts] = useState<RestaurantProduct[]>([]);
  const [categories, setCategories] = useState<RestaurantCategory[]>([]);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const restaurantId = restaurant?.id || "";

  useEffect(() => {
    if (!slug || !isFirebaseConfigured) { setStatus(slug ? "error" : "not-found"); return; }
    setStatus("loading");
    return watchPublicRestaurant(slug, (data, meta) => {
      if (!data) { if (!meta.fromCache) setStatus("not-found"); return; }
      setRestaurant({
        id: data.id,
        name: typeof data.name === "string" ? data.name : "",
        brand: (data.brand as Partial<Brand> | undefined) || {},
        settings: (data.settings as Partial<RestaurantSettings> | undefined) || {},
      });
      setStatus("ready");
    }, () => setStatus("error"));
  }, [slug]);

  useEffect(() => {
    if (!restaurantId) return;
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
      const key = cat ? cat.id : `nome:${name.toLowerCase()}`;
      const group = groups.get(key) || { key, name, order: cat ? Number(cat.order) || 0 : Infinity, items: [] };
      group.items.push(product);
      groups.set(key, group);
    }
    return Array.from(groups.values()).sort((a, b) => a.order - b.order).map(({ key, name, items }) => ({ key, name, items }));
  }, [products, categories]);

  return { status, restaurant, sections, productsLoaded };
}

function useDeliveryConfig(restaurantId: string) {
  const [config, setConfig] = useState<{ deliveryFeeCents: number; deliveryEta: string; deliveryArea: string; minOrderCents: number; paymentMethods: string[]; notes: string } | null>(null);
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

// ───────────────────────── Main component ─────────────────────────

type Step = "menu" | "cart" | "checkout" | "confirmation";

export default function DeliveryMenu({ slug, notify }: { slug: string; notify: Notify }) {
  const { status, restaurant, sections, productsLoaded } = useDeliveryData(slug);
  const cart = useCart();
  const [step, setStep] = useState<Step>("menu");
  const deliveryConfig = useDeliveryConfig(restaurant?.id || "");
  const [orderResult, setOrderResult] = useState<{ orderId: string; orderNumber: number } | null>(null);

  if (status !== "ready" || !restaurant) {
    return (
      <div className="pm-app">
        <div className="pm-column">
          <div className="pm-platform"><span>KARDAP</span></div>
          {status === "loading" ? (
            <div style={{ padding: 40, textAlign: "center" }}><LoaderCircle size={24} className="pm-spin" /></div>
          ) : (
            <div className="pm-state">
              <h1 className="pm-state-title">{status === "not-found" ? "Restaurante não encontrado" : "Erro ao carregar"}</h1>
              <p className="pm-state-text">{status === "not-found" ? "Este link de delivery não corresponde a nenhum restaurante." : "Verifique sua conexão e tente de novo."}</p>
            </div>
          )}
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

  const deliveryFeeCents = deliveryConfig.config?.deliveryFeeCents ?? 0;
  const totalCents = cart.subtotalCents + deliveryFeeCents;

  return (
    <div className="pm-app">
      <div className="pm-column">
        <div className="pm-platform">
          {step !== "menu" ? (
            <button className="pm-platform-back" onClick={() => setStep(step === "cart" ? "menu" : step === "checkout" ? "cart" : "menu")}>
              <ArrowLeft size={15} />
              <span>Voltar</span>
            </button>
          ) : (
            <Link className="pm-platform-back" href={`/r/${slug}`}>
              <ArrowLeft size={15} />
              <span>Cardápio</span>
            </Link>
          )}
          <span>Delivery</span>
        </div>

        {step === "menu" && (
          <DeliveryProductList
            restaurant={restaurant}
            sections={sections}
            loaded={productsLoaded}
            cart={cart}
            deliveryConfig={deliveryConfig.config}
            onGoToCart={() => setStep("cart")}
          />
        )}

        {step === "cart" && (
          <CartView
            cart={cart}
            deliveryFeeCents={deliveryFeeCents}
            onCheckout={() => setStep("checkout")}
            minOrderCents={deliveryConfig.config?.minOrderCents ?? 0}
          />
        )}

        {step === "checkout" && restaurant && deliveryConfig.config && (
          <CheckoutForm
            restaurantId={restaurant.id}
            cart={cart}
            deliveryFeeCents={deliveryFeeCents}
            paymentMethods={deliveryConfig.config.paymentMethods}
            notify={notify}
            onSuccess={(result) => {
              setOrderResult(result);
              cart.clear();
              setStep("confirmation");
            }}
          />
        )}

        {step === "confirmation" && orderResult && (
          <OrderConfirmation
            orderNumber={orderResult.orderNumber}
            restaurantName={restaurant.name}
            slug={slug}
          />
        )}

        {step === "menu" && cart.totalItems > 0 && (
          <div className="pm-cart-fab" onClick={() => setStep("cart")}>
            <ShoppingBag size={18} />
            <span>Ver carrinho ({cart.totalItems})</span>
            <span style={{ marginLeft: "auto", fontWeight: 600 }}>{brl.format(cart.subtotalCents / 100)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Product list ─────────────────────────

function DeliveryProductList({
  restaurant,
  sections,
  loaded,
  cart,
  deliveryConfig,
  onGoToCart,
}: {
  restaurant: Restaurant;
  sections: Section[];
  loaded: boolean;
  cart: ReturnType<typeof useCart>;
  deliveryConfig: { deliveryFeeCents: number; deliveryEta: string; deliveryArea: string } | null;
  onGoToCart: () => void;
}) {
  return (
    <>
      <header className="pm-restaurant" style={{ padding: "12px 16px" }}>
        <div className="pm-restaurant-main" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {restaurant.brand.logo && (
            <span className="pm-logo"><img src={restaurant.brand.logo} alt="" width={38} height={38} /></span>
          )}
          <span className="pm-restaurant-text">
            <h1 className="pm-restaurant-name">{restaurant.name}</h1>
            {deliveryConfig && (
              <span className="pm-restaurant-meta" style={{ fontSize: 12, color: "var(--pm-muted, #888)" }}>
                {deliveryConfig.deliveryEta && <span>⏱ {deliveryConfig.deliveryEta}</span>}
                {deliveryConfig.deliveryFeeCents === 0 ? <span>Entrega grátis</span> : <span>Taxa: {brl.format(deliveryConfig.deliveryFeeCents / 100)}</span>}
                {deliveryConfig.deliveryArea && <span>{deliveryConfig.deliveryArea}</span>}
              </span>
            )}
          </span>
        </div>
      </header>

      {!loaded ? (
        <div style={{ padding: 40, textAlign: "center" }}><LoaderCircle size={20} className="pm-spin" /></div>
      ) : !sections.length ? (
        <p className="pm-empty"><b>O cardápio está sendo preparado</b></p>
      ) : (
        <div className="pm-sections">
          {sections.map((section) => (
            <section key={section.key} className="pm-section">
              <h2 className="pm-section-title">{section.name}</h2>
              <ul className="pm-products">
                {section.items.map((product) => {
                  const price = productPrice(product);
                  const inCart = cart.items.find((i) => i.productId === product.id);
                  return (
                    <li key={product.id}>
                      <div className="pm-product" style={{ cursor: "default" }}>
                        <span className="pm-product-info">
                          <span className="pm-product-name">{product.name}</span>
                          {product.description?.trim() && <span className="pm-product-desc">{product.description.trim()}</span>}
                          {price && <span className="pm-price">{price}</span>}
                        </span>
                        {product.image && (
                          <span className="pm-thumb"><img src={product.image} alt="" width={80} height={80} loading="lazy" /></span>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 16px 8px" }}>
                        {inCart ? (
                          <>
                            <button type="button" className="pm-qty-btn" onClick={() => cart.updateQty(product.id, inCart.quantity - 1)}>
                              <Minus size={14} />
                            </button>
                            <span style={{ minWidth: 20, textAlign: "center", fontWeight: 600 }}>{inCart.quantity}</span>
                            <button type="button" className="pm-qty-btn" onClick={() => cart.updateQty(product.id, inCart.quantity + 1)}>
                              <Plus size={14} />
                            </button>
                          </>
                        ) : (
                          <button type="button" className="pm-btn pm-btn--sm" onClick={() => cart.add(product)}>
                            <Plus size={14} /> Adicionar
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

// ───────────────────────── Cart view ─────────────────────────

function CartView({
  cart,
  deliveryFeeCents,
  onCheckout,
  minOrderCents,
}: {
  cart: ReturnType<typeof useCart>;
  deliveryFeeCents: number;
  onCheckout: () => void;
  minOrderCents: number;
}) {
  const totalCents = cart.subtotalCents + deliveryFeeCents;
  const belowMin = minOrderCents > 0 && cart.subtotalCents < minOrderCents;

  if (!cart.items.length) {
    return (
      <div className="pm-state">
        <ShoppingBag size={32} strokeWidth={1.2} />
        <h1 className="pm-state-title">Carrinho vazio</h1>
        <p className="pm-state-text">Adicione produtos do cardápio para fazer seu pedido.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Seu pedido</h2>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {cart.items.map((item) => (
          <li key={item.productId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--pm-border, #eee)" }}>
            {item.image && <img src={item.image} alt="" width={48} height={48} style={{ borderRadius: 6, objectFit: "cover" }} />}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{item.name}</div>
              <div style={{ fontSize: 13, color: "var(--pm-muted, #888)" }}>{brl.format(item.priceCents / 100)} × {item.quantity}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button type="button" className="pm-qty-btn" onClick={() => cart.updateQty(item.productId, item.quantity - 1)}>
                <Minus size={14} />
              </button>
              <span style={{ minWidth: 20, textAlign: "center", fontWeight: 600 }}>{item.quantity}</span>
              <button type="button" className="pm-qty-btn" onClick={() => cart.updateQty(item.productId, item.quantity + 1)}>
                <Plus size={14} />
              </button>
              <button type="button" className="pm-qty-btn" onClick={() => cart.remove(item.productId)} title="Remover" style={{ marginLeft: 4 }}>
                <Trash2 size={14} />
              </button>
            </div>
            <div style={{ fontWeight: 600, minWidth: 70, textAlign: "right" }}>{brl.format((item.priceCents * item.quantity) / 100)}</div>
          </li>
        ))}
      </ul>
      <div style={{ marginTop: 16, fontSize: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span>Subtotal</span><span>{brl.format(cart.subtotalCents / 100)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span>Taxa de entrega</span><span>{deliveryFeeCents === 0 ? "Grátis" : brl.format(deliveryFeeCents / 100)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16, marginTop: 8, paddingTop: 8, borderTop: "2px solid var(--pm-text, #000)" }}>
          <span>Total</span><span>{brl.format(totalCents / 100)}</span>
        </div>
      </div>
      {belowMin && (
        <p style={{ color: "var(--pm-danger, #c00)", fontSize: 13, marginTop: 8 }}>
          Pedido mínimo: {brl.format(minOrderCents / 100)}. Adicione mais itens.
        </p>
      )}
      <button type="button" className="pm-btn pm-btn--primary" disabled={belowMin} onClick={onCheckout} style={{ width: "100%", marginTop: 16 }}>
        Continuar para entrega
      </button>
    </div>
  );
}

// ───────────────────────── Checkout form ─────────────────────────

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function CheckoutForm({
  restaurantId,
  cart,
  deliveryFeeCents,
  paymentMethods,
  notify,
  onSuccess,
}: {
  restaurantId: string;
  cart: ReturnType<typeof useCart>;
  deliveryFeeCents: number;
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
  const [paymentMethod, setPaymentMethod] = useState(paymentMethods[0] || "");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
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

    setSubmitting(true);
    setError("");
    submittedRef.current = true;

    try {
      const payload: DeliveryCheckoutPayload = {
        restaurantId,
        customer: { name: name.trim(), phone: phoneDigits },
        address: { cep: cep.trim(), street: street.trim(), number: number.trim(), complement: complement.trim() || undefined, district: district.trim(), city: city.trim(), reference: reference.trim() || undefined },
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
          <label className="pm-field">CEP<input className="pm-input" value={cep} onChange={(e) => setCep(e.target.value)} inputMode="numeric" maxLength={10} required /></label>
          <label className="pm-field">Rua<input className="pm-input" value={street} onChange={(e) => setStreet(e.target.value)} required /></label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8 }}>
            <label className="pm-field">Número<input className="pm-input" value={number} onChange={(e) => setNumber(e.target.value)} required /></label>
            <label className="pm-field">Complemento<input className="pm-input" value={complement} onChange={(e) => setComplement(e.target.value)} placeholder="Apto, bloco..." /></label>
          </div>
          <label className="pm-field">Bairro<input className="pm-input" value={district} onChange={(e) => setDistrict(e.target.value)} required /></label>
          <label className="pm-field">Cidade<input className="pm-input" value={city} onChange={(e) => setCity(e.target.value)} required /></label>
          <label className="pm-field">Referência<input className="pm-input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Próximo a..." /></label>
        </div>
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
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span>Taxa de entrega</span>
          <span>{deliveryFeeCents === 0 ? "Grátis" : brl.format(deliveryFeeCents / 100)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16, marginTop: 8, paddingTop: 8, borderTop: "2px solid var(--pm-text, #000)" }}>
          <span>Total</span>
          <span>{brl.format(totalCents / 100)}</span>
        </div>
      </div>

      {error && <p style={{ color: "var(--pm-danger, #c00)", fontSize: 13, marginBottom: 12 }}>{error}</p>}

      <button type="submit" className="pm-btn pm-btn--primary" disabled={submitting} style={{ width: "100%", position: "relative" }}>
        {submitting ? <LoaderCircle size={18} className="pm-spin" /> : <Check size={16} />}
        {submitting ? "Enviando pedido..." : `Confirmar pedido · ${brl.format(totalCents / 100)}`}
      </button>
    </form>
  );
}

// ───────────────────────── Order confirmation ─────────────────────────

function OrderConfirmation({ orderNumber, restaurantName, slug }: { orderNumber: number; restaurantName: string; slug: string }) {
  return (
    <div style={{ padding: "40px 16px", textAlign: "center" }}>
      <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
        <Check size={28} color="#fff" />
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Pedido enviado!</h2>
      <p style={{ fontSize: 14, color: "var(--pm-muted, #888)", marginBottom: 4 }}>
        Seu pedido #{String(orderNumber).padStart(3, "0")} foi recebido por <strong>{restaurantName}</strong>.
      </p>
      <p style={{ fontSize: 13, color: "var(--pm-muted, #888)", marginBottom: 24 }}>
        O estabelecimento confirmará seu pedido em breve. Acompanhe pelo seu telefone.
      </p>
      <Link href={`/r/${slug}/delivery`} className="pm-btn" style={{ display: "inline-flex" }}>
        Fazer novo pedido
      </Link>
    </div>
  );
}
