"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Clock, Copy, ExternalLink, LoaderCircle } from "lucide-react";
import { brl } from "@/lib/format";
import { Button } from "@/components/ui/primitives";
import { CardPayment, initMercadoPago } from "@mercadopago/sdk-react";

const mercadoPagoPublicKey = process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY || "";
if (mercadoPagoPublicKey) initMercadoPago(mercadoPagoPublicKey, { locale: "pt-BR" });

type PixPayment = {
  type: "pix";
  paymentId: string;
  qrCode: string;
  qrCodeBase64: string;
  expiresAt?: string;
};

type CheckoutProPayment = {
  type: "checkout_pro";
  url: string;
  preferenceId: string;
};

type CardSetupPayment = { type: "card_setup" };
type CardResultPayment = { type: "card"; paymentId: string; status: string; statusDetail?: string | null };

export type OnlinePaymentData = PixPayment | CheckoutProPayment | CardSetupPayment | CardResultPayment;

/** Tela de pagamento online mostrada após criação do pedido. */
export function PaymentStep({
  payment,
  orderId,
  restaurantId,
  orderNumber,
  restaurantName,
  totalCents,
  onPaid,
}: {
  payment: OnlinePaymentData;
  orderId: string;
  restaurantId: string;
  orderNumber: number;
  restaurantName: string;
  totalCents: number;
  onPaid: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [expired, setExpired] = useState(false);
  const [pollError, setPollError] = useState(false);
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  // PIX expira em 30 min; conta regressiva simples.
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  useEffect(() => {
    if (payment.type !== "pix" || !payment.expiresAt) return;
    const target = new Date(payment.expiresAt).getTime();
    const tick = () => {
      const left = Math.max(0, target - Date.now());
      setTimeLeft(left);
      if (left === 0) setExpired(true);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [payment]);

  // Polling do status do pedido a cada 5 s (até pago ou expirado).
  useEffect(() => {
    if (expired) return;
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch(`/api/delivery/orders/${encodeURIComponent(orderId)}/status?restaurantId=${encodeURIComponent(restaurantId)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { paymentStatus?: string; status?: string };
        if (cancelled) return;
        if (data.paymentStatus === "pago" || data.status === "confirmado" || data.status === "em_preparo") {
          onPaidRef.current();
        }
        setPollError(false);
      } catch {
        if (!cancelled) setPollError(true);
      }
    };
    check();
    const id = setInterval(check, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [orderId, restaurantId, expired]);

  const copyCode = async () => {
    if (payment.type !== "pix") return;
    try {
      await navigator.clipboard.writeText(payment.qrCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {}
  };

  const formatTime = (ms: number) => {
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  if (payment.type === "card_setup") {
    if (!mercadoPagoPublicKey) return <div className="kd-payment-step"><div className="kd-sheet-error" role="alert"><AlertCircle size={18} aria-hidden /><p>Pagamento por cartão indisponível: configure a chave pública do Mercado Pago.</p></div></div>;
    return (
      <div className="kd-payment-step">
        <header className="kd-track-head">
          <h1>Pagamento com cartão</h1>
          <p>Pedido <b className="kd-num">#{String(orderNumber).padStart(3, "0")}</b> · {restaurantName}</p>
          <p className="kd-num kd-payment-total">{brl(totalCents)}</p>
        </header>
        <CardPayment
          initialization={{ amount: totalCents / 100 }}
          customization={{ paymentMethods: { minInstallments: 1, maxInstallments: 12 } }}
          onSubmit={async (card) => {
            const res = await fetch("/api/delivery/payment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restaurantId, orderId, paymentMethod: "cartao_online", card }) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || "Não foi possível processar o cartão.");
            if (data.status === "approved") onPaidRef.current();
            else if (data.status === "rejected") throw new Error("Pagamento recusado. Confira os dados ou use outro cartão.");
          }}
          onError={(error) => console.error("[Mercado Pago Brick]", error)}
        />
      </div>
    );
  }

  if (payment.type === "card") {
    return <div className="kd-payment-step"><div className="kd-pix-waiting" role="status"><LoaderCircle className="k-spin" size={18} aria-hidden /><span>Aguardando confirmação do pagamento…</span></div></div>;
  }

  if (payment.type === "checkout_pro") {
    return (
      <div className="kd-payment-step">
        <header className="kd-track-head">
          <span className="kd-sheet-done-icon" aria-hidden>
            <ExternalLink size={28} strokeWidth={2.2} />
          </span>
          <h1>Pagar com Mercado Pago</h1>
          <p>
            Pedido <b className="kd-num">#{String(orderNumber).padStart(3, "0")}</b> · {restaurantName}
          </p>
          <p className="kd-num kd-payment-total">{brl(totalCents)}</p>
        </header>
        <p className="kd-muted" style={{ textAlign: "center", padding: "0 16px 8px" }}>
          Você será direcionado à página segura do Mercado Pago para pagar com cartão de crédito.
        </p>
        <div className="kd-track-actions">
          <Button
            variant="signal"
            size="lg"
            block
            icon={<ExternalLink size={17} aria-hidden />}
            onClick={() => { window.location.href = payment.url; }}
          >
            Ir para o pagamento
          </Button>
        </div>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="kd-payment-step">
        <header className="kd-track-head">
          <span className="kd-sheet-done-icon is-cancelled" aria-hidden>
            <Clock size={28} strokeWidth={2.2} />
          </span>
          <h1>PIX expirado</h1>
          <p>O tempo para pagamento encerrou. Faça um novo pedido para gerar um novo PIX.</p>
        </header>
        <div className="kd-track-actions">
          <Button variant="signal" size="lg" block onClick={onPaid}>
            Voltar ao cardápio
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="kd-payment-step">
      <header className="kd-track-head">
        <span className="kd-sheet-done-icon" aria-hidden>
          <Check size={28} strokeWidth={2.6} />
        </span>
        <h1>Pedido criado! Pague pelo Pix</h1>
        <p>
          Pedido <b className="kd-num">#{String(orderNumber).padStart(3, "0")}</b> · {restaurantName}
        </p>
        <p className="kd-num kd-payment-total">{brl(totalCents)}</p>
      </header>

      {payment.qrCodeBase64 && (
        <div className="kd-pix-qr-wrap" aria-label="QR code PIX">
          <img
            src={`data:image/png;base64,${payment.qrCodeBase64}`}
            alt="QR code para pagamento via PIX"
            className="kd-pix-qr"
            width={200}
            height={200}
          />
        </div>
      )}

      <div className="kd-pix-actions">
        <Button
          variant={copied ? "secondary" : "signal"}
          size="lg"
          block
          icon={copied ? <Check size={17} aria-hidden /> : <Copy size={17} aria-hidden />}
          onClick={copyCode}
        >
          {copied ? "Código copiado!" : "Copiar código Pix"}
        </Button>
      </div>

      {timeLeft !== null && (
        <p className="kd-pix-timer kd-num" role="timer" aria-live="polite">
          <Clock size={14} aria-hidden />
          Expira em {formatTime(timeLeft)}
        </p>
      )}

      <div className="kd-pix-waiting" role="status" aria-live="polite">
        <LoaderCircle className="k-spin" size={18} aria-hidden />
        <span>Aguardando confirmação do pagamento…</span>
      </div>

      {pollError && (
        <div className="kd-sheet-error" role="alert">
          <AlertCircle size={16} aria-hidden />
          <p>Sem conexão para verificar o pagamento. Mantenha a página aberta.</p>
        </div>
      )}
    </div>
  );
}
