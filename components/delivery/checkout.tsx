"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Check, LoaderCircle, MapPin, Search } from "lucide-react";
import { friendlyError } from "@/lib/async";
import { brl, parseMoneyCents } from "@/lib/format";
import { ONLINE_PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type DeliveryCheckoutPayload } from "@/lib/delivery/types";
import type { OnlinePaymentData } from "./payment-step";
import { Button, SelectField, TextArea, TextField } from "@/components/ui/primitives";
import { Autocomplete, newSessionToken } from "@/components/ui/autocomplete";
import { neighborhoodKey } from "@/lib/delivery/match";
import { OrderSummary, type PricedLine } from "./cart-sheet";
import { useDeliveryFee, type DeliveryMenuConfig } from "./use-delivery";
import { readCheckoutDraft, saveCheckoutDraft } from "./checkout-draft";

type Field = "name" | "phone" | "cep" | "street" | "number" | "district" | "city" | "payment" | "change";
type CheckoutStep = 1 | 2 | 3 | 4;
const FIELD_ORDER: Field[] = ["name", "phone", "cep", "street", "number", "district", "city", "payment", "change"];
const STEP_FIELDS: Record<CheckoutStep, Field[]> = {
  1: ["name", "phone"],
  2: ["cep", "street", "number", "district", "city"],
  3: ["payment", "change"],
  4: [],
};
const STEP_LABELS = ["Dados", "Entrega", "Pagamento", "Revisão"] as const;
const NEXT_LABEL: Record<1 | 2 | 3, string> = { 1: "Ir para a entrega", 2: "Ir para o pagamento", 3: "Revisar pedido" };

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function formatCep(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  return digits.length <= 5 ? digits : `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

type FoundAddress = { placeId?: string; street: string; number: string; district: string; city: string; uf: string; cep: string; ibgeCode?: string; formatted?: string };
type AddressSuggestion = { placeId: string; main: string; secondary: string };

async function lookupAddress(params: Record<string, string>): Promise<FoundAddress | null> {
  try {
    const res = await fetch(`/api/delivery/address?${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    return (await res.json()) as FoundAddress;
  } catch {
    return null;
  }
}

