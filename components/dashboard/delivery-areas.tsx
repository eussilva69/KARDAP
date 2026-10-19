"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, LoaderCircle, MapPin, Plus, Search, Trash2, X } from "lucide-react";
import { friendlyError } from "@/lib/async";
import { Badge, Button, Card, CardHead, TextField } from "@/components/ui";
import type { DeliveryConfig, FeeMode, NeighborhoodEntry, ServedCity } from "@/lib/delivery/types";
import { slugifyNeighborhood } from "@/lib/delivery/types";

type Notify = (message: string, tone?: "success" | "error") => void;

type CitySearchResult = { ibgeCode: string; name: string; uf: string };

async function getAuthHeaders(): Promise<HeadersInit> {
  const { getFirebaseAuth } = await import("@/lib/auth");
  const token = await getFirebaseAuth().currentUser?.getIdToken();
  if (!token) throw new Error("Sessão expirada.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function searchCities(q: string): Promise<CitySearchResult[]> {
  const res = await fetch(`/api/delivery/cities?q=${encodeURIComponent(q)}`);
  if (!res.ok) return [];
  return res.json();
}

async function fetchIbgeNeighborhoods(ibgeCode: string): Promise<string[]> {
  const res = await fetch(`/api/delivery/neighborhoods?ibgeCode=${encodeURIComponent(ibgeCode)}`);
  if (!res.ok) return [];
  const data: { name: string }[] = await res.json();
  return data.map((d) => d.name);
}

async function loadAreas(restaurantId: string, cityCode: string): Promise<Record<string, NeighborhoodEntry>> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/restaurants/${encodeURIComponent(restaurantId)}/delivery/areas?cityCode=${encodeURIComponent(cityCode)}`, { headers });
  if (!res.ok) return {};
  const data = await res.json();
  return data.neighborhoods || {};
}

async function saveAreas(restaurantId: string, cityCode: string, cityName: string, uf: string, neighborhoods: Record<string, NeighborhoodEntry>): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/restaurants/${encodeURIComponent(restaurantId)}/delivery/areas`, {
    method: "POST",
    headers,
    body: JSON.stringify({ cityCode, cityName, uf, neighborhoods }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "Erro ao salvar.");
  }
}

async function deleteCity(restaurantId: string, cityCode: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/restaurants/${encodeURIComponent(restaurantId)}/delivery/areas?cityCode=${encodeURIComponent(cityCode)}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "Erro ao remover.");
  }
}

