"use client";

import { useEffect, useState } from "react";
import { Bike, Check, ChefHat, Home, Package, Receipt, X } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/primitives";

const STEPS = [
  { status: "pendente", label: "Pedido recebido", icon: Receipt },
  { status: "confirmado", label: "Pedido confirmado", icon: Check },
  { status: "em_preparo", label: "Em preparação", icon: ChefHat },
  { status: "pronto", label: "Pedido pronto", icon: Package },
  { status: "saiu_para_entrega", label: "Saiu para entrega", icon: Bike },
  { status: "entregue", label: "Entregue", icon: Home },
] as const;

type TrackingData = {
  status: string;
  orderNumber: number;
  statusHistory: { status: string; at: string; by?: string }[];
  updatedAt: string;
};

/** Pedido enviado: acompanha o status consultando a API a cada 8 segundos. */
export function OrderTracking({
  orderId,
  orderNumber,
  restaurantId,
  restaurantName,
  onNewOrder,
  menuHref,
}: {
  orderId: string;
  orderNumber: number;
  restaurantId: string;
  restaurantName: string;
  onNewOrder: () => void;
  menuHref: string;
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
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [restaurantId, orderId]);

  const status = tracking?.status || "pendente";
  const cancelled = status === "cancelado" || status === "recusado";
  const delivered = status === "entregue";
  const current = Math.max(0, STEPS.findIndex((s) => s.status === status));
  const timeOf = (step: string) => {
    const entry = tracking?.statusHistory?.find((h) => h.status === step);
    if (!entry) return null;
    const date = new Date(entry.at);
    return Number.isNaN(date.getTime()) ? null : date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="kd-track">
      <header className="kd-track-head" role="status">
        <span className={`kd-sheet-done-icon ${cancelled ? "is-cancelled" : ""}`} aria-hidden>
          {cancelled ? <X size={30} strokeWidth={2.6} /> : <Check size={30} strokeWidth={2.6} />}
        </span>
        <h1>{delivered ? "Pedido entregue!" : cancelled ? (status === "recusado" ? "Pedido recusado" : "Pedido cancelado") : "Pedido enviado!"}</h1>
        <p>
          Pedido <b className="kd-num">#{String(orderNumber).padStart(3, "0")}</b> · {restaurantName}
        </p>
        {cancelled && <p className="kd-muted">{status === "recusado" ? "O restaurante não pôde aceitar seu pedido no momento." : "Este pedido foi cancelado."}</p>}
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

      {trackError && !tracking && <p className="kd-muted">Não foi possível carregar o acompanhamento. Atualize a página.</p>}

      <div className="kd-track-actions">
        <Button variant="signal" size="lg" block onClick={onNewOrder}>
          Fazer novo pedido
        </Button>
        <ButtonLink variant="secondary" size="lg" block href={menuHref}>
          Ver o cardápio
        </ButtonLink>
      </div>
    </div>
  );
}