export function Checkout({
  restaurantId,
  restaurantName,
  config,
  lines,
  initialStep = 1,
  reducedMotion = false,
  onBack,
  onEditCart,
  onSuccess,
  slug,
}: {
  restaurantId: string;
  restaurantName: string;
  slug?: string;
  config: DeliveryMenuConfig;
  lines: PricedLine[];
  /** 3: volta direto ao pagamento (a pessoa saiu do pagamento online para trocar a forma de pagar). */
  initialStep?: 1 | 3;
  reducedMotion?: boolean;
  onBack: () => void;
  onEditCart: () => void;
  onSuccess: (result: { orderId: string; orderNumber: number; payment?: OnlinePaymentData; totalCents?: number }) => void;
}) {
  // O que já foi digitado nesta aba volta preenchido (editar o carrinho ou trocar o pagamento não apaga o formulário).
  const [draft] = useState(() => readCheckoutDraft(restaurantId));
  const [step, setStep] = useState<CheckoutStep>(initialStep);
  const [name, setName] = useState(draft.name || "");
  const [phone, setPhone] = useState(draft.phone || "");
  const [cep, setCep] = useState(draft.cep || "");
  const [street, setStreet] = useState(draft.street || "");
  const [number, setNumber] = useState(draft.number || "");
  const [complement, setComplement] = useState(draft.complement || "");
  const [district, setDistrict] = useState(draft.district || "");
  const [city, setCity] = useState(draft.city || "");
  const [uf, setUf] = useState(draft.uf || "");
  const [ibgeCode, setIbgeCode] = useState(draft.ibgeCode || "");
  const [placeId, setPlaceId] = useState(draft.placeId || "");
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressNotice, setAddressNotice] = useState("");
  const sessionRef = useRef(newSessionToken());
  const [reference, setReference] = useState(draft.reference || "");
  const [paymentMethod, setPaymentMethod] = useState(() =>
    draft.paymentMethod && config.paymentMethods.includes(draft.paymentMethod) ? draft.paymentMethod : config.paymentMethods[0] || "",
  );
  const [changeFor, setChangeFor] = useState(draft.changeFor || "");
  const [notes, setNotes] = useState(draft.notes || "");
  const [cepLoading, setCepLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState("");
  const submittedRef = useRef(false);
  const idempotencyKey = useRef(`del_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);

  const fee = useDeliveryFee(restaurantId, config, city, district, uf, ibgeCode, { placeId, street, number, cep });
  const feeCents = fee.feeCents ?? 0;
  const subtotal = lines.reduce((sum, line) => sum + line.priceCents * line.quantity, 0);
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const totalCents = subtotal + feeCents;
  const cities = config.servedCities;

  useEffect(() => {
    saveCheckoutDraft(restaurantId, { name, phone, cep, street, number, complement, district, city, uf, ibgeCode, placeId, reference, paymentMethod, changeFor, notes });
  }, [restaurantId, name, phone, cep, street, number, complement, district, city, uf, ibgeCode, placeId, reference, paymentMethod, changeFor, notes]);

  // Cliente com conta no Kardap: preenche nome, telefone e o último endereço usado.
  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;
    (async () => {
      try {
        const { getFirebaseAuth } = await import("@/lib/auth");
        const user = getFirebaseAuth().currentUser;
        if (!user || cancelled) return;
        const { watchCustomerProfile } = await import("@/lib/restaurant-db");
        stop = watchCustomerProfile(
          user.uid,
          (profile) => {
            stop?.();
            if (!profile || cancelled) return;
            setName((v) => v || profile.name || "");
            setPhone((v) => v || (profile.phone ? formatPhone(profile.phone) : ""));
            const addr = profile.addresses?.[0];
            if (addr) {
              setStreet((v) => v || addr.street || "");
              setNumber((v) => v || addr.number || "");
              setComplement((v) => v || addr.complement || "");
              setDistrict((v) => v || addr.district || "");
              setCity((v) => v || addr.city || "");
              setReference((v) => v || addr.reference || "");
            }
          },
          () => {},
        );
      } catch {}
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  const clearError = (field: Field) => setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  /** onChange de campo obrigatório: grava o valor e tira o erro do campo. */
  const onField = (field: Field, set: (value: string) => void) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    set(event.target.value);
    clearError(field);
  };

  /** Endereço encontrado (Google ou CEP): substitui rua, bairro, cidade e UF; número só quando veio junto. */
  const applyAddress = useCallback((found: FoundAddress, opts: { keepNumber: boolean }) => {
    setStreet(found.street || "");
    setDistrict(found.district || "");
    if (found.city) setCity(found.city);
    setUf(found.uf || "");
    setIbgeCode(found.ibgeCode || "");
    setPlaceId(found.placeId || "");
    if (found.cep) setCep(formatCep(found.cep));
    if (!opts.keepNumber) {
      setNumber(found.number || "");
      setComplement("");
    }
    setErrors((current) => ({ ...current, cep: undefined, street: undefined, district: undefined, city: undefined, number: undefined }));
  }, []);

  const handleCep = useCallback(async (raw: string) => {
    const formatted = formatCep(raw);
    setCep(formatted);
    setErrors((current) => ({ ...current, cep: undefined }));
    const digits = formatted.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setCepLoading(true);
    const result = await lookupAddress({ restaurantId, cep: digits });
    setCepLoading(false);
    if (!result) {
      setErrors((current) => ({ ...current, cep: "CEP não encontrado. Confira os números ou preencha o endereço." }));
      return;
    }
    // Mesmo logradouro: o número digitado continua valendo; outra rua: o número antigo não serve mais.
    applyAddress({ ...result, placeId: "" }, { keepNumber: !result.street || neighborhoodKey(result.street) === neighborhoodKey(street) });
  }, [restaurantId, applyAddress, street]);

  const searchAddress = useCallback(async (q: string, signal: AbortSignal): Promise<AddressSuggestion[]> => {
    const res = await fetch(`/api/delivery/address?${new URLSearchParams({ restaurantId, q, session: sessionRef.current })}`, { signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Busca indisponível. Preencha pelo CEP.");
    return data.suggestions || [];
  }, [restaurantId]);

  const chooseAddress = async (item: AddressSuggestion) => {
    const session = sessionRef.current;
    sessionRef.current = newSessionToken();
    setAddressLoading(true);
    setAddressNotice("");
    const found = await lookupAddress({ restaurantId, placeId: item.placeId, session });
    setAddressLoading(false);
    if (!found) {
      setAddressNotice("Não foi possível carregar este endereço. Tente outra sugestão ou preencha pelo CEP.");
      return;
    }
    applyAddress(found, { keepNumber: false });
    if (!found.district) setAddressNotice("Não identificamos o bairro deste endereço. Informe o bairro abaixo.");
    setTimeout(() => document.getElementById(found.number ? "kd-co-complement" : "kd-co-number")?.focus(), 0);
  };

  /** Edição manual de rua/bairro/cidade desfaz o vínculo com a sugestão escolhida. */
  const manual = (field: Field, set: (value: string) => void) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    set(event.target.value);
    setPlaceId("");
    clearError(field);
  };

  const changeCents = paymentMethod === "dinheiro" && changeFor.trim() ? parseMoneyCents(changeFor) : null;

  const validate = () => {
    const next: Partial<Record<Field, string>> = {};
    const phoneDigits = phone.replace(/\D/g, "");
    if (!name.trim()) next.name = "Informe seu nome.";
    if (phoneDigits.length < 10) next.phone = "Informe um telefone válido com DDD.";
    if (!cep.trim()) next.cep = "Informe o CEP.";
    if (!street.trim()) next.street = "Informe a rua.";
    if (!number.trim()) next.number = "Informe o número.";
    if (!district.trim()) next.district = "Informe o bairro.";
    if (!city.trim()) next.city = "Informe a cidade.";
    if (!paymentMethod) next.payment = "Selecione a forma de pagamento.";
    if (paymentMethod === "dinheiro" && changeFor.trim()) {
      if (changeCents === null || !Number.isFinite(changeCents) || changeCents <= 0) next.change = "Informe um valor, como 50 ou 100,00.";
      else if (!fee.loading && fee.matched && changeCents < totalCents) next.change = `O troco precisa ser para um valor a partir de ${brl(totalCents)}.`;
    }
    return next;
  };

  const focusField = (field: Field) => setTimeout(() => document.getElementById(`kd-co-${field}`)?.focus(), 0);
  const moveToStep = (next: CheckoutStep) => {
    setFormError("");
    setStep(next);
    window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  };
  const continueCheckout = () => {
    const found = validate();
    const first = STEP_FIELDS[step].find((field) => found[field]);
    if (first) {
      setErrors((current) => ({ ...current, [first]: found[first] }));
      focusField(first);
      return;
    }
    if (step === 2) {
      if (fee.loading) {
        setFormError("Aguarde o cálculo da entrega.");
        return;
      }
      if (!fee.matched) {
        // O motivo já aparece no aviso do endereço: leva o foco até ele em vez de repetir a mensagem.
        if (fee.reason) document.getElementById("kd-co-fee-alert")?.focus();
        else setFormError("Endereço fora da área de entrega.");
        return;
      }
    }
    moveToStep((step + 1) as CheckoutStep);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submittedRef.current) return;
    const found = validate();
    setErrors(found);
    const first = FIELD_ORDER.find((field) => found[field]);
    if (first) {
      setFormError("");
      const invalidStep = Number(Object.entries(STEP_FIELDS).find(([, fields]) => fields.includes(first))?.[0] || 1) as CheckoutStep;
      setStep(invalidStep);
      focusField(first);
      return;
    }
    if (fee.loading) {
      setFormError("Aguarde o cálculo do frete.");
      return;
    }
    if (!fee.matched) {
      setFormError(fee.reason || "Endereço fora da área de entrega.");
      return;
    }

    setSubmitting(true);
    setFormError("");
    submittedRef.current = true;
    const phoneDigits = phone.replace(/\D/g, "");
    // Troco vai junto das observações do pedido: aparece no PDV, na cozinha e na entrega sem mudar o formato do pedido.
    const changeNote = changeCents ? `Troco para ${brl(changeCents)}` : "";
    const orderNotes = [changeNote, notes.trim()].filter(Boolean).join(" · ");

    try {
      const payload: DeliveryCheckoutPayload = {
        restaurantId,
        customer: { name: name.trim(), phone: phoneDigits },
        address: {
          cep: cep.trim(),
          street: street.trim(),
          number: number.trim(),
          complement: complement.trim() || undefined,
          district: district.trim(),
          city: city.trim(),
          uf: uf.trim() || undefined,
          ibgeCode: ibgeCode || undefined,
          reference: reference.trim() || undefined,
          placeId: placeId || undefined,
        },
        items: lines.map((line) => ({ productId: line.productId, quantity: line.quantity, notes: line.notes || undefined })),
        paymentMethod,
        notes: orderNotes || undefined,
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

      // Pagamento online: gera PIX ou preference do Mercado Pago antes de avançar.
      if (ONLINE_PAYMENT_METHODS.has(paymentMethod)) {
        if (paymentMethod === "cartao_online") {
          onSuccess({ orderId: data.orderId, orderNumber: data.orderNumber, payment: { type: "card_setup" }, totalCents });
          return;
        }
        const payRes = await fetch("/api/delivery/payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            restaurantId,
            orderId: data.orderId,
            paymentMethod,
            restaurantName,
            slug: slug || "",
          }),
        });
        const payData = await payRes.json().catch(() => ({}));
        if (!payRes.ok) throw new Error(payData.message || "Não foi possível iniciar o pagamento online.");
        if (payData.alreadyPaid) {
          onSuccess({ orderId: data.orderId, orderNumber: data.orderNumber });
          return;
        }
        onSuccess({ orderId: data.orderId, orderNumber: data.orderNumber, payment: payData as OnlinePaymentData, totalCents: subtotal + feeCents });
        return;
      }

      onSuccess({ orderId: data.orderId, orderNumber: data.orderNumber });
    } catch (err) {
      submittedRef.current = false;
      setFormError(friendlyError(err, "Não foi possível enviar o pedido. Tente de novo."));
    } finally {
      setSubmitting(false);
    }
  };

  const cityOptions = cities.some((c) => c.name.toLowerCase() === city.trim().toLowerCase()) || !city.trim() ? cities : [...cities, { ibgeCode: "", name: city, uf }];
  const districtOptions = fee.servedNeighborhoods;
  const districtInList = districtOptions.some((n) => n.name.toLowerCase() === district.trim().toLowerCase());
  const busy = submitting || fee.loading;
  const recognized = !fee.loading && fee.matched && fee.neighborhoodName && neighborhoodKey(fee.neighborhoodName) !== neighborhoodKey(district) ? fee.neighborhoodName : "";
  const districtHint = recognized ? `Bairro reconhecido como ${recognized}.` : undefined;
  const online = ONLINE_PAYMENT_METHODS.has(paymentMethod);
  const addressLine = [`${street}, ${number}`, complement].filter((part) => part.trim()).join(" · ");

  const itemsList = (
    <ul className="kd-checkout-items">
      {lines.map((line) => (
        <li key={line.key}>
          <span>
            <span className="kd-num">{line.quantity}×</span> {line.name}
            {line.notes && <small>“{line.notes}”</small>}
          </span>
          <span className="kd-num">{brl(line.priceCents * line.quantity)}</span>
        </li>
      ))}
    </ul>
  );

  /** Linha da revisão com o atalho para a etapa onde aquele dado é alterado (o controle fica junto do que ele muda). */
  const reviewRow = (label: string, value: React.ReactNode, target: CheckoutStep | "cart", extra?: React.ReactNode) => (
    <div className="kd-review-row">
      <dt>{label}</dt>
      <dd>
        {value}
        {extra}
      </dd>
      <button
        type="button"
        className="kd-review-edit"
        onClick={() => (target === "cart" ? onEditCart() : moveToStep(target))}
        aria-label={`Alterar ${label.toLowerCase()}`}
      >
        Alterar
      </button>
    </div>
  );

  return (
    <>
      <header className="kd-checkout-head">
        <button type="button" className="kd-menu-search-btn" onClick={() => (step === 1 ? onBack() : moveToStep((step - 1) as CheckoutStep))} aria-label={step === 1 ? "Voltar ao cardápio" : "Voltar à etapa anterior"}>
          <ArrowLeft size={18} />
        </button>
        <div>
          <p className="kd-overline">{restaurantName}</p>
          <h1>Finalizar pedido</h1>
        </div>
      </header>

      <nav className="kd-checkout-progress" aria-label="Etapas do pedido">
        <ol>
          {STEP_LABELS.map((label, index) => {
            const itemStep = (index + 1) as CheckoutStep;
            const done = itemStep < step;
            return (
              <li key={label} className={itemStep === step ? "is-active" : done ? "is-done" : ""} aria-current={itemStep === step ? "step" : undefined}>
                <button type="button" disabled={itemStep > step} onClick={() => moveToStep(itemStep)} aria-label={`${label}, etapa ${itemStep} de ${STEP_LABELS.length}${done ? ", concluída" : ""}`}>
                  <span>{done ? <Check size={14} aria-hidden /> : itemStep}</span>
                  <small>{label}</small>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <form id="kd-checkout" onSubmit={handleSubmit} noValidate>
        {step === 1 && (
          <div className="kd-checkout-step k-enter">
            <section className="kd-checkout-section" aria-labelledby="kd-co-order">
              <header className="kd-checkout-section-head">
                <h2 id="kd-co-order">Seu pedido</h2>
                <Button variant="link" size="sm" onClick={onEditCart}>
                  Editar carrinho
                </Button>
              </header>
              {lines.length ? itemsList : <p className="kd-muted">Seu carrinho está vazio. Volte ao cardápio para escolher os pratos.</p>}
              <OrderSummary subtotalCents={subtotal} feeCents={null} count={count} />
            </section>

            <section className="kd-checkout-section" aria-labelledby="kd-co-you">
              <header className="kd-checkout-section-head">
                <h2 id="kd-co-you">Seus dados</h2>
              </header>
              <TextField id="kd-co-name" label="Nome" autoComplete="name" value={name} error={errors.name} maxLength={80} onChange={onField("name", setName)} />
              <TextField
                id="kd-co-phone"
                label="Telefone (WhatsApp)"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="(00) 00000-0000"
                hint="O restaurante usa este número se precisar falar sobre a entrega."
                value={phone}
                error={errors.phone}
                onChange={onField("phone", (value) => setPhone(formatPhone(value)))}
              />
            </section>
          </div>
        )}

        {step === 2 && (
          <div className="kd-checkout-step k-enter">
            <section className="kd-checkout-section" aria-labelledby="kd-co-address">
              <header className="kd-checkout-section-head">
                <div>
                  <h2 id="kd-co-address">Endereço de entrega</h2>
                  {config.deliveryArea && <p>Atendemos: {config.deliveryArea}</p>}
                </div>
              </header>
              {config.addressSearch && (
                <Autocomplete<AddressSuggestion>
                  id="kd-co-search"
                  label="Buscar endereço"
                  placeholder="Digite a rua e o número"
                  icon={<Search size={17} />}
                  fetchItems={searchAddress}
                  itemKey={(item) => item.placeId}
                  renderItem={(item) => (
                    <>
                      <MapPin size={16} />
                      <span className="kd-ac-item">
                        <b>{item.main}</b>
                        {item.secondary && <small>{item.secondary}</small>}
                      </span>
                    </>
                  )}
                  onSelect={chooseAddress}
                  busy={addressLoading}
                  emptyText="Nenhum endereço encontrado. Tente pelo CEP."
                  hint={addressNotice || "Ou preencha pelo CEP abaixo."}
                />
              )}
              <TextField
                id="kd-co-cep"
                label="CEP"
                inputMode="numeric"
                autoComplete="postal-code"
                placeholder="00000-000"
                maxLength={9}
                value={cep}
                error={errors.cep}
                hint={cepLoading ? "Buscando o endereço…" : "Preenche a rua, o bairro e a cidade."}
                trailing={cepLoading ? <LoaderCircle className="k-spin" size={18} aria-hidden style={{ margin: "0 12px" }} /> : undefined}
                onChange={(e) => handleCep(e.target.value)}
              />
              <TextField id="kd-co-street" label="Rua" autoComplete="address-line1" value={street} error={errors.street} onChange={manual("street", setStreet)} />
              <div className="kd-checkout-grid">
                <TextField id="kd-co-number" label="Número" inputMode="text" value={number} error={errors.number} maxLength={20} onChange={manual("number", setNumber)} />
                <TextField id="kd-co-complement" label="Complemento" optional autoComplete="address-line2" placeholder="Apto, bloco…" value={complement} maxLength={80} onChange={(e) => setComplement(e.target.value)} />
              </div>
              {cities.length > 0 ? (
                <SelectField
                  id="kd-co-city"
                  label="Cidade"
                  value={city}
                  error={errors.city}
                  onChange={(e) => {
                    const chosen = cityOptions.find((c) => c.name === e.target.value);
                    setCity(e.target.value);
                    setUf(chosen?.uf || "");
                    setIbgeCode(chosen?.ibgeCode || "");
                    setPlaceId("");
                    clearError("city");
                  }}
                >
                  <option value="">Selecione a cidade</option>
                  {cityOptions.map((c) => (
                    <option key={`${c.ibgeCode}-${c.name}`} value={c.name}>
                      {c.name}
                      {c.uf ? ` - ${c.uf}` : ""}
                    </option>
                  ))}
                </SelectField>
              ) : (
                <TextField
                  id="kd-co-city"
                  label="Cidade"
                  autoComplete="address-level2"
                  value={city}
                  error={errors.city}
                  onChange={manual("city", (value) => {
                    setCity(value);
                    setIbgeCode("");
                  })}
                />
              )}
              {districtOptions.length > 0 ? (
                <SelectField id="kd-co-district" label="Bairro" value={district} error={errors.district} hint={districtHint} onChange={manual("district", setDistrict)}>
                  <option value="">Selecione seu bairro</option>
                  {!districtInList && district.trim() && <option value={district}>{district}</option>}
                  {districtOptions.map((n) => (
                    <option key={n.slug} value={n.name}>
                      {n.name}
                    </option>
                  ))}
                </SelectField>
              ) : (
                <TextField id="kd-co-district" label="Bairro" autoComplete="address-level3" value={district} error={errors.district} hint={districtHint} onChange={manual("district", setDistrict)} />
              )}
              <TextField label="Ponto de referência" optional placeholder="Próximo a…" value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} />
              <DeliveryFeeStatus fee={fee} ready={Boolean(city.trim() && (district.trim() || placeId || (street.trim() && number.trim())))} />
            </section>
            {formError && (
              <div className="kd-sheet-error kd-checkout-step-error" role="alert">
                <AlertCircle size={18} aria-hidden />
                <p>{formError}</p>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="kd-checkout-step k-enter">
            <section className="kd-checkout-section" aria-labelledby="kd-co-pay">
              <header className="kd-checkout-section-head">
                <div>
                  <h2 id="kd-co-pay">Pagamento</h2>
                  <p>{online ? "Você paga agora, pelo Mercado Pago. O restaurante recebe o pedido assim que o pagamento for aprovado." : "Você paga ao receber o pedido."}</p>
                </div>
              </header>
              {config.paymentMethods.length === 0 ? (
                <div className="kd-sheet-error" role="alert">
                  <AlertCircle size={18} aria-hidden />
                  <p>O restaurante não tem formas de pagamento disponíveis no momento. Tente mais tarde ou fale com o estabelecimento.</p>
                </div>
              ) : (
                <fieldset className="kd-checkout-options" aria-describedby={errors.payment ? "kd-co-payment-msg" : undefined}>
                  <legend className="kd-sr">Forma de pagamento</legend>
                  {config.paymentMethods.map((method, i) => (
                    <label key={method} className={`kd-reason ${paymentMethod === method ? "is-checked" : ""}`}>
                      <input
                        id={i === 0 ? "kd-co-payment" : undefined}
                        type="radio"
                        name="kd-payment"
                        value={method}
                        checked={paymentMethod === method}
                        onChange={() => {
                          setPaymentMethod(method);
                          clearError("payment");
                          clearError("change");
                        }}
                      />
                      <span>{PAYMENT_METHOD_LABELS[method] || method}</span>
                      <span className="kd-reason-mark" aria-hidden />
                    </label>
                  ))}
                </fieldset>
              )}
              {errors.payment && (
                <p id="kd-co-payment-msg" className="kd-cart-warn" role="alert">
                  {errors.payment}
                </p>
              )}
              {paymentMethod === "dinheiro" && (
                <TextField
                  id="kd-co-change"
                  label="Troco para quanto?"
                  optional
                  inputMode="decimal"
                  placeholder="Ex.: 100,00"
                  hint={fee.matched && !fee.loading ? `Total do pedido: ${brl(totalCents)}. Deixe em branco se não precisar de troco.` : "Deixe em branco se não precisar de troco."}
                  value={changeFor}
                  error={errors.change}
                  maxLength={12}
                  onChange={onField("change", setChangeFor)}
                />
              )}
              <TextArea label="Observações do pedido" optional rows={2} maxLength={400} placeholder="Algo que o restaurante precise saber?" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </section>

            <section className="kd-checkout-section" aria-labelledby="kd-co-total">
              <header className="kd-checkout-section-head">
                <h2 id="kd-co-total">Resumo</h2>
              </header>
              <OrderSummary subtotalCents={subtotal} feeCents={fee.matched ? fee.feeCents : null} feeLoading={fee.loading} count={count} />
            </section>
          </div>
        )}

        {step === 4 && (
          <div className="kd-checkout-step k-enter">
            <section className="kd-checkout-section" aria-labelledby="kd-co-review">
              <header className="kd-checkout-section-head">
                <div>
                  <h2 id="kd-co-review">Revise antes de enviar</h2>
                  <p>Nada é enviado ao restaurante até você tocar em “Enviar pedido”.</p>
                </div>
              </header>
              <dl className="kd-review">
                {reviewRow("Itens", itemsList, "cart")}
                {reviewRow("Seus dados", `${name} · ${phone}`, 1)}
                {reviewRow(
                  "Entrega",
                  <>
                    {addressLine}
                    <small>
                      {district}, {city}
                      {reference.trim() ? ` · ${reference.trim()}` : ""}
                    </small>
                  </>,
                  2,
                )}
                {reviewRow(
                  "Pagamento",
                  PAYMENT_METHOD_LABELS[paymentMethod] || paymentMethod,
                  3,
                  <>
                    {changeCents ? <small>Troco para {brl(changeCents)}</small> : null}
                    {notes.trim() ? <small>“{notes.trim()}”</small> : null}
                  </>,
                )}
              </dl>
              <OrderSummary subtotalCents={subtotal} feeCents={fee.matched ? fee.feeCents : null} feeLoading={fee.loading} count={count} />
              {formError && (
                <div className="kd-sheet-error" role="alert">
                  <AlertCircle size={18} aria-hidden />
                  <p>{formError}</p>
                </div>
              )}
            </section>
          </div>
        )}
      </form>

      <div className="kd-menu-bar">
        <div className="kd-menu-bar-actions">
          {step > 1 && (
            <Button type="button" variant="secondary" size="lg" className="kd-bar-back" onClick={() => moveToStep((step - 1) as CheckoutStep)}>
              Voltar
            </Button>
          )}
          {step < 4 ? (
            <Button
              type="button"
              variant="signal"
              size="lg"
              loading={step === 2 && fee.loading}
              disabled={(step === 2 && fee.loading) || (step === 1 && lines.length === 0)}
              onClick={continueCheckout}
            >
              {step === 2 && fee.loading ? "Calculando entrega…" : NEXT_LABEL[step as 1 | 2 | 3]}
            </Button>
          ) : (
            <Button
              type="submit"
              form="kd-checkout"
              variant="signal"
              size="lg"
              className="kd-cart-cta"
              loading={submitting}
              disabled={busy || !fee.matched || lines.length === 0}
            >
              {submitting ? (
                "Enviando pedido…"
              ) : fee.loading ? (
                "Calculando frete…"
              ) : !fee.matched ? (
                "Endereço não atendido"
              ) : (
                <>
                  <span className="kd-cart-cta-label">Enviar pedido</span>
                  <span className="kd-num">{brl(totalCents)}</span>
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Situação da taxa para o endereço digitado: calculando, valor encontrado ou o motivo de não atender.
 * `ready`: só avalia depois que cidade e bairro (ou rua e número) foram preenchidos, para não acusar erro no meio da digitação.
 */
function DeliveryFeeStatus({ fee, ready }: { fee: ReturnType<typeof useDeliveryFee>; ready: boolean }) {
  if (!ready) return null;
  if (fee.loading) {
    return (
      <p className="kd-fee-status" role="status">
        <LoaderCircle className="k-spin" size={16} aria-hidden />
        Calculando a taxa de entrega…
      </p>
    );
  }
  if (!fee.matched && fee.reason) {
    return (
      <div id="kd-co-fee-alert" className="kd-sheet-error" role="alert" tabIndex={-1}>
        <AlertCircle size={18} aria-hidden />
        <p>{fee.reason}</p>
      </div>
    );
  }
  if (fee.matched && fee.feeCents !== null) {
    return (
      <p className="kd-fee-status is-ok" role="status">
        <Check size={16} aria-hidden />
        Entregamos neste endereço · taxa {fee.feeCents === 0 ? "grátis" : <span className="kd-num">{brl(fee.feeCents)}</span>}
      </p>
    );
  }
  return null;
}