function centsToStr(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function strToCents(str: string): number {
  const n = Number(str.replace(",", ".")) || 0;
  return Math.max(0, Math.round(n * 100));
}

export function DeliveryAreasManager({
  restaurantId,
  config,
  notify,
  onConfigUpdate,
}: {
  restaurantId: string;
  config: DeliveryConfig;
  notify: Notify;
  onConfigUpdate: (patch: Partial<DeliveryConfig>) => void;
}) {
  const feeMode: FeeMode = config.feeMode || "taxa_fixa";
  const servedCities: ServedCity[] = config.servedCities || [];

  const setFeeMode = async (mode: FeeMode) => {
    onConfigUpdate({ feeMode: mode });
  };

  return (
    <Card style={{ marginBottom: 16 }}>
      <CardHead title="Áreas de entrega e taxas" />
      <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 8 }}>Modalidade de cobrança</label>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => setFeeMode("taxa_fixa")}
              style={{
                flex: 1, padding: "10px 12px", borderRadius: 8,
                border: feeMode === "taxa_fixa" ? "2px solid var(--kd-accent)" : "1px solid var(--kd-border)",
                background: feeMode === "taxa_fixa" ? "var(--kd-accent-light, #fef9c3)" : "transparent",
                cursor: "pointer", fontSize: 13, fontWeight: feeMode === "taxa_fixa" ? 600 : 400, textAlign: "left",
              }}
            >
              <strong style={{ display: "block" }}>Taxa fixa</strong>
              <span style={{ color: "var(--kd-muted)", fontSize: 12 }}>Mesmo valor para todas as entregas</span>
            </button>
            <button
              type="button"
              onClick={() => setFeeMode("taxa_por_bairro")}
              style={{
                flex: 1, padding: "10px 12px", borderRadius: 8,
                border: feeMode === "taxa_por_bairro" ? "2px solid var(--kd-accent)" : "1px solid var(--kd-border)",
                background: feeMode === "taxa_por_bairro" ? "var(--kd-accent-light, #fef9c3)" : "transparent",
                cursor: "pointer", fontSize: 13, fontWeight: feeMode === "taxa_por_bairro" ? 600 : 400, textAlign: "left",
              }}
            >
              <strong style={{ display: "block" }}>Taxa por bairro</strong>
              <span style={{ color: "var(--kd-muted)", fontSize: 12 }}>Valor diferente para cada bairro</span>
            </button>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Badge tone="neutral">{servedCities.length} {servedCities.length === 1 ? "cidade" : "cidades"}</Badge>
          {feeMode === "taxa_fixa" && (
            <span style={{ fontSize: 12, color: "var(--kd-muted)" }}>
              Entregas validadas por cidade. Taxa definida acima.
            </span>
          )}
        </div>

        <CitySearchInput
          restaurantId={restaurantId}
          servedCities={servedCities}
          notify={notify}
          onCityAdded={(city) => {
            onConfigUpdate({ servedCities: [...servedCities, city] });
          }}
        />

        {servedCities.map((city) => (
          <CityPanel
            key={city.ibgeCode}
            restaurantId={restaurantId}
            city={city}
            feeMode={feeMode}
            notify={notify}
            onRemove={() => {
              onConfigUpdate({ servedCities: servedCities.filter((c) => c.ibgeCode !== city.ibgeCode) });
            }}
          />
        ))}

        {servedCities.length === 0 && (
          <p style={{ fontSize: 13, color: "var(--kd-muted)", textAlign: "center", padding: 16 }}>
            Nenhuma cidade cadastrada. Use o campo acima para adicionar cidades atendidas.
          </p>
        )}
      </div>
    </Card>
  );
}

function CitySearchInput({
  restaurantId,
  servedCities,
  notify,
  onCityAdded,
}: {
  restaurantId: string;
  servedCities: ServedCity[];
  notify: Notify;
  onCityAdded: (city: ServedCity) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CitySearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const data = await searchCities(query);
      setResults(data.filter((c) => !servedCities.some((s) => s.ibgeCode === c.ibgeCode)));
      setOpen(true);
      setLoading(false);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, servedCities]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectCity = (city: CitySearchResult) => {
    onCityAdded({ ibgeCode: city.ibgeCode, name: city.name, uf: city.uf });
    setQuery("");
    setOpen(false);
    notify(`${city.name} — ${city.uf} adicionada.`);
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--kd-muted)" }} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar cidade para adicionar..."
          style={{
            width: "100%", padding: "8px 12px 8px 32px", borderRadius: 6,
            border: "1px solid var(--kd-border)", background: "var(--kd-bg, #fff)",
            fontSize: 13, outline: "none",
          }}
        />
        {loading && <LoaderCircle size={14} className="kd-spin" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "var(--kd-muted)" }} />}
      </div>
      {open && results.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20,
          background: "var(--kd-bg, #fff)", border: "1px solid var(--kd-border)", borderRadius: 6,
          boxShadow: "0 4px 12px rgba(0,0,0,0.1)", maxHeight: 240, overflowY: "auto",
        }}>
          {results.map((c) => (
            <button
              key={c.ibgeCode}
              type="button"
              onClick={() => selectCity(c)}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                padding: "8px 12px", border: "none", background: "transparent",
                cursor: "pointer", fontSize: 13, textAlign: "left",
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "var(--kd-hover, #f5f5f3)"; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "transparent"; }}
            >
              <MapPin size={14} style={{ color: "var(--kd-muted)", flexShrink: 0 }} />
              <span>{c.name}</span>
              <Badge tone="neutral" style={{ marginLeft: "auto" }}>{c.uf}</Badge>
            </button>
          ))}
        </div>
      )}
      {open && results.length === 0 && query.length >= 2 && !loading && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20,
          background: "var(--kd-bg, #fff)", border: "1px solid var(--kd-border)", borderRadius: 6,
          padding: 12, fontSize: 13, color: "var(--kd-muted)",
        }}>
          Nenhuma cidade encontrada.
        </div>
      )}
    </div>
  );
}

