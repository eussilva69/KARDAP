"use client";

import { useCallback, useEffect, useState } from "react";
import { Bike, Check, Copy, ExternalLink, Link2, LoaderCircle, ShoppingBag } from "lucide-react";
import { getRestaurantId } from "@/lib/restaurant-db";
import { friendlyError } from "@/lib/async";
import { brl } from "@/lib/format";
import { usePlanEntitlements, usePlanUsage } from "@/components/billing/hooks";
import type { AccountInfo } from "./types";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardHead,
  PageHeader,
  Skeleton,
  Switch,
  TextField,
  type BadgeTone,
} from "@/components/ui";
import type { DeliveryConfig, FeeMode } from "@/lib/delivery/types";
import { PAYMENT_METHOD_LABELS, DEFAULT_DELIVERY_CONFIG } from "@/lib/delivery/types";
import { DeliveryAreasManager } from "./delivery-areas";

type Notify = (message: string, tone?: "success" | "error") => void;

type DeliveryState = {
  config: DeliveryConfig;
  usage: { periodId: string; used: number; limit: number | null; remaining: number | null; level: string; blocked: boolean };
  deliveryUrl: string | null;
  planAllowsDelivery: boolean;
  subscriptionValid: boolean;
};

async function fetchDeliveryState(restaurantId: string): Promise<DeliveryState> {
  const { getFirebaseAuth } = await import("@/lib/auth");
  const token = await getFirebaseAuth().currentUser?.getIdToken();
  if (!token) throw new Error("Sessão expirada.");
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
  if (!token) throw new Error("Sessão expirada.");
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

export function DeliveryPage({ account, notify }: { account: AccountInfo; notify: Notify }) {
  const entitlements = usePlanEntitlements(account);
  const restaurantId = getRestaurantId();
  const usage = usePlanUsage(restaurantId, entitlements);

  const [state, setState] = useState<DeliveryState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

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
      <div>
        <PageHeader title="Delivery" />
        <Callout
          tone="info"
          icon={<Bike size={18} />}
          title="Delivery disponível a partir do plano Pro"
          action={<ButtonLink href="/dashboard/plano" size="sm" variant="secondary">Ver planos</ButtonLink>}
        >
          O delivery próprio permite receber pedidos diretamente pelo link do seu restaurante, sem comissão de marketplace.
          Faça upgrade para o Pro ou superior para ativar.
        </Callout>
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Delivery" />
        <Card><Skeleton height={200} /></Card>
      </div>
    );
  }

  if (error || !state) {
    return (
      <div>
        <PageHeader title="Delivery" />
        <Callout tone="danger" title="Erro ao carregar">{error || "Tente de novo."}</Callout>
        <Button onClick={load} style={{ marginTop: 12 }}>Tentar de novo</Button>
      </div>
    );
  }

  return (
    <DeliveryConfigPanel
      state={state}
      usage={usage}
      restaurantId={restaurantId}
      notify={notify}
      saving={saving}
      setSaving={setSaving}
      onUpdate={(next) => setState((s) => s ? { ...s, config: next } : s)}
    />
  );
}

