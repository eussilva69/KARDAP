"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bike, Check, Copy, ExternalLink, MapPin, Wallet } from "lucide-react";
import { getRestaurantId } from "@/lib/restaurant-db";
import { friendlyError } from "@/lib/async";
import { brl, centsToInput, parseMoneyCents } from "@/lib/format";
import { usePlanEntitlements, usePlanUsage } from "@/components/billing/hooks";
import type { AccountInfo } from "./types";
import { Badge, Button, ButtonLink, Callout, ConfirmDialog, Modal, PageHeader, TextArea, TextField, type BadgeTone } from "@/components/ui";
import type { DeliveryConfig, FeeMode } from "@/lib/delivery/types";
import { ONLINE_PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/delivery/types";
import { deliveryReadiness, type ReadinessArea } from "@/lib/delivery/readiness";
import { DeliveryAreasModal, type MapOrigin } from "./delivery-areas";

type Notify = (message: string, tone?: "success" | "error") => void;

type DeliveryState = {
  config: DeliveryConfig;
  usage: { periodId: string; used: number; limit: number | null; remaining: number | null; level: string; blocked: boolean };
  deliveryUrl: string | null;
  planAllowsDelivery: boolean;
  subscriptionValid: boolean;
  mapOrigin?: MapOrigin | null;
  /** Formas online que funcionam neste ambiente (as demais não aparecem para o cliente). */
  onlinePaymentMethods?: string[];
};

const FEE_MODE_LABELS: Record<FeeMode, string> = { taxa_fixa: "Taxa fixa", taxa_por_bairro: "Taxa por bairro", area_mapa: "Área no mapa" };
const ON_DELIVERY_METHODS = ["dinheiro", "pix", "cartao_credito", "cartao_debito"];
const ONLINE_METHODS = ["pix_online", "cartao_online"];
/** Rótulos curtos dentro de cada grupo ("Na entrega" / "Online"): o grupo já diz quando a pessoa paga. */
const SHORT_LABELS: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  cartao_credito: "Cartão de crédito",
  cartao_debito: "Cartão de débito",
  pix_online: "Pix",
  cartao_online: "Cartão de crédito",
};

async function fetchDeliveryState(restaurantId: string): Promise<DeliveryState> {
  const { getFirebaseAuth } = await import("@/lib/auth");
  const token = await getFirebaseAuth().currentUser?.getIdToken();
  if (!token) throw new Error("Sua sessão expirou. Entre de novo.");
  const res = await fetch(`/api/restaurants/${encodeURIComponent(restaurantId)}/delivery`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "Não foi possível carregar.");
  }
  return res.json();
}

async function saveDeliveryConfig(restaurantId: string, patch: Partial<DeliveryConfig>): Promise<DeliveryConfig> {
  const { getFirebaseAuth } = await import("@/lib/auth");
  const token = await getFirebaseAuth().currentUser?.getIdToken();
  if (!token) throw new Error("Sua sessão expirou. Entre de novo.");
  const res = await fetch(`/api/restaurants/${encodeURIComponent(restaurantId)}/delivery`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "Não foi possível salvar.");
  }
  const data = await res.json();
  return data.config;
}

function DeliverySkeleton() {
  return (
    <div className="kd-dl-page" aria-busy="true" aria-label="Carregando o delivery">
      <div className="kd-skel kd-dl-skel kd-dl-skel--title" />
      <div className="kd-dl-overview">
        <div className="kd-skel kd-dl-skel kd-dl-skel--hero" />
        <div className="kd-skel kd-dl-skel kd-dl-skel--usage" />
      </div>
      <div className="kd-dl-panels">
        <div className="kd-skel kd-dl-skel kd-dl-skel--panel" />
        <div className="kd-skel kd-dl-skel kd-dl-skel--panel" />
      </div>
    </div>
  );
}

