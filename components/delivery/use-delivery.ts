"use client";

import { useEffect, useRef, useState } from "react";
import { brl } from "@/lib/format";
import { openStatus, type WeeklyHours } from "@/lib/restaurant-hours";
import type { FeeMode, ServedCity } from "@/lib/delivery/types";

/** Configuração pública do delivery (GET /api/delivery/menu). */
export type DeliveryMenuConfig = {
  deliveryFeeCents: number;
  deliveryEta: string;
  deliveryArea: string;
  minOrderCents: number;
  paymentMethods: string[];
  notes: string;
  feeMode: FeeMode;
  servedCities: ServedCity[];
};

/** A taxa só é conhecida antes do endereço na taxa fixa sem cidades cadastradas. */
export const flatFee = (config: DeliveryMenuConfig | null) =>
  config && (config.feeMode === "taxa_fixa" || !config.servedCities.length) ? config.deliveryFeeCents : null;

/** Mesmo critério do servidor (calculateDeliveryFee): sem cidades cadastradas, vale a taxa fixa em qualquer modo. */
export function feeLabel(config: DeliveryMenuConfig, long = false) {
  if (flatFee(config) === null) return long ? "Taxa de entrega por bairro" : "Taxa por bairro";
  if (config.deliveryFeeCents === 0) return "Entrega grátis";
  return `${long ? "Taxa de entrega" : "Taxa"}: ${brl(config.deliveryFeeCents)}`;
}

export function useDeliveryConfig(restaurantId: string) {
  const [config, setConfig] = useState<DeliveryMenuConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!restaurantId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/delivery/menu?restaurantId=${encodeURIComponent(restaurantId)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || "Delivery indisponível.");
        return data as DeliveryMenuConfig;
      })
      .then((data) => !cancelled && setConfig(data))
      .catch((err) => !cancelled && setError(err.message || "Delivery indisponível."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  return { config, loading, error };
}

export type FeeState = { feeCents: number | null; loading: boolean; matched: boolean; reason?: string };

/**
 * Frete para o endereço digitado (GET /api/delivery/fee), com espera de 500 ms entre as digitações.
 * Guarda a lista de bairros atendidos da cidade, que a API só devolve enquanto o bairro não é reconhecido.
 */
export function useDeliveryFee(restaurantId: string, config: DeliveryMenuConfig, city: string, district: string, uf: string) {
  const { feeMode, deliveryFeeCents: flatFeeCents, servedCities } = config;
  const [state, setState] = useState<FeeState>({ feeCents: flatFeeCents, loading: false, matched: true });
  const [neighborhoods, setNeighborhoods] = useState<{ city: string; list: { name: string; slug: string }[] }>({ city: "", list: [] });
  const lastQuery = useRef("");

  useEffect(() => {
    if (feeMode === "taxa_fixa" && !servedCities.length) {
      setState({ feeCents: flatFeeCents, loading: false, matched: true });
      return;
    }
    const q = `${city}|${district}|${uf}`;
    // Voltou ao último endereço calculado antes de a nova consulta sair: o resultado anterior continua valendo.
    if (q === lastQuery.current) {
      setState((s) => (s.loading ? { ...s, loading: false } : s));
      return;
    }
    if (!city) {
      lastQuery.current = q;
      setState({ feeCents: null, loading: false, matched: true });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ restaurantId, city, district, uf });
        const res = await fetch(`/api/delivery/fee?${params}`);
        const data = await res.json();
        if (cancelled) return;
        lastQuery.current = q;
        setState({ feeCents: data.matched ? data.feeCents : null, loading: false, matched: Boolean(data.matched), reason: data.reason });
        if (Array.isArray(data.servedNeighborhoods) && data.servedNeighborhoods.length) setNeighborhoods({ city: city.trim().toLowerCase(), list: data.servedNeighborhoods });
      } catch {
        if (!cancelled) setState({ feeCents: flatFeeCents, loading: false, matched: true });
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [restaurantId, feeMode, city, district, uf, flatFeeCents, servedCities]);

  const served = neighborhoods.city === city.trim().toLowerCase() ? neighborhoods.list : [];
  return { ...state, servedNeighborhoods: served };
}

/** Aberto/fechado pelo horário cadastrado (null quando não há horário), atualizado a cada minuto. */
export function useOpenStatus(hours?: WeeklyHours) {
  const [open, setOpen] = useState<boolean | null>(() => openStatus(hours));
  useEffect(() => {
    setOpen(openStatus(hours));
    const timer = setInterval(() => setOpen(openStatus(hours)), 60_000);
    return () => clearInterval(timer);
  }, [hours]);
  return open;
}
