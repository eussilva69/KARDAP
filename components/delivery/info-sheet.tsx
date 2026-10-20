"use client";

import { useId, useMemo, useRef } from "react";
import { Bike, Clock, MapPin, ShoppingBag, X } from "lucide-react";
import { brl } from "@/lib/format";
import { useDialog } from "@/lib/hooks";
import { hasHours, RESTAURANT_TIME_ZONE, WEEKDAYS, type WeeklyHours } from "@/lib/restaurant-hours";
import { feeLabel, type DeliveryMenuConfig } from "./use-delivery";

function formatRange(day?: { open: boolean; from: string; to: string }) {
  return day?.open && day.from && day.to ? `${day.from} às ${day.to}` : "Fechado";
}

export function InfoSheet({
  name,
  hours,
  open,
  config,
  onClose,
}: {
  name: string;
  hours?: WeeklyHours;
  open: boolean | null;
  config: DeliveryMenuConfig | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialog(ref, onClose);
  const today = useMemo(() => {
    const day = new Intl.DateTimeFormat("en-US", { timeZone: RESTAURANT_TIME_ZONE, weekday: "short" }).format(new Date());
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(day);
  }, []);

  return (
    <div className="kd-sheet-layer">
      <div className="kd-sheet-backdrop" onClick={onClose} aria-hidden />
      <div ref={ref} className="kd-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="kd-sheet-head">
          <div>
            <p className="kd-overline">{open === null ? "Delivery" : open ? "Aberto agora" : "Fechado agora"}</p>
            <h2 id={titleId} className="kd-h2">
              {name || "Informações"}
            </h2>
          </div>
          <button type="button" className="kd-icon-btn" onClick={onClose} aria-label="Fechar">
            <X size={20} />
          </button>
        </header>
        <div className="kd-sheet-body">
          {config && (
            <section className="kd-field">
              <h3 className="kd-label">Entrega</h3>
              <ul className="kd-info-list">
                {config.deliveryEta && (
                  <li>
                    <Clock size={16} aria-hidden />
                    <span>Tempo estimado: {config.deliveryEta}</span>
                  </li>
                )}
                <li>
                  <Bike size={16} aria-hidden />
                  <span>{feeLabel(config, true)}</span>
                </li>
                {config.deliveryArea && (
                  <li>
                    <MapPin size={16} aria-hidden />
                    <span>Área: {config.deliveryArea}</span>
                  </li>
                )}
                {config.minOrderCents > 0 && (
                  <li>
                    <ShoppingBag size={16} aria-hidden />
                    <span>Pedido mínimo: {brl(config.minOrderCents)}</span>
                  </li>
                )}
              </ul>
              {config.notes && <p className="kd-muted">{config.notes}</p>}
            </section>
          )}
          <section className="kd-field">
            <h3 className="kd-label">Horário de funcionamento</h3>
            {hasHours(hours) ? (
              <ul className="kd-hours">
                {WEEKDAYS.map((label, day) => (
                  <li key={label} className={day === today ? "is-today" : ""}>
                    <span>{label}</span>
                    <span>{formatRange(hours?.[String(day)])}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="kd-muted">Horários não informados pelo estabelecimento.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