function CityPanel({
  restaurantId,
  city,
  feeMode,
  notify,
  onRemove,
}: {
  restaurantId: string;
  city: ServedCity;
  feeMode: FeeMode;
  notify: Notify;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [neighborhoods, setNeighborhoods] = useState<Record<string, NeighborhoodEntry>>({});
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkFee, setBulkFee] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const [newName, setNewName] = useState("");
  const [filter, setFilter] = useState("");
  const [removing, setRemoving] = useState(false);

  const loadNeighborhoods = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadAreas(restaurantId, city.ibgeCode);
      setNeighborhoods(data);
      setLoaded(true);
    } catch (err) {
      notify(friendlyError(err, "Erro ao carregar bairros."), "error");
    } finally {
      setLoading(false);
    }
  }, [restaurantId, city.ibgeCode, notify]);

  useEffect(() => {
    if (expanded && !loaded) loadNeighborhoods();
  }, [expanded, loaded, loadNeighborhoods]);

  const importFromIbge = async () => {
    setLoading(true);
    try {
      const names = await fetchIbgeNeighborhoods(city.ibgeCode);
      if (!names.length) {
        notify("Nenhum bairro encontrado no IBGE para esta cidade.", "error");
        setLoading(false);
        return;
      }
      const updated = { ...neighborhoods };
      let added = 0;
      for (const name of names) {
        const slug = slugifyNeighborhood(name);
        if (!slug || updated[slug]) continue;
        updated[slug] = { name, feeCents: 0, enabled: true };
        added++;
      }
      setNeighborhoods(updated);
      notify(`${added} bairro(s) importado(s) do IBGE.`);
    } catch (err) {
      notify(friendlyError(err, "Erro ao importar."), "error");
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveAreas(restaurantId, city.ibgeCode, city.name, city.uf, neighborhoods);
      notify(`Bairros de ${city.name} salvos.`);
    } catch (err) {
      notify(friendlyError(err, "Erro ao salvar."), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await deleteCity(restaurantId, city.ibgeCode);
      onRemove();
      notify(`${city.name} removida.`);
    } catch (err) {
      notify(friendlyError(err, "Erro ao remover."), "error");
      setRemoving(false);
    }
  };

  const addManual = () => {
    const name = newName.trim();
    if (!name) return;
    const slug = slugifyNeighborhood(name);
    if (!slug) return;
    if (neighborhoods[slug]) {
      notify("Bairro já existe na lista.", "error");
      return;
    }
    setNeighborhoods((prev) => ({ ...prev, [slug]: { name, feeCents: 0, enabled: true } }));
    setNewName("");
  };

  const toggleSelect = (slug: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(Object.keys(sortedEntries.map(([k]) => k))));
    setSelected(new Set(sortedEntries.map(([k]) => k)));
  };
  const deselectAll = () => setSelected(new Set());

  const applyBulkFee = () => {
    const cents = strToCents(bulkFee);
    setNeighborhoods((prev) => {
      const next = { ...prev };
      for (const slug of selected) {
        if (next[slug]) next[slug] = { ...next[slug], feeCents: cents };
      }
      return next;
    });
    setShowBulk(false);
    setBulkFee("");
    notify(`Taxa de R$ ${centsToStr(cents)} aplicada a ${selected.size} bairro(s).`);
  };

  const toggleEnabled = (slug: string) => {
    setNeighborhoods((prev) => ({
      ...prev,
      [slug]: { ...prev[slug], enabled: !prev[slug].enabled },
    }));
  };

  const setFee = (slug: string, val: string) => {
    setNeighborhoods((prev) => ({
      ...prev,
      [slug]: { ...prev[slug], feeCents: strToCents(val) },
    }));
  };

  const removeNeighborhood = (slug: string) => {
    setNeighborhoods((prev) => {
      const next = { ...prev };
      delete next[slug];
      return next;
    });
    setSelected((prev) => { const next = new Set(prev); next.delete(slug); return next; });
  };

  const bulkEnable = (enable: boolean) => {
    setNeighborhoods((prev) => {
      const next = { ...prev };
      for (const slug of selected) {
        if (next[slug]) next[slug] = { ...next[slug], enabled: enable };
      }
      return next;
    });
    notify(`${selected.size} bairro(s) ${enable ? "ativado(s)" : "desativado(s)"}.`);
  };

  const entries = Object.entries(neighborhoods);
  const normFilter = filter.toLowerCase();
  const sortedEntries = entries
    .filter(([, v]) => !normFilter || v.name.toLowerCase().includes(normFilter))
    .sort(([, a], [, b]) => a.name.localeCompare(b.name, "pt-BR"));

  const enabledCount = entries.filter(([, v]) => v.enabled).length;

  return (
    <div style={{ border: "1px solid var(--kd-border)", borderRadius: 8, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%",
          padding: "10px 12px", border: "none", background: "var(--kd-bg, #fff)",
          cursor: "pointer", fontSize: 14, fontWeight: 500, textAlign: "left",
        }}
      >
        <MapPin size={16} style={{ color: "var(--kd-accent)", flexShrink: 0 }} />
        <span style={{ flex: 1 }}>{city.name} — {city.uf}</span>
        <Badge tone="neutral">{enabledCount}/{entries.length} bairros</Badge>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {expanded && (
        <div style={{ borderTop: "1px solid var(--kd-border)", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {loading && !loaded && (
            <div style={{ display: "flex", justifyContent: "center", padding: 16 }}>
              <LoaderCircle size={20} className="kd-spin" />
            </div>
          )}

          {loaded && (
            <>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button size="sm" variant="secondary" onClick={importFromIbge} disabled={loading}>
                  {loading ? <LoaderCircle size={14} className="kd-spin" /> : <Plus size={14} />}
                  Importar bairros do IBGE
                </Button>
                <Button size="sm" variant="secondary" onClick={handleRemove} disabled={removing} style={{ marginLeft: "auto", color: "var(--kd-danger, #ef4444)" }}>
                  <Trash2 size={14} />
                  Remover cidade
                </Button>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ position: "relative", flex: 1 }}>
                  <Search size={14} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--kd-muted)" }} />
                  <input
                    type="text"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Filtrar bairros..."
                    style={{
                      width: "100%", padding: "6px 8px 6px 28px", borderRadius: 6,
                      border: "1px solid var(--kd-border)", fontSize: 12, outline: "none",
                    }}
                  />
                </div>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addManual()}
                    placeholder="Novo bairro"
                    style={{
                      padding: "6px 8px", borderRadius: 6, width: 140,
                      border: "1px solid var(--kd-border)", fontSize: 12, outline: "none",
                    }}
                  />
                  <Button size="sm" variant="secondary" onClick={addManual} disabled={!newName.trim()}>
                    <Plus size={14} />
                  </Button>
                </div>
              </div>

              {selected.size > 0 && (
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", padding: "6px 8px", background: "var(--kd-accent-light, #fef9c3)", borderRadius: 6, fontSize: 12 }}>
                  <span style={{ fontWeight: 500 }}>{selected.size} selecionado(s)</span>
                  <button type="button" onClick={deselectAll} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 12, textDecoration: "underline" }}>Limpar</button>
                  <span style={{ color: "var(--kd-muted)" }}>|</span>
                  <button type="button" onClick={() => bulkEnable(true)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 12, textDecoration: "underline" }}>Ativar</button>
                  <button type="button" onClick={() => bulkEnable(false)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 12, textDecoration: "underline" }}>Desativar</button>
                  <button type="button" onClick={() => setShowBulk(true)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 12, textDecoration: "underline" }}>Definir taxa</button>
                </div>
              )}

              {showBulk && (
                <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "6px 8px", background: "var(--kd-hover, #f5f5f3)", borderRadius: 6, fontSize: 12 }}>
                  <span>Taxa (R$):</span>
                  <input
                    type="text"
                    value={bulkFee}
                    onChange={(e) => setBulkFee(e.target.value)}
                    placeholder="0,00"
                    inputMode="decimal"
                    style={{ width: 80, padding: "4px 6px", borderRadius: 4, border: "1px solid var(--kd-border)", fontSize: 12, outline: "none" }}
                    onKeyDown={(e) => e.key === "Enter" && applyBulkFee()}
                  />
                  <Button size="sm" onClick={applyBulkFee}><Check size={12} /> Aplicar</Button>
                  <button type="button" onClick={() => setShowBulk(false)} style={{ border: "none", background: "none", cursor: "pointer" }}><X size={14} /></button>
                </div>
              )}

              <div style={{ display: "flex", gap: 6, fontSize: 12, color: "var(--kd-muted)" }}>
                <button type="button" onClick={selectAll} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 12, textDecoration: "underline", color: "inherit" }}>Selecionar todos</button>
                <span>|</span>
                <span>{sortedEntries.length} bairro(s)</span>
              </div>

              <div style={{ maxHeight: 400, overflowY: "auto", borderRadius: 6, border: "1px solid var(--kd-border)" }}>
                {sortedEntries.length === 0 && (
                  <p style={{ fontSize: 12, color: "var(--kd-muted)", textAlign: "center", padding: 16 }}>
                    Nenhum bairro. Importe do IBGE ou adicione manualmente.
                  </p>
                )}
                {sortedEntries.map(([slug, entry]) => (
                  <div
                    key={slug}
                    style={{
                      display: "flex", alignItems: "center", gap: 6, padding: "6px 8px",
                      borderBottom: "1px solid var(--kd-border)",
                      opacity: entry.enabled ? 1 : 0.5,
                      fontSize: 13,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(slug)}
                      onChange={() => toggleSelect(slug)}
                      style={{ cursor: "pointer" }}
                    />
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {entry.name}
                    </span>
                    {feeMode === "taxa_por_bairro" && (
                      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                        <span style={{ fontSize: 11, color: "var(--kd-muted)" }}>R$</span>
                        <input
                          type="text"
                          value={centsToStr(entry.feeCents)}
                          onChange={(e) => setFee(slug, e.target.value)}
                          inputMode="decimal"
                          style={{
                            width: 60, padding: "2px 4px", borderRadius: 4,
                            border: "1px solid var(--kd-border)", fontSize: 12,
                            textAlign: "right", outline: "none",
                          }}
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleEnabled(slug)}
                      style={{
                        padding: "2px 8px", borderRadius: 4, border: "1px solid var(--kd-border)",
                        background: entry.enabled ? "var(--kd-accent)" : "transparent",
                        color: entry.enabled ? "#fff" : "var(--kd-muted)",
                        cursor: "pointer", fontSize: 11, fontWeight: 500,
                      }}
                    >
                      {entry.enabled ? "Ativo" : "Inativo"}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeNeighborhood(slug)}
                      style={{ border: "none", background: "none", cursor: "pointer", color: "var(--kd-muted)", padding: 2 }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>

              <Button onClick={save} disabled={saving} icon={saving ? <LoaderCircle size={14} className="kd-spin" /> : <Check size={14} />}>
                Salvar bairros de {city.name}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