export function DeliveryPage({ account, notify }: { account: AccountInfo; notify: Notify }) {
  const entitlements = usePlanEntitlements(account);
  const restaurantId = getRestaurantId();
  const usage = usePlanUsage(restaurantId, entitlements);

  const [state, setState] = useState<DeliveryState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetchDeliveryState(restaurantId)
      .then(setState)
      .catch((err) => setError(friendlyError(err, "Não foi possível carregar as configurações do delivery.")))
      .finally(() => setLoading(false));
  }, [restaurantId]);

  useEffect(load, [load]);

  if (!entitlements.features.deliveryManagement) {
    return (
      <div className="kd-dl-page">
        <PageHeader kicker="Delivery" title="Pedidos pelo seu link" description="Receba pedidos de entrega pelo link do restaurante, sem comissão de marketplace." />
        <Callout
          tone="info"
          icon={<Bike size={18} aria-hidden />}
          title="Delivery disponível a partir do plano Pro"
          action={<ButtonLink href="/dashboard/plano" size="sm" variant="secondary">Ver planos</ButtonLink>}
        >
          Com o Pro, seus clientes pedem pelo link do restaurante e os pedidos chegam ao PDV.
        </Callout>
      </div>
    );
  }

  if (loading) return <DeliverySkeleton />;

  if (error || !state) {
    return (
      <div className="kd-dl-page">
        <PageHeader kicker="Delivery" title="Pedidos pelo seu link" />
        <Callout
          tone="danger"
          icon={<AlertTriangle size={18} aria-hidden />}
          title="Não foi possível carregar o delivery"
          role="alert"
          action={<Button size="sm" variant="secondary" onClick={load}>Tentar de novo</Button>}
        >
          {error || "Confira a conexão e tente de novo."}
        </Callout>
      </div>
    );
  }

  return <DeliveryConfigPanel state={state} usage={usage} restaurantId={restaurantId} notify={notify} onUpdate={(next) => setState((s) => (s ? { ...s, config: next } : s))} />;
}

