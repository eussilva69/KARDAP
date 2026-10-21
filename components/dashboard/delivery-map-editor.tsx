"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { MapPin, Plus, Trash2 } from "lucide-react";
import { brl } from "@/lib/format";
import { resolveMapDeliveryFee } from "@/lib/delivery/map-areas";
import type { DeliveryMapConfig, GeoPoint } from "@/lib/delivery/types";
import { Button, Switch } from "@/components/ui";

const COLORS = ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#059669", "#0891b2"];
let loaderConfigured = false;
const id = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const money = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
const cents = (value: string) => Math.max(0, Math.round((Number(value.replace(",", ".")) || 0) * 100));

export function DeliveryMapEditor({ restaurantId, value, onChange }: { restaurantId: string; value: DeliveryMapConfig; onChange: (value: DeliveryMapConfig) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map>();
  const overlays = useRef<google.maps.MVCObject[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState("");
  const [testPoint, setTestPoint] = useState<GeoPoint | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (valueRef.current.storeLocation) return;
    let active = true;
    import("@/lib/auth").then(async ({ getFirebaseAuth }) => {
      const token = await getFirebaseAuth().currentUser?.getIdToken();
      if (!token) return;
      const response = await fetch(`/api/restaurants/${encodeURIComponent(restaurantId)}/delivery`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json().catch(() => ({}));
      if (active && response.ok && data.mapOrigin?.location && !valueRef.current.storeLocation) {
        onChange({ ...valueRef.current, storeLocation: data.mapOrigin.location, storePlaceId: data.mapOrigin.placeId });
      }
    }).catch(() => undefined);
    return () => { active = false; };
  }, [restaurantId, onChange]);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) {
      setError("Configure NEXT_PUBLIC_GOOGLE_MAPS_API_KEY para exibir o mapa.");
      return;
    }
    if (!loaderConfigured) {
      setOptions({ key, v: "weekly", language: "pt-BR", region: "BR" });
      loaderConfigured = true;
    }
    let active = true;
    importLibrary("maps").then(({ Map }) => {
      if (!active || !host.current) return;
      const center = valueRef.current.storeLocation || { lat: -23.5505, lng: -46.6333 };
      mapRef.current = new Map(host.current, { center, zoom: valueRef.current.storeLocation ? 12 : 5, mapTypeControl: false, streetViewControl: false, fullscreenControl: true, gestureHandling: "cooperative" });
      setMapReady(true);
    }).catch(() => setError("Não foi possível carregar o Google Maps. Confira a chave e as restrições de domínio."));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    for (const overlay of overlays.current) overlay.set("map", null);
    overlays.current = [];
    const map = mapRef.current;
    const addMarker = (position: GeoPoint, label: string, drag: (point: GeoPoint) => void) => {
      const marker = new google.maps.Marker({ map, position, draggable: true, label: { text: label, color: "#111827", fontWeight: "700" } });
      marker.addListener("dragend", () => { const p = marker.getPosition(); if (p) drag({ lat: p.lat(), lng: p.lng() }); });
      overlays.current.push(marker);
    };
    if (value.storeLocation) {
      addMarker(value.storeLocation, "Loja", (storeLocation) => onChange({ ...valueRef.current, storeLocation }));
      value.distanceBands.filter((band) => band.enabled).forEach((band, index) => {
        const circle = new google.maps.Circle({ map, center: value.storeLocation!, radius: band.maxDistanceKm * 1000, editable: true, clickable: false, strokeColor: COLORS[index % COLORS.length], strokeOpacity: .8, strokeWeight: 2, fillColor: COLORS[index % COLORS.length], fillOpacity: .08, zIndex: 20 - index });
        circle.addListener("radius_changed", () => {
          const maxDistanceKm = Math.max(.1, Number((circle.getRadius() / 1000).toFixed(2)));
          onChange({ ...valueRef.current, distanceBands: valueRef.current.distanceBands.map((item) => item.id === band.id ? { ...item, maxDistanceKm } : item) });
        });
        overlays.current.push(circle);
      });
    }
    value.customAreas.filter((area) => area.enabled).forEach((area) => {
      const updateCenter = (center: GeoPoint) => onChange({ ...valueRef.current, customAreas: valueRef.current.customAreas.map((item) => item.id === area.id ? { ...item, center } : item) });
      addMarker(area.center, `${area.name} · ${brl(area.feeCents)}`, updateCenter);
      const circle = new google.maps.Circle({ map, center: area.center, radius: area.radiusKm * 1000, editable: true, draggable: true, strokeColor: area.color, strokeOpacity: .9, strokeWeight: 2, fillColor: area.color, fillOpacity: .16 });
      circle.addListener("center_changed", () => { const p = circle.getCenter(); if (p) updateCenter({ lat: p.lat(), lng: p.lng() }); });
      circle.addListener("radius_changed", () => onChange({ ...valueRef.current, customAreas: valueRef.current.customAreas.map((item) => item.id === area.id ? { ...item, radiusKm: Math.max(.1, Number((circle.getRadius() / 1000).toFixed(2))) } : item) }));
      overlays.current.push(circle);
    });
    if (testPoint) {
      addMarker(testPoint, "Teste", setTestPoint);
    }
  }, [mapReady, value, onChange, testPoint]);

  const preview = useMemo(() => testPoint ? resolveMapDeliveryFee(value, testPoint) : null, [testPoint, value]);
  const setBand = (bandId: string, patch: Record<string, unknown>) => onChange({ ...value, distanceBands: value.distanceBands.map((band) => band.id === bandId ? { ...band, ...patch } : band) });
  const setArea = (areaId: string, patch: Record<string, unknown>) => onChange({ ...value, customAreas: value.customAreas.map((area) => area.id === areaId ? { ...area, ...patch } : area) });

  return <div className="kd-map-editor">
    <div className="kd-map-toolbar">
      <div><b>Área no Google Maps</b><small>Arraste a loja, os marcadores e as bordas dos círculos.</small></div>
      <Button size="sm" variant="secondary" icon={<MapPin size={15} />} disabled={!mapReady} onClick={() => setTestPoint(mapRef.current?.getCenter()?.toJSON() || value.storeLocation)}>Testar ponto</Button>
    </div>
    {error && <p className="kd-map-error" role="alert">{error}</p>}
    <div ref={host} className="kd-map-canvas" aria-label="Mapa das áreas de entrega" />
    {!value.storeLocation && <div className="kd-map-origin">
      <p>Defina o ponto da loja para criar faixas por distância.</p>
      <Button size="sm" onClick={() => onChange({ ...value, storeLocation: mapRef.current?.getCenter()?.toJSON() || { lat: -23.5505, lng: -46.6333 } })}>Usar centro do mapa</Button>
    </div>}
    {preview && <p className={`kd-map-preview ${preview.matched ? "is-ok" : "is-out"}`}><b>Prévia:</b> {preview.matched ? `${preview.mapAreaName} · ${brl(preview.feeCents)}${preview.distanceKm != null ? ` · ${preview.distanceKm.toFixed(2)} km` : ""}` : preview.reason}</p>}

    <section className="kd-map-section">
      <header><div><b>Faixas concêntricas</b><small>Cada limite começa onde o anterior termina; a taxa nunca é somada.</small></div><Button size="sm" variant="secondary" icon={<Plus size={14} />} disabled={!value.storeLocation} onClick={() => { const previous = Math.max(0, ...value.distanceBands.map((b) => b.maxDistanceKm)); onChange({ ...value, distanceBands: [...value.distanceBands, { id: id("band"), name: `Até ${previous + 5} km`, maxDistanceKm: previous + 5, feeCents: 0, enabled: true }] }); }}>Adicionar faixa</Button></header>
      {value.distanceBands.map((band, index) => <div className="kd-map-row" key={band.id}>
        <Switch checked={band.enabled} onChange={(enabled) => setBand(band.id, { enabled })} label={`Faixa ${index + 1}`} />
        <label>Nome<input className="kd-input" value={band.name} onChange={(e) => setBand(band.id, { name: e.target.value })} /></label>
        <label>Até (km)<input className="kd-input" type="number" min="0.1" step="0.1" value={band.maxDistanceKm} onChange={(e) => setBand(band.id, { maxDistanceKm: Math.max(.1, Number(e.target.value)) })} /></label>
        <label>Taxa (R$)<input className="kd-input" inputMode="decimal" value={money(band.feeCents)} onChange={(e) => setBand(band.id, { feeCents: cents(e.target.value) })} /></label>
        <button className="kd-icon-btn" aria-label={`Excluir ${band.name}`} onClick={() => onChange({ ...value, distanceBands: value.distanceBands.filter((item) => item.id !== band.id) })}><Trash2 size={16} /></button>
      </div>)}
    </section>

    <section className="kd-map-section">
      <header><div><b>Áreas independentes</b><small>Se houver sobreposição, vence automaticamente a menor taxa válida.</small></div><Button size="sm" variant="secondary" icon={<Plus size={14} />} disabled={!value.storeLocation} onClick={() => { const center = mapRef.current?.getCenter()?.toJSON() || value.storeLocation!; onChange({ ...value, customAreas: [...value.customAreas, { id: id("area"), name: `Área ${value.customAreas.length + 1}`, center, radiusKm: 2, feeCents: 0, enabled: true, color: COLORS[value.customAreas.length % COLORS.length] }] }); }}>Adicionar área</Button></header>
      {value.customAreas.map((area) => <div className="kd-map-row" key={area.id}>
        <Switch checked={area.enabled} onChange={(enabled) => setArea(area.id, { enabled })} label="Ativa" />
        <label>Nome<input className="kd-input" value={area.name} onChange={(e) => setArea(area.id, { name: e.target.value })} /></label>
        <label>Raio (km)<input className="kd-input" type="number" min="0.1" step="0.1" value={area.radiusKm} onChange={(e) => setArea(area.id, { radiusKm: Math.max(.1, Number(e.target.value)) })} /></label>
        <label>Taxa (R$)<input className="kd-input" inputMode="decimal" value={money(area.feeCents)} onChange={(e) => setArea(area.id, { feeCents: cents(e.target.value) })} /></label>
        <input type="color" value={area.color} aria-label={`Cor de ${area.name}`} onChange={(e) => setArea(area.id, { color: e.target.value })} />
        <button className="kd-icon-btn" aria-label={`Excluir ${area.name}`} onClick={() => onChange({ ...value, customAreas: value.customAreas.filter((item) => item.id !== area.id) })}><Trash2 size={16} /></button>
      </div>)}
    </section>
  </div>;
}
