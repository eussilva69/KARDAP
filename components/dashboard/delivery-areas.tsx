"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, MapPin, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { friendlyError } from "@/lib/async";
import { brl } from "@/lib/format";
import {
  Autocomplete,
  Badge,
  Button,
  Card,
  CardHead,
  IconButton,
  Modal,
  RadioCard,
  Segmented,
  Skeleton,
  Switch,
  TextField,
  newSessionToken,
} from "@/components/ui";
import type { DeliveryConfig, FeeMode, NeighborhoodEntry, ServedCity } from "@/lib/delivery/types";
import { slugifyNeighborhood } from "@/lib/delivery/types";
import { neighborhoodKey } from "@/lib/delivery/match";
import { fetchOsmNeighborhoods, mergeNeighborhoods, type SourcedNeighborhood } from "@/lib/delivery/osm";

type Notify = (message: string, tone?: "success" | "error") => void;
type Rows = Record<string, NeighborhoodEntry>;
type CityOption = { ibgeCode: string | null; name: string; uf: string; placeId?: string };

const PAGE_SIZE = 25;
const BROWSER_OSM_TIMEOUT_MS = 60_000;

// ───────────────────────── API ─────────────────────────

async function authHeaders(): Promise<HeadersInit> {
  const { getFirebaseAuth } = await import("@/lib/auth");
  const token = await getFirebaseAuth().currentUser?.getIdToken();
  if (!token) throw new Error("Sua sessão expirou. Entre de novo.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function request<T>(url: string, init: RequestInit = {}, auth = true): Promise<T> {
  const headers = auth ? await authHeaders() : undefined;
  const res = await fetch(url, { ...init, headers: { ...headers, ...init.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Não foi possível concluir agora.");
  return data as T;
}

const areasUrl = (restaurantId: string, cityCode?: string) =>
  `/api/restaurants/${encodeURIComponent(restaurantId)}/delivery/areas${cityCode ? `?cityCode=${encodeURIComponent(cityCode)}` : ""}`;

async function loadRows(restaurantId: string, cityCode: string): Promise<Rows> {
  const data = await request<{ neighborhoods?: Rows }>(areasUrl(restaurantId, cityCode));
  return data.neighborhoods || {};
}

async function saveRows(restaurantId: string, city: ServedCity, neighborhoods: Rows): Promise<DeliveryConfig> {
  const data = await request<{ config: DeliveryConfig }>(areasUrl(restaurantId), {
    method: "POST",
    body: JSON.stringify({ cityCode: city.ibgeCode, cityName: city.name, uf: city.uf, placeId: city.placeId, neighborhoods }),
  });
  return data.config;
}

/** Bairros conhecidos da cidade: servidor (cache, OSM rápido + IBGE); se o OSM não respondeu lá, tenta pelo navegador. */
async function knownNeighborhoods(ibgeCode: string): Promise<SourcedNeighborhood[]> {
  const data = await request<{ cityName: string; list: SourcedNeighborhood[]; partial: boolean }>(`/api/delivery/neighborhoods?ibgeCode=${ibgeCode}`, {}, false);
  if (!data.partial) return data.list;
  const osm = await fetchOsmNeighborhoods(ibgeCode, BROWSER_OSM_TIMEOUT_MS);
  if (!osm) return data.list;
  return mergeNeighborhoods(data.cityName, [
    { names: osm, source: "osm" },
    { names: data.list.map((n) => n.name), source: "ibge" },
  ]);
}

/** Acrescenta à lista os bairros que ainda não existem. */
function withImported(rows: Rows, names: string[]): { rows: Rows; added: number } {
  const keys = new Set(Object.values(rows).map((r) => neighborhoodKey(r.name)));
  const next = { ...rows };
  let added = 0;
  for (const name of names) {
    const key = neighborhoodKey(name);
    const slug = slugifyNeighborhood(name);
    if (!key || !slug || keys.has(key) || next[slug]) continue;
    keys.add(key);
    next[slug] = { name, feeCents: null, enabled: true };
    added += 1;
  }
  return { rows: next, added };
}

// ───────────────────────── Auxiliares ─────────────────────────

const centsToInput = (cents: number | null | undefined) => (typeof cents === "number" ? (cents / 100).toFixed(2).replace(".", ",") : "");

function parseMoney(raw: string): number | null {
  const clean = raw.replace(/[^\d,.]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (!clean) return null;
  const value = Number(clean);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : NaN;
}

const sameRows = (a: Rows | null, b: Rows | null) => JSON.stringify(a) === JSON.stringify(b);

// ───────────────────────── Card Principal na Página ─────────────────────────

export function DeliveryAreasManager({
  restaurantId,
  config,
  notify,
  onConfigUpdate,
  onConfigReplace,
}: {
  restaurantId: string;
  config: DeliveryConfig;
  notify: Notify;
  onConfigUpdate: (patch: Partial<DeliveryConfig>) => Promise<boolean>;
  onConfigReplace: (config: DeliveryConfig) => void;
}) {
  const [showModal, setShowModal] = useState(false);
  const servedCities: ServedCity[] = useMemo(() => config.servedCities || [], [config.servedCities]);
  const feeMode: FeeMode = config.feeMode || "taxa_fixa";

  return (
    <>
      <Card style={{ marginBottom: 16 }}>
        <CardHead
          title="Áreas de entrega"
          action={
            <Button size="sm" variant="secondary" onClick={() => setShowModal(true)}>
              Editar
            </Button>
          }
        />
        <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
          <p style={{ fontSize: 13, color: "var(--k-muted)", margin: 0 }}>
            {feeMode === "taxa_fixa"
              ? `Taxa fixa · ${brl(config.deliveryFeeCents)}`
              : `Taxa por bairro${config.defaultNeighborhoodFeeCents !== null && config.defaultNeighborhoodFeeCents !== undefined ? ` · Taxa padrão ${brl(config.defaultNeighborhoodFeeCents)}` : ""}${config.serveUnlistedNeighborhoods ? " · Atende bairros fora da lista" : ""}`}
          </p>
          <p style={{ fontSize: 13, color: "var(--k-muted)", margin: 0 }}>
            {servedCities.length === 0 ? (
              feeMode === "taxa_fixa"
                ? "Sem cidades cadastradas (taxa fixa para qualquer endereço)."
                : "Nenhuma cidade cadastrada. Configure as cidades e bairros atendidos."
            ) : (
              `${servedCities.length} ${servedCities.length === 1 ? "cidade atendida" : "cidades atendidas"}: ${servedCities
                .map((c) => `${c.name} (${c.uf})${c.enabled === false ? " · Pausada" : ""}`)
                .join(", ")}`
            )}
          </p>
        </div>
      </Card>

      {showModal && (
        <DeliveryAreasModal
          restaurantId={restaurantId}
          config={config}
          notify={notify}
          onConfigUpdate={onConfigUpdate}
          onConfigReplace={onConfigReplace}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

// ───────────────────────── Modal Unificado de Configuração ─────────────────────────

const MODAL_STEPS = ["Modalidade", "Cidades e bairros"] as const;
type ModalStep = 0 | 1;

function DeliveryAreasModal({
  restaurantId,
  config,
  notify,
  onConfigUpdate,
  onConfigReplace,
  onClose,
}: {
  restaurantId: string;
  config: DeliveryConfig;
  notify: Notify;
  onConfigUpdate: (patch: Partial<DeliveryConfig>) => Promise<boolean>;
  onConfigReplace: (config: DeliveryConfig) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<ModalStep>(0);
  const servedCities: ServedCity[] = useMemo(() => config.servedCities || [], [config.servedCities]);

  // Taxas gerais (Passo 0)
  const [mode, setMode] = useState<FeeMode>(config.feeMode || "taxa_fixa");
  const [flat, setFlat] = useState(centsToInput(config.deliveryFeeCents));
  const [fallback, setFallback] = useState(centsToInput(config.defaultNeighborhoodFeeCents));
  const [unlisted, setUnlisted] = useState(Boolean(config.serveUnlistedNeighborhoods));
  const [feeSaving, setFeeSaving] = useState(false);
  const [feeErrors, setFeeErrors] = useState<{ flat?: string; fallback?: string }>({});

  const flatCents = parseMoney(flat);
  const fallbackCents = parseMoney(fallback);
  const feeDirty =
    mode !== (config.feeMode || "taxa_fixa") ||
    (mode === "taxa_fixa" && (flatCents ?? 0) !== config.deliveryFeeCents) ||
    (mode === "taxa_por_bairro" && (fallbackCents !== (config.defaultNeighborhoodFeeCents ?? null) || unlisted !== Boolean(config.serveUnlistedNeighborhoods)));

  const saveFeeSettings = async (showToast = true): Promise<boolean> => {
    const found: typeof feeErrors = {};
    if (mode === "taxa_fixa" && Number.isNaN(flatCents)) found.flat = "Informe um valor como 7,50 (ou 0 para entrega grátis).";
    if (mode === "taxa_por_bairro" && Number.isNaN(fallbackCents)) found.fallback = "Informe um valor como 7,50 ou deixe em branco.";
    if (mode === "taxa_por_bairro" && unlisted && fallbackCents === null) found.fallback = "Defina a taxa padrão para atender bairros fora da lista.";
    setFeeErrors(found);
    if (found.flat || found.fallback) return false;

    setFeeSaving(true);
    const patch: Partial<DeliveryConfig> = { feeMode: mode };
    if (mode === "taxa_fixa") {
      patch.deliveryFeeCents = flatCents ?? 0;
    } else {
      patch.defaultNeighborhoodFeeCents = fallbackCents;
      patch.serveUnlistedNeighborhoods = unlisted;
    }

    try {
      const ok = await onConfigUpdate(patch);
      if (ok && showToast) notify("Taxas de entrega atualizadas.");
      return ok;
    } finally {
      setFeeSaving(false);
    }
  };

  // Cidades e Bairros (Passo 1)
  const [activeCityCode, setActiveCityCode] = useState<string | null>(servedCities[0]?.ibgeCode || null);
  const [addingCity, setAddingCity] = useState<string | null>(null);
  const [preloaded, setPreloaded] = useState<Record<string, Rows>>({});
  const sessionRef = useRef(newSessionToken());

  // Manter cidade ativa válida
  useEffect(() => {
    if (servedCities.length > 0) {
      if (!activeCityCode || !servedCities.some((c) => c.ibgeCode === activeCityCode)) {
        setActiveCityCode(servedCities[0].ibgeCode);
      }
    } else {
      setActiveCityCode(null);
    }
  }, [servedCities, activeCityCode]);

  const searchCities = useCallback(
    async (q: string, signal: AbortSignal) => {
      const res = await fetch(`/api/delivery/cities?q=${encodeURIComponent(q)}&session=${sessionRef.current}`, { signal });
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data.message || "Não foi possível buscar cidades agora.");
      return (data as CityOption[]).filter((c) => !servedCities.some((s) => s.ibgeCode === c.ibgeCode));
    },
    [servedCities],
  );

  const addCity = async (option: CityOption) => {
    const session = sessionRef.current;
    sessionRef.current = newSessionToken();
    setAddingCity(option.name);
    try {
      let city = option;
      if (!city.ibgeCode && city.placeId) {
        city = await request<CityOption>(`/api/delivery/cities?placeId=${encodeURIComponent(city.placeId)}&session=${session}`, {}, false);
      }
      if (!city.ibgeCode) throw new Error("Não encontramos esta cidade no IBGE.");
      if (servedCities.some((c) => c.ibgeCode === city.ibgeCode)) {
        notify(`${city.name} já está na lista.`);
        setActiveCityCode(city.ibgeCode);
        return;
      }
      const served: ServedCity = { ibgeCode: city.ibgeCode, name: city.name, uf: city.uf, placeId: city.placeId };
      const known = await knownNeighborhoods(city.ibgeCode).catch(() => [] as SourcedNeighborhood[]);
      const { rows, added } = withImported({}, known.map((n) => n.name));
      const next = await saveRows(restaurantId, served, rows);
      setPreloaded((p) => ({ ...p, [served.ibgeCode]: rows }));
      onConfigReplace(next);
      setActiveCityCode(served.ibgeCode);
      notify(
        added
          ? `${city.name} adicionada com ${added} bairros carregados automaticamente.`
          : `${city.name} adicionada. Não encontramos bairros cadastrados para ela; adicione os bairros atendidos.`,
      );
    } catch (err) {
      notify(friendlyError(err, "Não foi possível adicionar a cidade."), "error");
    } finally {
      setAddingCity(null);
    }
  };

  const activeCity = useMemo(() => servedCities.find((c) => c.ibgeCode === activeCityCode) || null, [servedCities, activeCityCode]);

  // Ref para disparar salvamento do editor ativo ao concluir modal
  const cityEditorSaveRef = useRef<() => Promise<boolean>>(() => Promise.resolve(true));
  const cityEditorDirtyRef = useRef<boolean>(false);

  const handleStepChange = async (nextStep: ModalStep) => {
    if (step === 0 && feeDirty) {
      const ok = await saveFeeSettings(false);
      if (!ok) return;
    }
    setStep(nextStep);
  };

  const handleFinishModal = async () => {
    if (feeDirty) {
      const ok = await saveFeeSettings(false);
      if (!ok) return;
    }
    if (cityEditorDirtyRef.current) {
      const ok = await cityEditorSaveRef.current();
      if (!ok) return;
    }
    notify("Configurações de áreas de entrega salvas com sucesso!");
    onClose();
  };

  const isSaving = feeSaving || Boolean(addingCity);

  return (
    <Modal
      title="Configurar áreas de entrega"
      size="lg"
      onClose={onClose}
      busy={isSaving}
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", width: "100%", gap: 8 }}>
          <Button
            variant="secondary"
            onClick={step === 0 ? onClose : () => setStep(0)}
            disabled={isSaving}
          >
            {step === 0 ? "Cancelar" : "Voltar"}
          </Button>

          <div style={{ display: "flex", gap: 8 }}>
            {step === 0 ? (
              <Button
                variant="primary"
                loading={feeSaving}
                onClick={async () => {
                  if (feeDirty) {
                    const ok = await saveFeeSettings();
                    if (!ok) return;
                  }
                  setStep(1);
                }}
              >
                Continuar
              </Button>
            ) : (
              <Button
                variant="primary"
                loading={isSaving}
                icon={<Check size={15} />}
                onClick={handleFinishModal}
              >
                Salvar e fechar
              </Button>
            )}
          </div>
        </div>
      }
    >
      <ol className="kd-stepper">
        {MODAL_STEPS.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => handleStepChange(i as ModalStep)}
              disabled={isSaving}
              aria-current={i === step ? "step" : undefined}
              className={i < step ? "is-done" : undefined}
            >
              {i < step ? <Check size={13} aria-hidden /> : <span aria-hidden>{i + 1}.</span>}
              {label}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="kd-areas-modal-step">
          <fieldset className="kd-dl-fieldset">
            <legend className="kd-muted">Como você cobra a taxa de entrega?</legend>
            <div className="kd-radio-list kd-areas-modes" role="radiogroup" aria-label="Modo de cobrança da entrega">
              <RadioCard
                name="kd-fee-mode"
                value="taxa_fixa"
                checked={mode === "taxa_fixa"}
                onChange={setMode}
                title="Taxa fixa"
                description="O mesmo valor para toda a área atendida."
              />
              <RadioCard
                name="kd-fee-mode"
                value="taxa_por_bairro"
                checked={mode === "taxa_por_bairro"}
                onChange={setMode}
                title="Taxa por bairro"
                description="Cada bairro com o seu valor específico."
              />
            </div>
          </fieldset>

          {mode === "taxa_fixa" ? (
            <TextField
              label="Taxa de entrega fixa (R$)"
              inputMode="decimal"
              placeholder="0,00"
              value={flat}
              error={feeErrors.flat}
              hint="Use 0,00 para entrega grátis. Você pode adicionar cidades para restringir as entregas."
              onChange={(e) => setFlat(e.target.value)}
            />
          ) : (
            <div className="kd-group" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <TextField
                label="Taxa padrão (R$)"
                optional
                inputMode="decimal"
                placeholder="Sem taxa padrão"
                value={fallback}
                error={feeErrors.fallback}
                hint="Cobrada nos bairros ativos sem valor próprio. Deixe em branco se não desejar taxa padrão."
                onChange={(e) => setFallback(e.target.value)}
              />
              <Switch
                label="Atender bairros fora da lista"
                description="Endereços em bairros que não estão cadastrados pagam a taxa padrão."
                checked={unlisted}
                onChange={setUnlisted}
              />
            </div>
          )}

          {feeDirty && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button size="sm" variant="secondary" onClick={() => saveFeeSettings()} loading={feeSaving} icon={<Check size={14} />}>
                Salvar taxas agora
              </Button>
            </div>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="kd-areas-modal-step">
          {/* Seletor de Cidades Cadastradas */}
          {servedCities.length > 0 && (
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--k-muted)" }}>
                Cidades atendidas ({servedCities.length})
              </label>
              <div className="kd-city-selector-bar" role="tablist" aria-label="Cidades atendidas">
                {servedCities.map((c) => {
                  const isSelected = activeCityCode === c.ibgeCode;
                  const isPaused = c.enabled === false;
                  return (
                    <button
                      key={c.ibgeCode}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      className={`kd-city-chip ${isSelected ? "is-active" : ""} ${isPaused ? "is-paused" : ""}`}
                      onClick={() => setActiveCityCode(c.ibgeCode)}
                    >
                      <MapPin size={14} aria-hidden />
                      <span>
                        {c.name} — {c.uf}
                      </span>
                      {isPaused && <Badge tone="outline">Pausada</Badge>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Autocomplete para adicionar cidade */}
          <Autocomplete<CityOption>
            label="Adicionar cidade"
            placeholder="Digite o nome da cidade (ex: São Paulo, Campinas)"
            icon={<Search size={17} />}
            minChars={2}
            fetchItems={searchCities}
            itemKey={(c) => c.ibgeCode || c.placeId || `${c.name}-${c.uf}`}
            renderItem={(c) => (
              <>
                <MapPin size={16} />
                <span className="kd-ac-item">
                  <b>{c.name}</b>
                </span>
                <Badge tone="neutral">{c.uf}</Badge>
              </>
            )}
            onSelect={addCity}
            busy={Boolean(addingCity)}
            emptyText="Nenhuma cidade encontrada."
            hint={
              addingCity
                ? `Adicionando ${addingCity} e carregando os bairros…`
                : "Selecione uma cidade para carregar automaticamente todos os bairros correspondentes."
            }
          />

          {addingCity && <Skeleton rows={3} height={48} label={`Carregando bairros de ${addingCity}`} />}

          {/* Editor da Cidade Ativa */}
          {activeCity ? (
            <CityNeighborhoodsEditor
              key={activeCity.ibgeCode}
              restaurantId={restaurantId}
              city={activeCity}
              config={config}
              initialRows={preloaded[activeCity.ibgeCode]}
              notify={notify}
              onConfigUpdate={onConfigUpdate}
              onConfigReplace={onConfigReplace}
              onCityRemoved={() => {
                const remaining = servedCities.filter((c) => c.ibgeCode !== activeCity.ibgeCode);
                setActiveCityCode(remaining[0]?.ibgeCode || null);
              }}
              bindSave={(fn, isDirty) => {
                cityEditorSaveRef.current = fn;
                cityEditorDirtyRef.current = isDirty;
              }}
            />
          ) : (
            !addingCity && (
              <p className="kd-areas-empty">
                {mode === "taxa_fixa"
                  ? "Sem cidades cadastradas, a taxa fixa vale para qualquer endereço. Adicione uma cidade acima para delimitar a área de entrega e selecionar os bairros atendidos."
                  : "Nenhuma cidade cadastrada ainda. Adicione uma cidade acima para carregar automaticamente os bairros e definir suas taxas."}
              </p>
            )
          )}
        </div>
      )}
    </Modal>
  );
}

// ───────────────────────── Editor de Bairros da Cidade ─────────────────────────

type StatusFilter = "all" | "on" | "off" | "nofee";

function CityNeighborhoodsEditor({
  restaurantId,
  city,
  config,
  initialRows,
  notify,
  onConfigUpdate,
  onConfigReplace,
  onCityRemoved,
  bindSave,
}: {
  restaurantId: string;
  city: ServedCity;
  config: DeliveryConfig;
  initialRows?: Rows;
  notify: Notify;
  onConfigUpdate: (patch: Partial<DeliveryConfig>) => Promise<boolean>;
  onConfigReplace: (config: DeliveryConfig) => void;
  onCityRemoved: () => void;
  bindSave: (saveFn: () => Promise<boolean>, dirty: boolean) => void;
}) {
  const perNeighborhood = (config.feeMode || "taxa_fixa") === "taxa_por_bairro";
  const fallback = config.defaultNeighborhoodFeeCents ?? null;
  const cityEnabled = city.enabled !== false;

  const [rows, setRows] = useState<Rows | null>(initialRows ?? null);
  const [saved, setSaved] = useState<Rows | null>(initialRows ?? null);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkFee, setBulkFee] = useState("");
  const [newName, setNewName] = useState("");

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const data = await loadRows(restaurantId, city.ibgeCode);
      setRows(data);
      setSaved(data);
    } catch (err) {
      setLoadError(friendlyError(err, "Não foi possível carregar os bairros."));
    }
  }, [restaurantId, city.ibgeCode]);

  useEffect(() => {
    if (initialRows) {
      setRows(initialRows);
      setSaved(initialRows);
    }
  }, [initialRows]);

  useEffect(() => {
    if (rows === null && !loadError) load();
  }, [rows, loadError, load]);

  const all = useMemo(() => Object.entries(rows || {}).sort(([, a], [, b]) => a.name.localeCompare(b.name, "pt-BR")), [rows]);
  const filtered = useMemo(() => {
    const term = neighborhoodKey(filter);
    return all.filter(([, r]) => {
      if (term && !neighborhoodKey(r.name).includes(term)) return false;
      if (status === "on") return r.enabled;
      if (status === "off") return !r.enabled;
      if (status === "nofee") return r.feeCents === null;
      return true;
    });
  }, [all, filter, status]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  useEffect(() => setPage(0), [filter, status]);

  const enabledCount = all.filter(([, r]) => r.enabled).length;
  const noFeeCount = all.filter(([, r]) => r.enabled && r.feeCents === null).length;
  const dirty = rows !== null && !sameRows(rows, saved);

  const update = (slug: string, patch: Partial<NeighborhoodEntry>) =>
    setRows((prev) => (prev && prev[slug] ? { ...prev, [slug]: { ...prev[slug], ...patch } } : prev));

  const updateSelected = (patch: Partial<NeighborhoodEntry>) =>
    setRows((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      selected.forEach((slug) => {
        if (next[slug]) next[slug] = { ...next[slug], ...patch };
      });
      return next;
    });

  const removeSelected = () => {
    setRows((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      selected.forEach((slug) => delete next[slug]);
      return next;
    });
    setSelected(new Set());
  };

  const rename = (slug: string, name: string): boolean => {
    const clean = name.replace(/\s+/g, " ").trim();
    if (!clean || !rows) return false;
    const key = neighborhoodKey(clean);
    if (Object.entries(rows).some(([s, r]) => s !== slug && neighborhoodKey(r.name) === key)) {
      notify("Já existe um bairro com esse nome.", "error");
      return false;
    }
    update(slug, { name: clean.slice(0, 100) });
    return true;
  };

  const addManual = () => {
    const name = newName.replace(/\s+/g, " ").trim();
    if (!name || !rows) return;
    const { rows: next, added } = withImported(rows, [name]);
    if (!added) {
      notify("Esse bairro já está na lista.", "error");
      return;
    }
    setRows(next);
    setNewName("");
    setFilter("");
    setStatus("all");
  };

  const reimport = async () => {
    if (!rows) return;
    setImporting(true);
    try {
      const known = await knownNeighborhoods(city.ibgeCode);
      const { rows: next, added } = withImported(rows, known.map((n) => n.name));
      setRows(next);
      notify(added ? `${added} novos bairros adicionados. Revise e salve.` : "Nenhum novo bairro encontrado.");
    } catch (err) {
      notify(friendlyError(err, "Não foi possível buscar os bairros."), "error");
    } finally {
      setImporting(false);
    }
  };

  const save = useCallback(async (): Promise<boolean> => {
    if (!rows) return true;
    setSaving(true);
    try {
      const next = await saveRows(restaurantId, city, rows);
      onConfigReplace(next);
      const fresh = await loadRows(restaurantId, city.ibgeCode);
      setRows(fresh);
      setSaved(fresh);
      setSelected(new Set());
      notify(`Bairros de ${city.name} salvos.`);
      return true;
    } catch (err) {
      notify(friendlyError(err, "Não foi possível salvar os bairros."), "error");
      return false;
    } finally {
      setSaving(false);
    }
  }, [rows, restaurantId, city, onConfigReplace, notify]);

  useEffect(() => {
    bindSave(save, dirty);
  }, [bindSave, dirty, save]);

  const toggleCity = async (enabled: boolean) => {
    setToggling(true);
    const ok = await onConfigUpdate({
      servedCities: (config.servedCities || []).map((c) => (c.ibgeCode === city.ibgeCode ? { ...c, enabled } : c)),
    });
    setToggling(false);
    if (ok) notify(enabled ? `Entregas para ${city.name} reativadas.` : `Entregas para ${city.name} pausadas.`);
  };

  const removeCity = async () => {
    setRemoving(true);
    try {
      const next = await request<{ config: DeliveryConfig }>(areasUrl(restaurantId, city.ibgeCode), { method: "DELETE" });
      onConfigReplace(next.config);
      notify(`${city.name} removida.`);
      onCityRemoved();
    } catch (err) {
      notify(friendlyError(err, "Não foi possível remover a cidade."), "error");
    } finally {
      setRemoving(false);
      setConfirmRemove(false);
    }
  };

  const pageSlugs = visible.map(([slug]) => slug);
  const pageAllSelected = pageSlugs.length > 0 && pageSlugs.every((s) => selected.has(s));
  const togglePage = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      pageSlugs.forEach((s) => (pageAllSelected ? next.delete(s) : next.add(s)));
      return next;
    });
  const selectFiltered = () => setSelected(new Set(filtered.map(([slug]) => slug)));

  const applyBulkFee = () => {
    const cents = parseMoney(bulkFee);
    if (Number.isNaN(cents)) {
      notify("Informe um valor como 7,50.", "error");
      return;
    }
    updateSelected({ feeCents: cents });
    setBulkFee("");
    notify(cents === null ? `${selected.size} bairros passam a usar a taxa padrão.` : `Taxa de ${brl(cents)} aplicada a ${selected.size} bairros.`);
  };

  const summary = rows === null ? "Carregando bairros…" : `${enabledCount} de ${all.length} bairros ativos${perNeighborhood && noFeeCount ? ` · ${noFeeCount} sem taxa própria` : ""}`;

  return (
    <div className={`kd-area ${cityEnabled ? "" : "is-off"} is-open`}>
      {/* Cabeçalho da Cidade Selecionada */}
      <div className="kd-city-active-header">
        <div className="kd-city-active-title">
          <b>
            <MapPin size={18} aria-hidden />
            {city.name} — {city.uf}
            {!cityEnabled && <Badge tone="outline">Pausada</Badge>}
            {dirty && <Badge tone="signal">Alterações não salvas</Badge>}
          </b>
          <small>{summary}</small>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Switch
            label="Entregar nesta cidade"
            checked={cityEnabled}
            disabled={toggling}
            onChange={toggleCity}
          />
          {confirmRemove ? (
            <div className="kd-row">
              <span className="kd-hint">Remover cidade?</span>
              <Button size="sm" variant="danger" loading={removing} onClick={removeCity}>
                Sim, remover
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)} disabled={removing}>
                Cancelar
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="kd-text-danger"
              icon={<Trash2 size={15} />}
              onClick={() => setConfirmRemove(true)}
            >
              Remover cidade
            </Button>
          )}
        </div>
      </div>

      <div className="kd-area-body" style={{ borderTop: "none", padding: 0 }}>
        {loadError ? (
          <div className="kd-row" style={{ padding: "12px 0" }}>
            <span className="kd-error">{loadError}</span>
            <Button size="sm" variant="secondary" onClick={load}>
              Tentar novamente
            </Button>
          </div>
        ) : rows === null ? (
          <Skeleton rows={6} height={42} label={`Carregando bairros de ${city.name}`} />
        ) : (
          <>
            {/* Ferramentas de busca e filtro */}
            <div className="kd-area-tools">
              <label className="kd-search">
                <Search size={17} aria-hidden />
                <span className="kd-sr">Buscar bairro</span>
                <input
                  type="search"
                  placeholder="Buscar bairro..."
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
                {filter && (
                  <IconButton label="Limpar busca" onClick={() => setFilter("")}>
                    <X size={15} />
                  </IconButton>
                )}
              </label>
              <Segmented<StatusFilter>
                label="Filtrar bairros"
                value={status}
                onChange={setStatus}
                options={[
                  { value: "all", label: "Todos", count: all.length },
                  { value: "on", label: "Ativos", count: enabledCount },
                  { value: "off", label: "Inativos", count: all.length - enabledCount },
                  ...(perNeighborhood
                    ? [{ value: "nofee" as StatusFilter, label: "Sem taxa", count: all.filter(([, r]) => r.feeCents === null).length }]
                    : []),
                ]}
              />
            </div>

            {/* Adicionar novo bairro manual e reimportar */}
            <div className="kd-area-tools">
              <form
                className="kd-area-add"
                onSubmit={(e) => {
                  e.preventDefault();
                  addManual();
                }}
              >
                <input
                  className="kd-input"
                  aria-label="Nome do novo bairro"
                  placeholder="Cadastrar novo bairro"
                  maxLength={100}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <Button type="submit" variant="secondary" icon={<Plus size={15} />} disabled={!newName.trim()}>
                  Adicionar
                </Button>
              </form>
              <Button variant="ghost" icon={<RefreshCw size={15} />} loading={importing} onClick={reimport}>
                Buscar novos bairros
              </Button>
            </div>

            {/* Ações em lote */}
            {selected.size > 0 && (
              <div className="kd-area-bulk" role="region" aria-label="Ações em massa">
                <b>{selected.size} selecionados</b>
                {selected.size < filtered.length && (
                  <button type="button" className="kd-link-button" onClick={selectFiltered}>
                    Selecionar todos os {filtered.length}
                  </button>
                )}
                <button type="button" className="kd-link-button" onClick={() => setSelected(new Set())}>
                  Limpar
                </button>
                <span className="kd-area-bulk-actions">
                  <Button size="sm" variant="secondary" onClick={() => updateSelected({ enabled: true })}>
                    Ativar
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => updateSelected({ enabled: false })}>
                    Desativar
                  </Button>
                  {perNeighborhood && (
                    <form
                      className="kd-area-bulk-fee"
                      onSubmit={(e) => {
                        e.preventDefault();
                        applyBulkFee();
                      }}
                    >
                      <input
                        className="kd-input"
                        inputMode="decimal"
                        aria-label="Taxa para os selecionados (R$)"
                        placeholder={fallback !== null ? "Padrão" : "R$ 0,00"}
                        value={bulkFee}
                        onChange={(e) => setBulkFee(e.target.value)}
                      />
                      <Button size="sm" type="submit">
                        Aplicar taxa
                      </Button>
                    </form>
                  )}
                  <Button size="sm" variant="ghost" className="kd-text-danger" icon={<Trash2 size={14} />} onClick={removeSelected}>
                    Excluir
                  </Button>
                </span>
              </div>
            )}

            {/* Tabela de bairros */}
            {filtered.length === 0 ? (
              <p className="kd-areas-empty">
                {all.length === 0 ? "Nenhum bairro na lista. Adicione bairros no campo acima." : "Nenhum bairro encontrado com esse filtro."}
              </p>
            ) : (
              <div className="kd-table-scroll">
                <table className="kd-data-table kd-area-table">
                  <thead>
                    <tr>
                      <th className="kd-area-check">
                        <input
                          type="checkbox"
                          aria-label="Selecionar bairros desta página"
                          checked={pageAllSelected}
                          onChange={togglePage}
                        />
                      </th>
                      <th>Bairro</th>
                      {perNeighborhood && <th>Taxa</th>}
                      <th>Entrega</th>
                      <th>
                        <span className="kd-sr">Ações</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map(([slug, row]) => (
                      <tr key={slug} className={row.enabled ? undefined : "is-off"}>
                        <td className="kd-area-check">
                          <input
                            type="checkbox"
                            aria-label={`Selecionar ${row.name}`}
                            checked={selected.has(slug)}
                            onChange={() =>
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (next.has(slug)) next.delete(slug);
                                else next.add(slug);
                                return next;
                              })
                            }
                          />
                        </td>
                        <td className="kd-area-name">
                          <NameCell name={row.name} onRename={(name) => rename(slug, name)} />
                        </td>
                        {perNeighborhood && (
                          <td className="kd-area-feecell">
                            <FeeCell
                              value={row.feeCents}
                              fallback={fallback}
                              label={row.name}
                              onCommit={(feeCents) => update(slug, { feeCents })}
                              notify={notify}
                            />
                          </td>
                        )}
                        <td className="kd-area-toggle">
                          <label className="kd-switch kd-switch--inline">
                            <input
                              type="checkbox"
                              role="switch"
                              aria-label={`Entregar no bairro ${row.name}`}
                              checked={row.enabled}
                              onChange={(e) => update(slug, { enabled: e.target.checked })}
                            />
                            <span aria-hidden />
                          </label>
                        </td>
                        <td className="kd-area-actions">
                          <IconButton
                            label={`Excluir ${row.name}`}
                            onClick={() => {
                              setRows((prev) => {
                                if (!prev) return prev;
                                const next = { ...prev };
                                delete next[slug];
                                return next;
                              });
                              setSelected((prev) => {
                                const next = new Set(prev);
                                next.delete(slug);
                                return next;
                              });
                            }}
                          >
                            <X size={15} />
                          </IconButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {filtered.length > PAGE_SIZE && (
              <nav className="kd-area-pager" aria-label="Páginas de bairros">
                <IconButton label="Página anterior" onClick={() => setPage(current - 1)} disabled={current === 0}>
                  <ChevronLeft size={17} />
                </IconButton>
                <span className="kd-num">
                  {current * PAGE_SIZE + 1}–{Math.min(filtered.length, (current + 1) * PAGE_SIZE)} de {filtered.length}
                </span>
                <IconButton label="Próxima página" onClick={() => setPage(current + 1)} disabled={current >= pages - 1}>
                  <ChevronRight size={17} />
                </IconButton>
              </nav>
            )}

            {/* Rodapé da cidade com botão de salvar bairros sem fechar modal */}
            <div className="kd-area-foot" style={{ marginTop: 8 }}>
              {perNeighborhood && noFeeCount > 0 && (
                <span className="kd-hint">
                  {fallback !== null
                    ? `${noFeeCount} bairros usam a taxa padrão (${brl(fallback)}).`
                    : `${noFeeCount} bairros ativos sem taxa não recebem entregas até definir um valor ou taxa padrão.`}
                </span>
              )}
              <span className="kd-row">
                {dirty && (
                  <Button variant="ghost" onClick={() => setRows(saved)} disabled={saving}>
                    Descartar
                  </Button>
                )}
                <Button onClick={save} loading={saving} disabled={!dirty} icon={<Check size={15} />}>
                  Salvar bairros de {city.name}
                </Button>
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Células da Tabela ─────────────────────────

function NameCell({ name, onRename }: { name: string; onRename: (name: string) => boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);

  if (!editing) {
    return (
      <span className="kd-area-name-view">
        <span>{name}</span>
        <IconButton
          label={`Renomear ${name}`}
          onClick={() => {
            setValue(name);
            setEditing(true);
          }}
        >
          <Pencil size={14} />
        </IconButton>
      </span>
    );
  }

  const commit = () => {
    if (value.trim() === name || onRename(value)) setEditing(false);
  };

  return (
    <input
      className="kd-input kd-area-inline"
      aria-label={`Novo nome para ${name}`}
      autoFocus
      maxLength={100}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}

function FeeCell({
  value,
  fallback,
  label,
  onCommit,
  notify,
}: {
  value: number | null;
  fallback: number | null;
  label: string;
  onCommit: (cents: number | null) => void;
  notify: Notify;
}) {
  const [text, setText] = useState(centsToInput(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(centsToInput(value));
  }, [value]);

  const commit = () => {
    focused.current = false;
    const cents = parseMoney(text);
    if (Number.isNaN(cents)) {
      notify(`Taxa inválida para ${label}. Use um valor como 7,50.`, "error");
      setText(centsToInput(value));
      return;
    }
    if (cents !== value) onCommit(cents);
    setText(centsToInput(cents));
  };

  return (
    <span className="kd-area-fee">
      <span aria-hidden>R$</span>
      <input
        className="kd-input kd-area-inline"
        inputMode="decimal"
        aria-label={`Taxa de entrega para ${label}`}
        placeholder={fallback !== null ? `${centsToInput(fallback)} (padrão)` : "Sem taxa"}
        value={text}
        onFocus={() => (focused.current = true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
      />
    </span>
  );
}
