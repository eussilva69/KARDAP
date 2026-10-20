"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Check, LoaderCircle } from "lucide-react";
import { friendlyError } from "@/lib/async";
import { brl } from "@/lib/format";
import { PAYMENT_METHOD_LABELS, type DeliveryCheckoutPayload } from "@/lib/delivery/types";
import { Button, SelectField, TextArea, TextField } from "@/components/ui/primitives";
import { OrderSummary, type PricedLine } from "./cart-sheet";
import { useDeliveryFee, type DeliveryMenuConfig } from "./use-delivery";

type Field = "name" | "phone" | "cep" | "street" | "number" | "district" | "city" | "payment" | "change";
const FIELD_ORDER: Field[] = ["name", "phone", "cep", "street", "number", "district", "city", "payment", "change"];

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

/** "50", "50,5" ou "R$ 50,00" → centavos (NaN se não for um valor). */
function parseCents(raw: string): number {
  const clean = raw.replace(/[^\d,.]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  return clean ? Math.round(Number(clean) * 100) : NaN;
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
  } catch {
    return null;
  }
}

export function Checkout({
  restaurantId,
  restaurantName,
  config,
  lines,
  onBack,
  onEditCart,
  onSuccess,
}: {
  restaurantId: string;
  restaurantName: string;
  config: DeliveryMenuConfig;
  lines: PricedLine[];
  onBack: () => void;
  onEditCart: () => void;
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
  const [uf, setUf] = useState("");
  const [reference, setReference] = useState("");
  const [paymentMethod, setPaymentMethod] = useState(config.paymentMethods[0] || "");
  const [changeFor, setChangeFor] = useState("");
  const [notes, setNotes] = useState("");
  const [cepLoading, setCepLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState("");
  const submittedRef = useRef(false);
  const idempotencyKey = useRef(`del_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);

  const fee = useDeliveryFee(restaurantId, config, city, district, uf);
  const feeCents = fee.feeCents ?? 0;
  const subtotal = lines.reduce((sum, line) => sum + line.priceCents * line.quantity, 0);
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const totalCents = subtotal + feeCents;
  const cities = config.servedCities;

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

  const handleCep = useCallback(async (raw: string) => {
    const formatted = formatCep(raw);
    setCep(formatted);
    setErrors((current) => ({ ...current, cep: undefined }));
    if (formatted.replace(/\D/g, "").length !== 8) return;
    setCepLoading(true);
    const result = await fetchCep(formatted);
    setCepLoading(false);
    if (!result) return;
    if (result.street) setStreet(result.street);
    if (result.district) setDistrict(result.district);
    if (result.city) setCity(result.city);
    if (result.uf) setUf(result.uf);
  }, []);

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
      const cents = parseCents(changeFor);
      if (!Number.isFinite(cents) || cents <= 0) next.change = "Informe um valor, como 50 ou 100,00.";
      else if (!fee.loading && fee.matched && cents < totalCents) next.change = `O troco precisa ser para um valor a partir de ${brl(totalCents)}.`;
    }
    return next;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submittedRef.current) return;
    const found = validate();
    setErrors(found);
    const first = FIELD_ORDER.find((field) => found[field]);
    if (first) {
      setFormError("");
      document.getElementById(`kd-co-${first}`)?.focus();
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
    const changeNote = paymentMethod === "dinheiro" && changeFor.trim() ? `Troco para ${brl(parseCents(changeFor))}` : "";
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
          reference: reference.trim() || undefined,
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

  return (
    <>
      <header className="kd-checkout-head">
        <button type="button" className="kd-menu-search-btn" onClick={onBack} aria-label="Voltar ao cardápio">
          <ArrowLeft size={18} />
        </button>
        <div>
          <p className="kd-overline">{restaurantName}</p>
          <h1>Finalizar pedido</h1>
        </div>
      </header>

      <form id="kd-checkout" onSubmit={handleSubmit} noValidate>
        <section className="kd-checkout-section" aria-labelledby="kd-co-order">
          <header className="kd-menu-section-head">
            <h2 id="kd-co-order" className="kd-menu-section-title">
              Seu pedido
            </h2>
          </header>
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
          <Button variant="secondary" size="sm" onClick={onEditCart}>
            Editar carrinho
          </Button>
        </section>

        <section className="kd-checkout-section" aria-labelledby="kd-co-you">
          <header className="kd-menu-section-head">
            <h2 id="kd-co-you" className="kd-menu-section-title">
              Seus dados
            </h2>
          </header>
          <TextField id="kd-co-name" label="Nome" autoComplete="name" value={name} error={errors.name} maxLength={80} onChange={onField("name", setName)} />
          <TextField
            id="kd-co-phone"
            label="Telefone (WhatsApp)"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="(00) 00000-0000"
            value={phone}
            error={errors.phone}
            onChange={onField("phone", (value) => setPhone(formatPhone(value)))}
          />
        </section>

        <section className="kd-checkout-section" aria-labelledby="kd-co-address">
          <header className="kd-menu-section-head">
            <h2 id="kd-co-address" className="kd-menu-section-title">
              Endereço de entrega
            </h2>
            {config.deliveryArea && <p>Atendemos: {config.deliveryArea}</p>}
          </header>
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
          <TextField id="kd-co-street" label="Rua" autoComplete="address-line1" value={street} error={errors.street} onChange={onField("street", setStreet)} />
          <div className="kd-checkout-grid">
            <TextField id="kd-co-number" label="Número" inputMode="text" value={number} error={errors.number} maxLength={20} onChange={onField("number", setNumber)} />
            <TextField label="Complemento" optional autoComplete="address-line2" placeholder="Apto, bloco…" value={complement} maxLength={80} onChange={(e) => setComplement(e.target.value)} />
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
                if (chosen?.uf) setUf(chosen.uf);
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
            <TextField id="kd-co-city" label="Cidade" autoComplete="address-level2" value={city} error={errors.city} onChange={onField("city", setCity)} />
          )}
          {districtOptions.length > 0 ? (
            <SelectField id="kd-co-district" label="Bairro" value={district} error={errors.district} onChange={onField("district", setDistrict)}>
              <option value="">Selecione seu bairro</option>
              {!districtInList && district.trim() && <option value={district}>{district}</option>}
              {districtOptions.map((n) => (
                <option key={n.slug} value={n.name}>
                  {n.name}
                </option>
              ))}
            </SelectField>
          ) : (
            <TextField id="kd-co-district" label="Bairro" autoComplete="address-level3" value={district} error={errors.district} onChange={onField("district", setDistrict)} />
          )}
          <TextField label="Ponto de referência" optional placeholder="Próximo a…" value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} />
          {!fee.loading && !fee.matched && fee.reason && (
            <div className="kd-sheet-error" role="alert">
              <AlertCircle size={18} aria-hidden />
              <p>{fee.reason}</p>
            </div>
          )}
        </section>

        <section className="kd-checkout-section" aria-labelledby="kd-co-pay">
          <header className="kd-menu-section-head">
            <h2 id="kd-co-pay" className="kd-menu-section-title">
              Pagamento
            </h2>
            <p>Pago na entrega.</p>
          </header>
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
              hint="Deixe em branco se não precisar de troco."
              value={changeFor}
              error={errors.change}
              maxLength={12}
              onChange={onField("change", setChangeFor)}
            />
          )}
          <TextArea label="Observações do pedido" optional rows={2} maxLength={400} placeholder="Algo que o restaurante precise saber?" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </section>

        <section className="kd-checkout-section" aria-labelledby="kd-co-total">
          <header className="kd-menu-section-head">
            <h2 id="kd-co-total" className="kd-menu-section-title">
              Resumo
            </h2>
          </header>
          <OrderSummary subtotalCents={subtotal} feeCents={fee.matched ? fee.feeCents : null} feeLoading={fee.loading} count={count} />
          {formError && (
            <div className="kd-sheet-error" role="alert">
              <AlertCircle size={18} aria-hidden />
              <p>{formError}</p>
            </div>
          )}
        </section>
      </form>

      <div className="kd-menu-bar">
        <div className="kd-menu-bar-actions">
          <Button
            type="submit"
            form="kd-checkout"
            variant="signal"
            size="lg"
            loading={submitting}
            disabled={busy || !fee.matched || lines.length === 0}
            icon={<Check size={19} aria-hidden />}
          >
            {submitting ? "Enviando pedido…" : fee.loading ? "Calculando frete…" : !fee.matched ? "Endereço não atendido" : `Confirmar pedido · ${brl(totalCents)}`}
          </Button>
        </div>
      </div>
    </>
  );
}