function DeliveryConfigPanel({
  state,
  usage,
  restaurantId,
  notify,
  saving,
  setSaving,
  onUpdate,
}: {
  state: DeliveryState;
  usage: ReturnType<typeof usePlanUsage>;
  restaurantId: string;
  notify: Notify;
  saving: boolean;
  setSaving: (v: boolean) => void;
  onUpdate: (config: DeliveryConfig) => void;
}) {
  const { config, deliveryUrl } = state;
  const [copied, setCopied] = useState(false);

  const [feeCents, setFeeCents] = useState(String((config.deliveryFeeCents / 100).toFixed(2).replace(".", ",")));
  const [eta, setEta] = useState(config.deliveryEta);
  const [area, setArea] = useState(config.deliveryArea);
  const [minOrderCents, setMinOrderCents] = useState(String(config.minOrderCents > 0 ? (config.minOrderCents / 100).toFixed(2).replace(".", ",") : ""));
  const [methods, setMethods] = useState<string[]>(config.paymentMethods);
  const [notes, setNotes] = useState(config.notes || "");
  const feeMode: FeeMode = config.feeMode || "taxa_fixa";

  const fullUrl = deliveryUrl ? `${typeof window !== "undefined" ? window.location.origin : ""}${deliveryUrl}` : null;

  const toggleEnabled = async () => {
    setSaving(true);
    try {
      const next = await saveDeliveryConfig(restaurantId, { enabled: !config.enabled });
      onUpdate(next);
      notify(next.enabled ? "Delivery ativado!" : "Delivery desativado.");
    } catch (err) {
      notify(friendlyError(err, "Não foi possível salvar."), "error");
    } finally {
      setSaving(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const parseFee = Number(feeCents.replace(",", ".")) || 0;
      const parseMin = Number(minOrderCents.replace(",", ".")) || 0;
      const next = await saveDeliveryConfig(restaurantId, {
        deliveryFeeCents: Math.round(parseFee * 100),
        deliveryEta: eta.trim(),
        deliveryArea: area.trim(),
        minOrderCents: Math.round(parseMin * 100),
        paymentMethods: methods,
        notes: notes.trim(),
        feeMode: config.feeMode || "taxa_fixa",
      });
      onUpdate(next);
      notify("Configurações do delivery salvas.");
    } catch (err) {
      notify(friendlyError(err, "Não foi possível salvar."), "error");
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
      notify("Link copiado!");
    } catch {
      notify("Não foi possível copiar. Selecione e copie manualmente.", "error");
    }
  };

  const toggleMethod = (method: string) => {
    setMethods((prev) => prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method]);
  };

  const usageTone: BadgeTone = usage.level === "full" ? "signal" : usage.level === "warn90" ? "signal" : usage.level === "warn70" ? "outline" : "neutral";

  return (
    <div>
      <PageHeader title="Delivery" />

      <Card style={{ marginBottom: 16 }}>
        <CardHead title="Status do delivery" />
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 16px 16px" }}>
          <Switch label="Ativar delivery" checked={config.enabled} onChange={toggleEnabled} disabled={saving} />
          <span style={{ fontWeight: 500 }}>{config.enabled ? "Ativado" : "Desativado"}</span>
          {config.enabled && <Badge tone="neutral">Recebendo pedidos</Badge>}
        </div>
      </Card>

      {config.enabled && fullUrl && (
        <Card style={{ marginBottom: 16 }}>
          <CardHead title="Link do delivery" />
          <div style={{ padding: "0 16px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Link2 size={15} />
              <code style={{ fontSize: 13, wordBreak: "break-all", flex: 1 }}>{fullUrl}</code>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button size="sm" icon={copied ? <Check size={14} /> : <Copy size={14} />} onClick={copyUrl}>
                {copied ? "Copiado" : "Copiar link"}
              </Button>
              <Button size="sm" variant="secondary" icon={<ExternalLink size={14} />} onClick={() => window.open(fullUrl, "_blank")}>
                Abrir
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card style={{ marginBottom: 16 }}>
        <CardHead title="Uso mensal de pedidos" />
        <div style={{ padding: "0 16px 16px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 28, fontWeight: 700 }}>{usage.used}</span>
            <span style={{ color: "var(--kd-muted)" }}>
              {usage.limit !== null ? `de ${usage.limit} pedidos próprios` : "pedidos próprios (ilimitado)"}
            </span>
            <Badge tone={usageTone}>
              {usage.level === "full" ? "Limite atingido" : usage.remaining !== null ? `${usage.remaining} restantes` : "OK"}
            </Badge>
          </div>
          {usage.limit !== null && (
            <div style={{ height: 6, borderRadius: 3, background: "var(--kd-border)", overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 3, width: `${Math.min(100, usage.percent)}%`, background: usage.level === "full" ? "var(--kd-danger)" : usage.level.startsWith("warn") ? "var(--kd-warning)" : "var(--kd-accent)" }} />
            </div>
          )}
          <p style={{ fontSize: 12, color: "var(--kd-muted)", marginTop: 6 }}>
            Pedidos próprios compartilhados entre delivery, PDV e mesas. Pedidos de iFood e outros marketplaces não contam.
          </p>
        </div>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <CardHead title="Configurações do delivery" />
        <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          {feeMode === "taxa_fixa" && (
            <TextField label="Taxa de entrega (R$)" value={feeCents} onChange={(e) => setFeeCents(e.target.value)} placeholder="0,00" inputMode="decimal" />
          )}
          <TextField label="Tempo estimado de entrega" value={eta} onChange={(e) => setEta(e.target.value)} placeholder="30-45 min" />
          <TextField label="Área de entrega" value={area} onChange={(e) => setArea(e.target.value)} placeholder="Até 5 km do centro" />
          <TextField label="Pedido mínimo (R$)" value={minOrderCents} onChange={(e) => setMinOrderCents(e.target.value)} placeholder="0,00" inputMode="decimal" />

          <div>
            <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 6 }}>Formas de pagamento</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {Object.entries(PAYMENT_METHOD_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleMethod(key)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: "1px solid var(--kd-border)",
                    background: methods.includes(key) ? "var(--kd-accent)" : "transparent",
                    color: methods.includes(key) ? "#fff" : "inherit",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <TextField label="Observações" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Informações extras para o cliente" />

          <Button onClick={saveSettings} disabled={saving} icon={saving ? <LoaderCircle size={14} className="kd-spin" /> : <Check size={14} />}>
            Salvar configurações
          </Button>
        </div>
      </Card>

      <DeliveryAreasManager
        restaurantId={restaurantId}
        config={config}
        notify={notify}
        onConfigUpdate={async (patch) => {
          setSaving(true);
          try {
            const next = await saveDeliveryConfig(restaurantId, patch);
            onUpdate(next);
          } catch (err) {
            notify(friendlyError(err, "Não foi possível salvar."), "error");
          } finally {
            setSaving(false);
          }
        }}
      />
    </div>
  );
}