function DeliveryConfigPanel({
  state,
  usage,
  restaurantId,
  notify,
  onUpdate,
}: {
  state: DeliveryState;
  usage: ReturnType<typeof usePlanUsage>;
  restaurantId: string;
  notify: Notify;
  onUpdate: (config: DeliveryConfig) => void;
}) {
  const { config, deliveryUrl } = state;
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState<ReadinessArea | null>(null);
  const [confirmPause, setConfirmPause] = useState(false);

  const feeMode: FeeMode = config.feeMode || "taxa_fixa";
  const fullUrl = deliveryUrl ? `${typeof window !== "undefined" ? window.location.origin : ""}${deliveryUrl}` : null;
  const issues = useMemo(() => deliveryReadiness(config, { onlineMethods: state.onlinePaymentMethods }), [config, state.onlinePaymentMethods]);

  const update = async (patch: Partial<DeliveryConfig>, success?: string): Promise<boolean> => {
    setSaving(true);
    try {
      const next = await saveDeliveryConfig(restaurantId, patch);
      onUpdate(next);
      if (success) notify(success);
      return true;
    } catch (err) {
      notify(friendlyError(err, "Não foi possível salvar."), "error");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const copyUrl = async () => {
    if (!fullUrl) return;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      notify("Não foi possível copiar. Selecione o link e copie manualmente.", "error");
    }
  };

  const usageTone: BadgeTone = usage.level === "full" || usage.level === "warn90" ? "signal" : usage.level === "warn70" ? "outline" : "neutral";
  const usagePercent = usage.limit ? Math.min(100, usage.percent) : 0;
  const cities = config.servedCities || [];
  const map = config.mapConfig;
  const activeMapZones = map ? [...map.distanceBands, ...map.customAreas].filter((zone) => zone.enabled).length : 0;
  const unavailableOnline = config.paymentMethods.filter((m) => ONLINE_PAYMENT_METHODS.has(m) && state.onlinePaymentMethods && !state.onlinePaymentMethods.includes(m));

  const feeValue =
    feeMode === "taxa_fixa" ? (config.deliveryFeeCents === 0 ? "Grátis" : brl(config.deliveryFeeCents)) : feeMode === "taxa_por_bairro" ? "Definida em cada bairro" : "Por faixa de distância ou área";
  const whereValue =
    feeMode === "area_mapa"
      ? map?.storeLocation
        ? `${activeMapZones} ${activeMapZones === 1 ? "faixa ou área ativa" : "faixas ou áreas ativas"} no mapa`
        : "Ponto da loja ainda não definido"
      : cities.length === 0
        ? feeMode === "taxa_fixa"
          ? "Qualquer endereço (nenhuma cidade restrita)"
          : "Nenhuma cidade cadastrada"
        : cities.map((c) => `${c.name} (${c.uf})${c.enabled === false ? ", pausada" : ""}`).join(" · ");

  return (
    <div className="kd-dl-page">
      <PageHeader kicker="Delivery" title="Pedidos pelo seu link" description="Seus clientes pedem pelo link do restaurante, sem comissão de marketplace. Os pedidos chegam ao PDV." />

      <div className="kd-dl-overview">
        <section className={`kd-dl-hero ${config.enabled ? "is-on" : ""}`} aria-labelledby="kd-dl-hero-title">
          <span className="kd-dl-hero-icon" aria-hidden>
            <Bike size={22} />
          </span>
          <div className="kd-dl-hero-body">
            <p className="kd-dl-hero-state">
              <span className="kd-dl-dot" aria-hidden />
              {config.enabled ? "Ativo" : "Desativado"}
            </p>
            <h2 id="kd-dl-hero-title">{config.enabled ? "Recebendo pedidos pelo link" : "O delivery está desativado"}</h2>
            <p className="kd-dl-hero-text">
              {config.enabled ? "Compartilhe o link no Instagram, no WhatsApp e no Google." : "Quem abrir o link vê que o delivery está indisponível. Ative quando estiver pronto para receber pedidos."}
            </p>
            {config.enabled && fullUrl && (
              <div className="kd-dl-link">
                <code title={fullUrl}>{fullUrl.replace(/^https?:\/\//, "")}</code>
                <div className="kd-dl-link-actions">
                  <Button size="sm" variant="secondary" icon={copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />} onClick={copyUrl} aria-live="polite">
                    {copied ? "Link copiado" : "Copiar link"}
                  </Button>
                  <ButtonLink size="sm" variant="secondary" href={fullUrl} external icon={<ExternalLink size={14} aria-hidden />}>
                    Abrir
                  </ButtonLink>
                </div>
              </div>
            )}
            <div className="kd-dl-hero-actions">
              {config.enabled ? (
                <Button variant="ghost" size="sm" className="kd-dl-pause" disabled={saving} onClick={() => setConfirmPause(true)}>
                  Desativar delivery
                </Button>
              ) : (
                <Button variant="primary" loading={saving} onClick={() => update({ enabled: true }, "Delivery ativado. O link já aceita pedidos.")}>
                  Ativar delivery
                </Button>
              )}
            </div>
          </div>
        </section>

        <section className="kd-dl-usage" aria-labelledby="kd-dl-usage-title">
          <h2 id="kd-dl-usage-title">Pedidos próprios neste mês</h2>
          <p className="kd-dl-usage-value">
            <strong className="kd-num">{usage.used}</strong>
            <span>{usage.limit !== null ? `de ${usage.limit}` : "sem limite no plano"}</span>
            {usage.limit !== null && (
              <Badge tone={usageTone}>{usage.level === "full" ? "Limite atingido" : `${usage.remaining ?? 0} restantes`}</Badge>
            )}
          </p>
          {usage.limit !== null && (
            <div
              className={`kd-dl-meter ${usage.level === "full" ? "is-full" : usage.level.startsWith("warn") ? "is-warn" : ""}`}
              role="progressbar"
              aria-label="Uso de pedidos próprios no mês"
              aria-valuemin={0}
              aria-valuemax={usage.limit}
              aria-valuenow={usage.used}
            >
              <i style={{ width: `${usagePercent}%` }} />
            </div>
          )}
          <p className="kd-dl-usage-note">Delivery, PDV e mesas somam juntos. Pedidos de iFood e outros marketplaces não contam.</p>
        </section>
      </div>

      {issues.length > 0 && (
        <Callout
          tone={config.enabled ? "warn" : "info"}
          icon={<AlertTriangle size={18} aria-hidden />}
          role={config.enabled ? "alert" : "status"}
          title={config.enabled ? "Clientes ainda não conseguem concluir pedidos" : "Antes de ativar, falta configurar"}
        >
          <ul className="kd-dl-issues">
            {issues.map((issue) => (
              <li key={issue.message}>
                {issue.message}{" "}
                <button type="button" className="kd-link-button" onClick={() => setEditing(issue.area)}>
                  {issue.area === "payment" ? "Ajustar pagamento" : "Ajustar áreas"}
                </button>
              </li>
            ))}
          </ul>
        </Callout>
      )}

      <div className="kd-dl-panels">
        <section className="kd-dl-panel" aria-labelledby="kd-dl-areas-title">
          <header className="kd-dl-panel-head">
            <span className="kd-dl-panel-icon" aria-hidden>
              <MapPin size={18} />
            </span>
            <div>
              <h2 id="kd-dl-areas-title">Taxa e área de entrega</h2>
              <p>Quanto custa a entrega e até onde você entrega.</p>
            </div>
          </header>
          <dl className="kd-dl-facts">
            <div>
              <dt>Cobrança</dt>
              <dd>{FEE_MODE_LABELS[feeMode]}</dd>
            </div>
            <div>
              <dt>Taxa</dt>
              <dd className="kd-num">{feeValue}</dd>
            </div>
            <div>
              <dt>Onde entrega</dt>
              <dd>{whereValue}</dd>
            </div>
          </dl>
          <Button variant="secondary" className="kd-dl-panel-action" onClick={() => setEditing("areas")}>
            Editar taxa e áreas
          </Button>
        </section>

        <section className="kd-dl-panel" aria-labelledby="kd-dl-order-title">
          <header className="kd-dl-panel-head">
            <span className="kd-dl-panel-icon" aria-hidden>
              <Wallet size={18} />
            </span>
            <div>
              <h2 id="kd-dl-order-title">Pedido e pagamento</h2>
              <p>O que o cliente vê antes de pedir e como pode pagar.</p>
            </div>
          </header>
          <dl className="kd-dl-facts">
            <div>
              <dt>Tempo estimado</dt>
              <dd>{config.deliveryEta || <span className="kd-dl-empty">Não informado</span>}</dd>
            </div>
            <div>
              <dt>Pedido mínimo</dt>
              <dd className="kd-num">{config.minOrderCents > 0 ? brl(config.minOrderCents) : <span className="kd-dl-empty">Sem mínimo</span>}</dd>
            </div>
            <div>
              <dt>Pagamento</dt>
              <dd>
                {config.paymentMethods.length ? (
                  <ul className="kd-dl-methods">
                    {config.paymentMethods.map((m) => (
                      <li key={m} className={unavailableOnline.includes(m) ? "is-off" : undefined} title={unavailableOnline.includes(m) ? "Indisponível agora: não aparece para o cliente" : undefined}>
                        {PAYMENT_METHOD_LABELS[m] || m}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="kd-dl-empty">Nenhuma forma selecionada</span>
                )}
              </dd>
            </div>
            {(config.deliveryArea || config.notes) && (
              <div>
                <dt>Recado ao cliente</dt>
                <dd>{[config.deliveryArea, config.notes].filter(Boolean).join(" · ")}</dd>
              </div>
            )}
          </dl>
          <Button variant="secondary" className="kd-dl-panel-action" onClick={() => setEditing("payment")}>
            Editar pedido e pagamento
          </Button>
        </section>
      </div>

      {editing === "payment" && (
        <DeliverySetupModal
          config={config}
          onlineMethods={state.onlinePaymentMethods}
          onSave={async (patch) => {
            if (await update(patch, "Pedido e pagamento salvos.")) setEditing(null);
          }}
          saving={saving}
          onClose={() => setEditing(null)}
        />
      )}

      {editing === "areas" && (
        <DeliveryAreasModal
          restaurantId={restaurantId}
          config={config}
          mapOrigin={state.mapOrigin || null}
          notify={notify}
          onConfigUpdate={(patch) => update(patch)}
          onConfigReplace={onUpdate}
          onClose={() => setEditing(null)}
        />
      )}

      {confirmPause && (
        <ConfirmDialog
          title="Desativar o delivery?"
          description="Clientes com o link aberto não conseguirão finalizar pedidos até você ativar de novo. Pedidos já recebidos continuam no PDV."
          confirmLabel="Desativar"
          onConfirm={() => update({ enabled: false }, "Delivery desativado. O link mostra que não há entregas agora.")}
          onClose={() => setConfirmPause(false)}
        />
      )}
    </div>
  );
}

/** Informações do pedido e formas de pagamento. A taxa e a área de entrega ficam no editor de áreas (um lugar só para cada coisa). */
function DeliverySetupModal({
  config,
  onlineMethods,
  saving,
  onSave,
  onClose,
}: {
  config: DeliveryConfig;
  onlineMethods?: string[];
  saving: boolean;
  onSave: (patch: Partial<DeliveryConfig>) => Promise<void>;
  onClose: () => void;
}) {
  const [eta, setEta] = useState(config.deliveryEta);
  const [area, setArea] = useState(config.deliveryArea);
  const [minOrder, setMinOrder] = useState(config.minOrderCents > 0 ? centsToInput(config.minOrderCents) : "");
  const [notes, setNotes] = useState(config.notes || "");
  const [methods, setMethods] = useState<string[]>(config.paymentMethods);
  const [errors, setErrors] = useState<{ minOrder?: string; methods?: string }>({});

  const dirty =
    eta !== config.deliveryEta ||
    area !== config.deliveryArea ||
    notes !== (config.notes || "") ||
    minOrder !== (config.minOrderCents > 0 ? centsToInput(config.minOrderCents) : "") ||
    methods.join() !== config.paymentMethods.join();

  const toggleMethod = (m: string) => {
    setMethods((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
    setErrors((e) => ({ ...e, methods: undefined }));
  };

  const handleSave = async () => {
    const minCents = parseMoneyCents(minOrder);
    const found: typeof errors = {};
    if (Number.isNaN(minCents)) found.minOrder = "Informe um valor como 30,00 ou deixe em branco.";
    if (!methods.length) found.methods = "Selecione ao menos uma forma de pagamento.";
    setErrors(found);
    if (found.minOrder) return document.getElementById("kd-dl-min")?.focus();
    if (found.methods) return;
    await onSave({
      deliveryEta: eta.trim(),
      deliveryArea: area.trim(),
      minOrderCents: minCents ?? 0,
      paymentMethods: methods,
      notes: notes.trim(),
    });
  };

  const chip = (m: string) => {
    const on = methods.includes(m);
    const unavailable = ONLINE_PAYMENT_METHODS.has(m) && onlineMethods !== undefined && !onlineMethods.includes(m);
    return (
      <button key={m} type="button" className="kd-chip-toggle" aria-pressed={on} disabled={unavailable && !on} onClick={() => toggleMethod(m)}>
        {on && <Check size={14} aria-hidden />}
        {SHORT_LABELS[m] || PAYMENT_METHOD_LABELS[m] || m}
      </button>
    );
  };
  const onlineBlocked = onlineMethods !== undefined && ONLINE_METHODS.some((m) => !onlineMethods.includes(m));

  return (
    <Modal
      title="Pedido e pagamento"
      description="O que aparece para o cliente no cardápio do delivery e no checkout."
      onClose={onClose}
      busy={saving}
      dirty={dirty}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" loading={saving} icon={<Check size={15} aria-hidden />} onClick={handleSave}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="kd-dl-form">
        <div className="kd-dl-form-grid">
          <TextField label="Tempo estimado de entrega" value={eta} maxLength={60} onChange={(e) => setEta(e.target.value)} placeholder="Ex.: 30 a 45 min" hint="Aparece no topo do cardápio do delivery." />
          <TextField
            id="kd-dl-min"
            label="Pedido mínimo (R$)"
            value={minOrder}
            error={errors.minOrder}
            onChange={(e) => {
              setMinOrder(e.target.value);
              setErrors((x) => ({ ...x, minOrder: undefined }));
            }}
            placeholder="0,00"
            inputMode="decimal"
            hint="Em branco: sem pedido mínimo. Não inclui a taxa de entrega."
          />
        </div>
        <TextField label="Área de atendimento (texto)" optional value={area} maxLength={200} onChange={(e) => setArea(e.target.value)} placeholder="Ex.: Centro e bairros vizinhos" hint="Mostrado acima do endereço no checkout. As regras de entrega ficam em Taxa e área de entrega." />
        <TextArea label="Recado para o cliente" optional rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: Embalagens recicláveis. Não aceitamos notas acima de R$ 100." maxLength={500} hint="Aparece nas informações de entrega e horários." />

        <fieldset className="kd-dl-pay" aria-describedby={errors.methods ? "kd-dl-methods-msg" : undefined}>
          <legend>Formas de pagamento</legend>
          <div className="kd-dl-pay-group">
            <p>Na entrega</p>
            <div className="kd-row">{ON_DELIVERY_METHODS.map(chip)}</div>
          </div>
          <div className="kd-dl-pay-group">
            <p>Online, pago ao pedir (Mercado Pago)</p>
            <div className="kd-row">{ONLINE_METHODS.map(chip)}</div>
            {onlineBlocked && <small className="kd-hint">Pagamento online indisponível nesta conta no momento: as opções desativadas não aparecem para o cliente.</small>}
          </div>
          {errors.methods && (
            <p id="kd-dl-methods-msg" className="kd-error" role="alert">
              {errors.methods}
            </p>
          )}
        </fieldset>
      </div>
    </Modal>
  );
}
