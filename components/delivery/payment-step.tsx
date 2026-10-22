"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Clock, Copy, CreditCard, ExternalLink, LoaderCircle, QrCode } from "lucide-react";
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

const orderLabel = (orderNumber: number) => `#${String(orderNumber).padStart(3, "0")}`;

const formatTime = (ms: number) => {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/**
 * Tela de pagamento online mostrada depois que o checkout é preparado. O pedido só chega ao restaurante com o
 * pagamento aprovado; até lá a pessoa pode voltar e escolher outra forma de pagar (`onChangePayment`).
 */
export function PaymentStep({
  payment,
  orderId,
  restaurantId,
  orderNumber,
  restaurantName,
  totalCents,
  onPaid,
  onChangePayment,
}: {
  payment: OnlinePaymentData;
  orderId: string;
  restaurantId: string;
  orderNumber: number;
  restaurantName: string;
  totalCents: number;
  onPaid: () => void;
  onChangePayment: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [expired, setExpired] = useState(false);
  const [pollError, setPollError] = useState(false);
  const [cardError, setCardError] = useState("");
  const [cardPending, setCardPending] = useState(payment.type === "card");
  const [cardBusy, setCardBusy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const codeRef = useRef<HTMLTextAreaElement>(null);
  const paid = useRef(false);
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;
  const markPaid = () => {
    if (paid.current) return;
    paid.current = true;
    onPaidRef.current();
  };

  // Pix expira em 30 min: contagem regressiva.
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

  // Situação do pagamento a cada 5 s. Continua depois do Pix expirar: um pagamento feito no último minuto ainda é
  // confirmado aqui. Com a aba em segundo plano não consulta; ao voltar, consulta na hora.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/delivery/orders/${encodeURIComponent(orderId)}/status?restaurantId=${encodeURIComponent(restaurantId)}`);
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { paymentStatus?: string; status?: string };
        if (cancelled) return;
        if (data.paymentStatus === "pago" || data.status === "confirmado" || data.status === "em_preparo") markPaid();
        setPollError(false);
      } catch {
        if (!cancelled) setPollError(true);
      }
    };
    check();
    const id = setInterval(check, 5000);
    const onVisible = () => !document.hidden && check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, restaurantId]);

  const copyCode = async () => {
    if (payment.type !== "pix") return;
    try {
      await navigator.clipboard.writeText(payment.qrCode);
      setCopied(true);
      setCopyFailed(false);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Navegadores dentro de apps (Instagram, Facebook) costumam bloquear a área de transferência: seleciona o código.
      setCopyFailed(true);
      codeRef.current?.focus();
      codeRef.current?.select();
    }
  };

  const head = (icon: React.ReactNode, title: string, text?: React.ReactNode, tone?: "warn") => (
    <header className="kd-track-head">
      <span className={`kd-sheet-done-icon ${tone === "warn" ? "is-cancelled" : "is-neutral"}`} aria-hidden>
        {icon}
      </span>
      <h1>{title}</h1>
      <p>
        Pedido <b className="kd-num">{orderLabel(orderNumber)}</b> · {restaurantName}
      </p>
      <p className="kd-num kd-payment-total">{brl(totalCents)}</p>
      {text && <p className="kd-payment-note">{text}</p>}
    </header>
  );

  /** Trocar a forma de pagar. Com Pix ou cartão em análise, confirma antes: um pagamento já feito ainda pode ser aprovado. */
  const changeAction = (guarded: boolean, disabled = false) =>
    confirmLeave ? (
      <div className="kd-pay-leave" role="alert">
        <p>Se você já pagou, não troque: a confirmação aparece nesta tela em instantes. Trocar agora pode gerar uma segunda cobrança.</p>
        <div>
          <Button variant="secondary" onClick={() => setConfirmLeave(false)} data-autofocus>
            Continuar aqui
          </Button>
          <Button variant="ghost" className="is-destructive" onClick={onChangePayment}>
            Trocar mesmo assim
          </Button>
        </div>
      </div>
    ) : (
      <Button variant="ghost" block disabled={disabled} onClick={() => (guarded ? setConfirmLeave(true) : onChangePayment())}>
        Escolher outra forma de pagamento
      </Button>
    );

  const waiting = (label: string) => (
    <div className="kd-pix-waiting" role="status">
      <LoaderCircle className="k-spin" size={18} aria-hidden />
      <span>{label}</span>
    </div>
  );

  const connection = pollError && (
    <div className="kd-sheet-error" role="alert">
      <AlertCircle size={16} aria-hidden />
      <p>Sem conexão para verificar o pagamento. Mantenha esta tela aberta: a verificação continua sozinha.</p>
    </div>
  );

  if (payment.type === "card_setup" || payment.type === "card") {
    if (!mercadoPagoPublicKey && !cardPending) {
      return (
        <div className="kd-payment-step">
          {head(<CreditCard size={28} strokeWidth={2.2} />, "Cartão indisponível no momento", "O pagamento com cartão online não está disponível agora. Escolha outra forma de pagamento.", "warn")}
          <div className="kd-track-actions">
            <Button variant="signal" size="lg" block onClick={onChangePayment}>
              Escolher outra forma de pagamento
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="kd-payment-step">
        {head(<CreditCard size={28} strokeWidth={2.2} />, cardPending ? "Pagamento em análise" : "Pague com cartão para enviar o pedido", cardPending ? "O Mercado Pago está analisando o pagamento. Você não precisa fazer nada: esta tela atualiza sozinha." : "O restaurante recebe o pedido assim que o pagamento for aprovado.")}
        {cardError && (
          <div className="kd-sheet-error" role="alert">
            <AlertCircle size={18} aria-hidden />
            <p>{cardError}</p>
          </div>
        )}
        {cardPending ? (
          waiting("Aguardando a aprovação do pagamento…")
        ) : (
          <div className="kd-card-brick">
            <CardPayment
              initialization={{ amount: totalCents / 100 }}
              customization={{ paymentMethods: { minInstallments: 1, maxInstallments: 12 } }}
              onSubmit={async (card) => {
                setCardError("");
                setCardBusy(true);
                try {
                  const res = await fetch("/api/delivery/payment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restaurantId, orderId, paymentMethod: "cartao_online", card }) });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) throw new Error(data.message || "Não foi possível processar o cartão. Confira os dados e tente de novo.");
                  if (data.status === "approved") markPaid();
                  else if (data.status === "rejected") throw new Error("Pagamento recusado pelo emissor do cartão. Confira os dados ou use outro cartão.");
                  else setCardPending(true);
                } catch (error) {
                  setCardError((error as Error).message || "Não foi possível processar o cartão.");
                  // Devolve o erro ao formulário do Mercado Pago para ele liberar o botão de pagar de novo.
                  throw error;
                } finally {
                  setCardBusy(false);
                }
              }}
              onError={(error) => {
                console.error("[Mercado Pago Brick]", error);
                if ((error as { type?: string })?.type === "critical") setCardError("Não foi possível carregar o formulário do cartão. Atualize a página ou escolha outra forma de pagamento.");
              }}
            />
          </div>
        )}
        {connection}
        {changeAction(cardPending, cardBusy)}
      </div>
    );
  }

  if (payment.type === "checkout_pro") {
    return (
      <div className="kd-payment-step">
        {head(<ExternalLink size={28} strokeWidth={2.2} />, "Pagar com Mercado Pago", "Você vai para a página segura do Mercado Pago e volta para cá depois de pagar.")}
        <div className="kd-track-actions">
          <Button variant="signal" size="lg" block icon={<ExternalLink size={17} aria-hidden />} onClick={() => (window.location.href = payment.url)}>
            Ir para o pagamento
          </Button>
          {changeAction(false)}
        </div>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="kd-payment-step">
        {head(<Clock size={28} strokeWidth={2.2} />, "O tempo para pagar o Pix terminou", "Seus itens e dados continuam salvos. Se você pagou agora há pouco, aguarde: a confirmação aparece aqui.", "warn")}
        {waiting("Verificando um pagamento de última hora…")}
        <div className="kd-track-actions">
          <Button variant="signal" size="lg" block onClick={onChangePayment}>
            Gerar um novo pagamento
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="kd-payment-step">
      {head(<QrCode size={28} strokeWidth={2.2} />, "Pague o Pix para enviar o pedido", "O restaurante recebe o pedido assim que o pagamento for confirmado.")}

      <section className="kd-pix-card" aria-label="Pagamento por Pix">
        {payment.qrCodeBase64 && (
          <img src={`data:image/png;base64,${payment.qrCodeBase64}`} alt="QR code do Pix. Escaneie com o app do seu banco." className="kd-pix-qr" width={200} height={200} />
        )}
        <ol className="kd-pix-howto">
          <li>Copie o código abaixo.</li>
          <li>No app do banco, escolha Pix copia e cola.</li>
          <li>Cole, confira o valor e pague.</li>
        </ol>
        <Button
          variant={copied ? "secondary" : "signal"}
          size="lg"
          block
          icon={copied ? <Check size={17} aria-hidden /> : <Copy size={17} aria-hidden />}
          onClick={copyCode}
        >
          {copied ? "Código copiado" : "Copiar código Pix"}
        </Button>
        <label className="kd-pix-code">
          <span className={copyFailed ? "kd-pix-code-warn" : "kd-sr"}>
            {copyFailed ? "Não foi possível copiar automaticamente. O código está selecionado: copie pelo menu do celular." : "Código Pix copia e cola"}
          </span>
          <textarea ref={codeRef} readOnly rows={2} value={payment.qrCode} onFocus={(e) => e.currentTarget.select()} />
        </label>
        {timeLeft !== null && (
          <p className="kd-pix-timer kd-num" role="timer" aria-label={`O Pix expira em ${Math.ceil(timeLeft / 60000)} minutos`}>
            <Clock size={14} aria-hidden />
            Expira em {formatTime(timeLeft)}
          </p>
        )}
      </section>

      {waiting("Aguardando a confirmação do pagamento…")}
      {connection}
      {changeAction(true)}
    </div>
  );
}
