"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { MapPin, Plus, Trash2 } from "lucide-react";
import { brl, centsToInput, parseMoneyCents } from "@/lib/format";
import { resolveMapDeliveryFee } from "@/lib/delivery/map-areas";
import type { DeliveryMapConfig, GeoPoint } from "@/lib/delivery/types";
import { Autocomplete, Button, IconButton, Switch, newSessionToken } from "@/components/ui";

const COLORS = ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#059669", "#0891b2"];
let loaderConfigured = false;
const id = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const money = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
const cents = (value: string) => Math.max(0, Math.round((Number(value.replace(",", ".")) || 0) * 100));
type AddressSuggestion = { placeId: string; main: string; secondary: string };

/** Taxa: vazio vale R$ 0,00 (grátis); texto que não é valor é recusado. */
const parseFee = (text: string) => {
  const cents = parseMoneyCents(text);
  return cents === null ? 0 : Number.isNaN(cents) ? null : cents;
};
const formatKm = (km: number) => String(km).replace(".", ",");
/** Distância em km com vírgula ou ponto; mínimo de 100 m. */
const parseKm = (text: string) => {
  const km = Number(text.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(km) && km >= 0.1 ? Number(km.toFixed(2)) : null;
};

/**
 * Campo numérico que só grava ao sair (Tab, Enter ou toque fora). Formatar a cada tecla impedia digitar:
 * "7" virava "7,00" e apagar o campo voltava para o mínimo. Valor inválido volta ao último válido.
 */
function CommitInput({
  value,
  format,
  parse,
  onCommit,
  ...input
}: { value: number; format: (value: number) => string; parse: (text: string) => number | null; onCommit: (value: number) => void } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
>) {
  const [text, setText] = useState(() => format(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(format(value));
  }, [value, format]);
  const commit = () => {
    focused.current = false;
    const next = parse(text);
    if (next === null) {
      setText(format(value));
      return;
    }
    if (next !== value) onCommit(next);
    setText(format(next));
  };
  return (
    <input
      {...input}
      className="kd-input"
      value={text}
      onFocus={() => (focused.current = true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        e.currentTarget.blur();
      }}
    />
  );
}

export function DeliveryMapEditor({ value, onChange }: { value: DeliveryMapConfig; onChange: (value: DeliveryMapConfig) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map>();
  const overlays = useRef<google.maps.MVCObject[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState("");
  const [testPoint, setTestPoint] = useState<GeoPoint | null>(null);
  const [originBusy, setOriginBusy] = useState(false);
  const sessionRef = useRef(newSessionToken());
  const valueRef = useRef(value);
  valueRef.current = value;

  const authenticatedGet = async (params: URLSearchParams) => {
    const { getFirebaseAuth } = await import("@/lib/auth");
    const token = await getFirebaseAuth().currentUser?.getIdToken();
    if (!token) throw new Error("Sua sessão expirou. Entre novamente.");
    const response = await fetch(`/api/restaurants/${encodeURIComponent(restaurantId)}/delivery?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Não foi possível buscar o endereço.");
    return data;
  };

  const searchOrigin = async (query: string, signal: AbortSignal): Promise<AddressSuggestion[]> => {
    const params = new URLSearchParams({ originQuery: query, session: sessionRef.current });
    const { getFirebaseAuth } = await import("@/lib/auth");
    const token = await getFirebaseAuth().currentUser?.getIdToken();
    if (!token) return [];
    const response = await fetch(`/api/restaurants/${encodeURIComponent(restaurantId)}/delivery?${params}`, { signal, headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Não foi possível buscar o endereço.");
    return data.suggestions || [];
  };

  const chooseOrigin = async (item: AddressSuggestion) => {
    setOriginBusy(true);
    try {
      const session = sessionRef.current;
      sessionRef.current = newSessionToken();
      const data = await authenticatedGet(new URLSearchParams({ originPlaceId: item.placeId, session }));
      if (!data.address?.location) throw new Error("O Google não retornou a coordenada deste endereço.");
      onChange({ ...valueRef.current, storeLocation: data.address.location, storePlaceId: item.placeId });
      mapRef.current?.panTo(data.address.location);
      mapRef.current?.setZoom(15);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível usar este endereço.");
    } finally {
      setOriginBusy(false);
    }
  };

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) {
      setError("O mapa não está disponível nesta conta no momento. As faixas e áreas abaixo continuam editáveis.");
      return;
    }
    if (!loaderConfigured) {
      setOptions({ key, v: "weekly", language: "pt-BR", region: "BR" });
      loaderConfigured = true;
    }
    let active = true;
    (window as Window & { gm_authFailure?: () => void }).gm_authFailure = () => {
      if (active) setError("O Google rejeitou a chave do mapa. Use uma chave web separada, com Maps JavaScript API ativa e restrição HTTP para este domínio.");
    };
    importLibrary("maps").then(({ Map }) => {
      if (!active || !host.current) return;
      const center = valueRef.current.storeLocation || { lat: -23.5505, lng: -46.6333 };
      mapRef.current = new Map(host.current, { center, zoom: valueRef.current.storeLocation ? 12 : 5, mapTypeControl: false, streetViewControl: false, fullscreenControl: true, gestureHandling: "cooperative" });
      setMapReady(true);
    }).catch(() => setError("Não foi possível carregar o Google Maps agora. Atualize a página; as faixas e áreas abaixo continuam editáveis."));
    return () => { active = false; delete (window as Window & { gm_authFailure?: () => void }).gm_authFailure; };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    for (const overlay of overlays.current) overlay.set("map", null);
    overlays.current = [];
    const map = mapRef.current;
    const addMarker = (position: GeoPoint, label: string, drag: (point: GeoPoint) => void) => {
      const marker = new google.maps.Marker({ map, position, draggable: true, label: { text: label, color: "#111827", fontWeight: "700" } });
      marker.addListener("dragend", () => {
        const p = marker.getPosition();
        if (p) drag({ lat: p.lat(), lng: p.lng() });
      });
      overlays.current.push(marker);
    };
    if (value.storeLocation) {
      addMarker(value.storeLocation, "Loja", (storeLocation) => onChange({ ...valueRef.current, storeLocation }));
      value.distanceBands.filter((band) => band.enabled).forEach((band, index) => {
        const circle = new google.maps.Circle({ map, center: value.storeLocation!, radius: band.maxDistanceKm * 1000, editable: true, clickable: false, strokeColor: COLORS[index % COLORS.length], strokeOpacity: 0.8, strokeWeight: 2, fillColor: COLORS[index % COLORS.length], fillOpacity: 0.08, zIndex: 20 - index });
        circle.addListener("radius_changed", () => {
          const maxDistanceKm = Math.max(0.1, Number((circle.getRadius() / 1000).toFixed(2)));
          onChange({ ...valueRef.current, distanceBands: valueRef.current.distanceBands.map((item) => (item.id === band.id ? { ...item, maxDistanceKm } : item)) });
        });
        overlays.current.push(circle);
      });
    }
    value.customAreas.filter((area) => area.enabled).forEach((area) => {
      const updateCenter = (center: GeoPoint) => onChange({ ...valueRef.current, customAreas: valueRef.current.customAreas.map((item) => (item.id === area.id ? { ...item, center } : item)) });
      addMarker(area.center, `${area.name} · ${brl(area.feeCents)}`, updateCenter);
      const circle = new google.maps.Circle({ map, center: area.center, radius: area.radiusKm * 1000, editable: true, draggable: true, strokeColor: area.color, strokeOpacity: 0.9, strokeWeight: 2, fillColor: area.color, fillOpacity: 0.16 });
      circle.addListener("center_changed", () => {
        const p = circle.getCenter();
        if (p) updateCenter({ lat: p.lat(), lng: p.lng() });
      });
      circle.addListener("radius_changed", () => onChange({ ...valueRef.current, customAreas: valueRef.current.customAreas.map((item) => (item.id === area.id ? { ...item, radiusKm: Math.max(0.1, Number((circle.getRadius() / 1000).toFixed(2))) } : item)) }));
      overlays.current.push(circle);
    });
    if (testPoint) addMarker(testPoint, "Teste", setTestPoint);
  }, [mapReady, value, onChange, testPoint]);

  const preview = useMemo(() => (testPoint ? resolveMapDeliveryFee(value, testPoint) : null), [testPoint, value]);
  const setBand = (bandId: string, patch: Record<string, unknown>) => onChange({ ...value, distanceBands: value.distanceBands.map((band) => (band.id === bandId ? { ...band, ...patch } : band)) });
  const setArea = (areaId: string, patch: Record<string, unknown>) => onChange({ ...value, customAreas: value.customAreas.map((area) => (area.id === areaId ? { ...area, ...patch } : area)) });

  const addBand = () => {
    const previous = Math.max(0, ...value.distanceBands.map((b) => b.maxDistanceKm));
    onChange({ ...value, distanceBands: [...value.distanceBands, { id: id(“band”), name: `Até ${previous + 5} km`, maxDistanceKm: previous + 5, feeCents: 0, enabled: true }] });
  };
  const addArea = () => {
    const center = mapRef.current?.getCenter()?.toJSON() || value.storeLocation!;
    onChange({ ...value, customAreas: [...value.customAreas, { id: id(“area”), name: `Área ${value.customAreas.length + 1}`, center, radiusKm: 2, feeCents: 0, enabled: true, color: COLORS[value.customAreas.length % COLORS.length] }] });
  };

  return (
    <div className=”kd-map-editor”>
      <Autocomplete<AddressSuggestion>
        label=”Endereço da loja”
        placeholder=”Digite rua, número, cidade e estado”
        icon={<MapPin size={17} />}
        minChars={3}
        fetchItems={searchOrigin}
        itemKey={(item) => item.placeId}
        renderItem={(item) => <span className=”kd-ac-item”><b>{item.main}</b>{item.secondary && <small>{item.secondary}</small>}</span>}
        onSelect={chooseOrigin}
        busy={originBusy}
        emptyText=”Nenhum endereço encontrado.”
        hint=”Selecione o endereço oficial; depois você poderá ajustar o marcador no mapa.”
      />
      <div className=”kd-map-toolbar”>
        <div>
          <b>Área no Google Maps</b>
          <small>Arraste a loja, os marcadores e as bordas dos círculos. Use “Testar ponto” para ver a taxa de um endereço.</small>
        </div>
        <Button size=”sm” variant=”secondary” icon={<MapPin size={15} aria-hidden />} disabled={!mapReady} onClick={() => setTestPoint(mapRef.current?.getCenter()?.toJSON() || value.storeLocation)}>
          Testar ponto
        </Button>
      </div>
      {error && (
        <p className=”kd-map-error” role=”alert”>
          {error}
        </p>
      )}
      <div ref={host} className=”kd-map-canvas” aria-label=”Mapa das áreas de entrega” />
      {!value.storeLocation && (
        <div className=”kd-map-origin”>
          <p>Defina o ponto da loja para criar faixas por distância.</p>
          <Button size=”sm” onClick={() => onChange({ ...value, storeLocation: mapRef.current?.getCenter()?.toJSON() || { lat: -23.5505, lng: -46.6333 } })}>
            Usar centro do mapa
          </Button>
        </div>
      )}
      {preview && (
        <p className={`kd-map-preview ${preview.matched ? “is-ok” : “is-out”}`} role=”status”>
          <b>Ponto de teste:</b> {preview.matched ? `${preview.mapAreaName} · ${brl(preview.feeCents)}${preview.distanceKm != null ? ` · ${preview.distanceKm.toFixed(2).replace(“.”, “,”)} km` : “”}` : preview.reason}
        </p>
      )}

      <section className=”kd-map-section”>
        <header>
          <div>
            <b>Faixas por distância da loja</b>
            <small>Cada faixa começa onde a anterior termina; as taxas não se somam.</small>
          </div>
          <Button size=”sm” variant=”secondary” icon={<Plus size={14} aria-hidden />} disabled={!value.storeLocation} onClick={addBand}>
            Adicionar faixa
          </Button>
        </header>
        {value.distanceBands.length === 0 && <p className=”kd-map-empty”>Nenhuma faixa. Exemplo: até 3 km por R$ 5,00 e até 6 km por R$ 8,00.</p>}
        {value.distanceBands.map((band, index) => (
          <div className=”kd-map-row” key={band.id}>
            <Switch checked={band.enabled} onChange={(enabled) => setBand(band.id, { enabled })} label={`Faixa ${index + 1}`} />
            <label>
              Nome
              <input className=”kd-input” value={band.name} maxLength={60} onChange={(e) => setBand(band.id, { name: e.target.value })} />
            </label>
            <label>
              Até (km)
              <CommitInput inputMode=”decimal” value={band.maxDistanceKm} format={formatKm} parse={parseKm} onCommit={(maxDistanceKm) => setBand(band.id, { maxDistanceKm })} />
            </label>
            <label>
              Taxa (R$)
              <CommitInput inputMode=”decimal” placeholder=”0,00” value={band.feeCents} format={centsToInput} parse={parseFee} onCommit={(feeCents) => setBand(band.id, { feeCents })} />
            </label>
            <IconButton label={`Excluir ${band.name}`} tone=”danger” onClick={() => onChange({ ...value, distanceBands: value.distanceBands.filter((item) => item.id !== band.id) })}>
              <Trash2 size={16} />
            </IconButton>
          </div>
        ))}
      </section>

      <section className=”kd-map-section”>
        <header>
          <div>
            <b>Áreas independentes</b>
            <small>Círculos com centro próprio. Se dois se sobrepõem, vale a menor taxa.</small>
          </div>
          <Button size=”sm” variant=”secondary” icon={<Plus size={14} aria-hidden />} disabled={!value.storeLocation} onClick={addArea}>
            Adicionar área
          </Button>
        </header>
        {value.customAreas.map((area) => (
          <div className=”kd-map-row” key={area.id}>
            <Switch checked={area.enabled} onChange={(enabled) => setArea(area.id, { enabled })} label=”Ativa” />
            <label>
              Nome
              <input className=”kd-input” value={area.name} maxLength={60} onChange={(e) => setArea(area.id, { name: e.target.value })} />
            </label>
            <label>
              Raio (km)
              <CommitInput inputMode=”decimal” value={area.radiusKm} format={formatKm} parse={parseKm} onCommit={(radiusKm) => setArea(area.id, { radiusKm })} />
            </label>
            <label>
              Taxa (R$)
              <CommitInput inputMode=”decimal” placeholder=”0,00” value={area.feeCents} format={centsToInput} parse={parseFee} onCommit={(feeCents) => setArea(area.id, { feeCents })} />
            </label>
            <input type=”color” value={area.color} aria-label={`Cor de ${area.name}`} onChange={(e) => setArea(area.id, { color: e.target.value })} />
            <IconButton label={`Excluir ${area.name}`} tone=”danger” onClick={() => onChange({ ...value, customAreas: value.customAreas.filter((item) => item.id !== area.id) })}>
              <Trash2 size={16} />
            </IconButton>
          </div>
        ))}
      </section>
    </div>
  );
}
