"use client";

import { useEffect, useRef, useState } from "react";
import { Bike, Check, ChefHat, Clock, Home, Package, Receipt, WifiOff, X } from "lucide-react";
import { Button } from "@/components/ui/primitives";

const STEPS = [
  { status: "pendente", label: "Pedido recebido", icon: Receipt },
  { status: "confirmado", label: "Pedido confirmado", icon: Check },
  { status: "em_preparo", label: "Em preparação", icon: ChefHat },
  { status: "pronto", label: "Pedido pronto", icon: Package },
  { status: "saiu_para_entrega", label: "Saiu para entrega", icon: Bike },
  { status: "entregue", label: "Entregue", icon: Home },
] as const;

const TERMINAL = new Set(["entregue", "cancelado", "recusado"]);

type TrackingData = {
  status: string;
  orderNumber: number;
  statusHistory: { status: string; at: string; by?: string }[];
  updatedAt: string;
  paymentStatus?: string;
  operationalReady?: boolean;
  payment?: { statusDetail?: string };
  cancelReason?: string;
};

const clock = (iso?: string) => {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};

/**
 * Pedido enviado: acompanha o status consultando a API a cada 8 segundos enquanto a aba está visível.
 * Para de consultar quando o pedido termina (entregue, cancelado ou recusado) e avisa `onSettled` uma vez.
 */
export function OrderTracking({
  orderId,
  orderNumber,
  restaurantId,
  restaurantName,
  onNewOrder,
  onSettled,
}: {
  orderId: string;
  orderNumber: number;
  restaurantId: string;
  restaurantName: string;
  onNewOrder: () => void;
  onSettled?: () => void;
}) {
  const [tracking, setTracking] = useState<TrackingData | null>(null);
  const [trackError, setTrackError] = useState(false);
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;

  const status = tracking?.status || "pendente";
  const finished = TERMINAL.has(status);

  useEffect(() => {
    if (!restaurantId || !orderId || finished) return;
    let cancelled = false;
    const poll = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/delivery/orders/${encodeURIComponent(orderId)}/status?restaurantId=${encodeURIComponent(restaurantId)}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!cancelled) {
          setTracking(data);
          setTrackError(false);
        }
      } catch {
        if (!cancelled) setTrackError(true);
      }
    };
    poll();
    const interval = setInterval(poll, 8000);
    const onVisible = () => !document.hidden && poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [restaurantId, orderId, finished]);

  useEffect(() => {
    if (finished) settledRef.current?.();
  }, [finished]);

  const cancelled = status === "cancelado" || status === "recusado";
  const delivered = status === "entregue";
  const current = Math.max(0, STEPS.findIndex((s) => s.status === status));
  const currentStep = STEPS[current];
  const timeOf = (step: string) => clock(tracking?.statusHistory?.find((h) => h.status === step)?.at);

  const title = cancelled
    ? status === "recusado"
      ? "Pedido recusado"
      : "Pedido cancelado"
    : delivered
      ? "Pedido entregue"
      : !tracking
        ? "Pedido enviado"
        : status === "pendente"
          ? "Aguardando o restaurante aceitar"
          : currentStep.label;
  const HeadIcon = cancelled ? X : !tracking || status === "pendente" ? Clock : currentStep.icon;
  const updated = clock(tracking?.updatedAt);

  return (
    <div className="kd-track">
      <header className="kd-track-head" role="status">
        <span key={status} className={`kd-sheet-done-icon ${cancelled ? "is-cancelled" : status === "pendente" ? "is-neutral" : ""}`} aria-hidden>
          <HeadIcon size={30} strokeWidth={2.4} />
        </span>
        <h1>{title}</h1>
        <p>
          Pedido <b className="kd-num">#{String(orderNumber).padStart(3, "0")}</b> · {restaurantName}
        </p>
        {cancelled && <p className="kd-muted">{tracking?.cancelReason || (status === "recusado" ? "O restaurante não pôde aceitar seu pedido no momento." : "Este pedido foi cancelado.")}</p>}
        {!cancelled && status === "pendente" && tracking && <p className="kd-muted">Assim que o restaurante aceitar, o andamento aparece aqui.</p>}
      </header>

      {!cancelled && (
        <ol className="kd-track-steps" aria-label="Andamento do pedido">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            const done = i <= current;
            const time = timeOf(step.status);
            return (
              <li key={step.status} className={`kd-track-step ${done ? "is-done" : ""} ${i === current && !delivered ? "is-active" : ""}`} aria-current={i === current ? "step" : undefined}>
                <span className="kd-track-dot" aria-hidden>
                  <Icon size={15} strokeWidth={2.4} />
                </span>
                <span className="kd-track-text">
                  <b>{step.label}</b>
                  {time && <small className="kd-num">{time}</small>}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {trackError && (
        <p className="kd-track-offline" role="status">
          <WifiOff size={15} aria-hidden />
          {tracking ? `Sem conexão. Mostrando a situação de ${updated || "antes"}; tentamos de novo sozinhos.` : "Não foi possível carregar o acompanhamento. Tentamos de novo em instantes."}
        </p>
      )}
      {!trackError && updated && !finished && <p className="kd-track-updated kd-num">Atualizado às {updated} · a tela atualiza sozinha</p>}

      <div className="kd-track-actions">
        {finished ? (
          <Button variant="signal" size="lg" block onClick={onNewOrder}>
            Fazer novo pedido
          </Button>
        ) : (
          <>
            <Button variant="secondary" size="lg" block onClick={onNewOrder}>
              Voltar ao cardápio
            </Button>
            <p className="kd-track-hint">Você continua acompanhando este pedido pelo botão no topo do cardápio.</p>
          </>
        )}
      </div>
    </div>
  );
}
