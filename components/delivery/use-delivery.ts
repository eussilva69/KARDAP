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
  /** Só as cidades ativas (as pausadas não aparecem para o cliente). */
  servedCities: ServedCity[];
  /** Há cidades cadastradas (mesmo pausadas): o servidor valida a cidade do endereço. */
  hasServedCities?: boolean;
  /** Busca de endereço pelo Google disponível. */
  addressSearch?: boolean;
};

const hasCities = (config: DeliveryMenuConfig) => config.hasServedCities ?? config.servedCities.length > 0;

/** A taxa só é conhecida antes do endereço na taxa fixa ou quando não há cidades cadastradas. */
export const flatFee = (config: DeliveryMenuConfig | null) =>
  config && (config.feeMode === "taxa_fixa" || (config.feeMode !== "area_mapa" && !hasCities(config))) ? config.deliveryFeeCents : null;

/** Mesmo critério do servidor (calculateDeliveryFee): sem cidades cadastradas, vale a taxa fixa em qualquer modo. */
export function feeLabel(config: DeliveryMenuConfig, long = false) {
  if (config.feeMode === "area_mapa") return long ? "Taxa calculada pela localização" : "Taxa por distância";
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

export type FeeState = { feeCents: number | null; loading: boolean; matched: boolean; reason?: string; neighborhoodName?: string | null; usedDefaultFee?: boolean };

/**
 * Frete para o endereço digitado (GET /api/delivery/fee), com espera de 500 ms entre as digitações.
 * Guarda a lista de bairros atendidos da cidade, que a API só devolve enquanto o bairro não é reconhecido.
 * O valor aqui é só a prévia: o servidor recalcula a taxa ao criar o pedido.
 */
export function useDeliveryFee(restaurantId: string, config: DeliveryMenuConfig, city: string, district: string, uf: string, ibgeCode = "", address: { placeId?: string; street?: string; number?: string; cep?: string } = {}) {
  const { deliveryFeeCents: flatFeeCents } = config;
  const needsAddress = config.feeMode === "area_mapa" || hasCities(config);
  const [state, setState] = useState<FeeState>({ feeCents: flatFeeCents, loading: false, matched: true });
  const [neighborhoods, setNeighborhoods] = useState<{ city: string; list: { name: string; slug: string }[] }>({ city: "", list: [] });
  const lastQuery = useRef("");

  useEffect(() => {
    if (!needsAddress) {
      setState({ feeCents: flatFeeCents, loading: false, matched: true });
      return;
    }
    const q = `${city}|${district}|${uf}|${ibgeCode}|${address.placeId || ""}|${address.street || ""}|${address.number || ""}|${address.cep || ""}`;
    // Voltou ao último endereço calculado antes de a nova consulta sair: o resultado anterior continua valendo.
    if (q === lastQuery.current) {
      setState((s) => (s.loading ? { ...s, loading: false } : s));
      return;
    }
    if (!city || (config.feeMode === "area_mapa" && !address.placeId && (!address.street || !address.number))) {
      lastQuery.current = q;
      setState({ feeCents: null, loading: false, matched: true });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ restaurantId, city, district, uf, ibgeCode, placeId: address.placeId || "", street: address.street || "", number: address.number || "", cep: address.cep || "" });
        const res = await fetch(`/api/delivery/fee?${params}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.message);
        lastQuery.current = q;
        setState({
          feeCents: data.matched ? data.feeCents : null,
          loading: false,
          matched: Boolean(data.matched),
          reason: data.reason,
          neighborhoodName: data.neighborhoodName,
          usedDefaultFee: Boolean(data.usedDefaultFee),
        });
        if (Array.isArray(data.servedNeighborhoods) && data.servedNeighborhoods.length) setNeighborhoods({ city: city.trim().toLowerCase(), list: data.servedNeighborhoods });
      } catch (err) {
        if (!cancelled) setState({ feeCents: null, loading: false, matched: false, reason: (err as Error)?.message || "Não foi possível calcular a taxa de entrega agora. Tente de novo." });
      }
    }, config.feeMode === "area_mapa" ? 800 : 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [restaurantId, needsAddress, city, district, uf, ibgeCode, flatFeeCents, config.feeMode, address.placeId, address.street, address.number, address.cep]);

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
