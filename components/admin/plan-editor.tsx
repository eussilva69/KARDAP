"use client";

import { useEffect, useState } from "react";
import { getFirebaseAuth } from "@/lib/auth";
import { friendlyError } from "@/lib/async";
import { brl } from "@/lib/format";
import { PLAN_CATALOG, PLAN_ORDER, type PlanId } from "@/lib/billing/plans";
import type { ResolvedPlan } from "@/lib/billing/catalog-db";
import { Button, Card, CardHead, Modal, Skeleton, TextArea, TextField } from "@/components/ui";
import type { Notify } from "@/components/dashboard/types";

/**
 * Lê e grava os overrides do catálogo via /api/admin/planos. O endpoint só responde para contas em admins/{uid};
 * se um não-admin abrir esta tela, a lista vem vazia com erro — o próprio AdminPanel já barra antes.
 */

type AdminPlan = ResolvedPlan & { hasOverride: boolean };

async function fetchWithToken(url: string, init?: RequestInit) {
  const token = await getFirebaseAuth().currentUser?.getIdToken();
  if (!token) throw new Error("Sessão expirada. Entre de novo.");
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.message || `Falha na requisição (${res.status}).`);
  }
  return res.json();
}

export function PlanCatalogEditor({ notify }: { notify: Notify }) {
  const [plans, setPlans] = useState<AdminPlan[] | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<PlanId | null>(null);

  const load = async () => {
    setError("");
    try {
      const data = await fetchWithToken("/api/admin/planos");
      setPlans(data.plans);
    } catch (err) {
      setError(friendlyError(err, "Não foi possível carregar o catálogo."));
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onSaved = async () => {
    setEditing(null);
    await load();
    notify("Plano atualizado. A página pública usa o novo valor em até 30 s.");
  };

  const current = plans?.find((p) => p.id === editing) || null;

  return (
    <Card>
      <CardHead
        kicker="Catálogo"
        title="Editor de planos"
        action={
          <Button size="sm" variant="secondary" onClick={load}>
            Atualizar
          </Button>
        }
      />
      {error ? (
        <p className="kd-state-text" role="alert">
          {error}
        </p>
      ) : !plans ? (
        <Skeleton rows={4} height={64} label="Carregando catálogo" />
      ) : (
        <ul className="kd-plan-edit-list">
          {plans.map((plan) => (
            <li key={plan.id} className="kd-plan-edit-row">
              <div>
                <strong>{plan.name}</strong>
                <span className="kd-muted" style={{ display: "block", fontSize: 13 }}>
                  {plan.priceInCents === null ? "Sob consulta" : `${brl(plan.priceInCents)} / mês`} · {plan.active ? "Ativo" : "Inativo"} · {plan.isPublic ? "Público" : "Oculto"}
                  {plan.popular ? " · Destaque" : ""}
                  {plan.hasOverride ? " · Personalizado" : " · Padrão"}
                </span>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setEditing(plan.id)}>
                Editar
              </Button>
            </li>
          ))}
        </ul>
      )}
      {current && (
        <PlanEditorModal
          key={current.id}
          plan={current}
          onCancel={() => setEditing(null)}
          onSaved={onSaved}
          onNotifyError={(message) => notify(message, "error")}
        />
      )}
    </Card>
  );
}

/** Modal de edição de um plano. Preenche com o estado resolvido atual e envia um PUT com os campos preenchidos. */
function PlanEditorModal({ plan, onCancel, onSaved, onNotifyError }: { plan: AdminPlan; onCancel: () => void; onSaved: () => void; onNotifyError: (message: string) => void }) {
  const base = PLAN_CATALOG[plan.id];
  const [name, setName] = useState(plan.name);
  const [tagline, setTagline] = useState(plan.tagline);
  const [description, setDescription] = useState(plan.description);
  const [priceReais, setPriceReais] = useState(plan.priceInCents === null ? "" : (plan.priceInCents / 100).toFixed(2));
  const [priceUnset, setPriceUnset] = useState(plan.priceInCents === null);
  const [highlights, setHighlights] = useState(plan.highlights.join("\n"));
  const [active, setActive] = useState(plan.active);
  const [isPublic, setIsPublic] = useState(plan.isPublic);
  const [popular, setPopular] = useState(plan.popular);
  const [salesOnly, setSalesOnly] = useState(plan.salesOnly);
  const [trialDays, setTrialDays] = useState(String(plan.trialDays));
  const [ctaLabel, setCtaLabel] = useState(plan.ctaLabel);
  const [sortOrder, setSortOrder] = useState(String(plan.sortOrder));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const priceInCents = priceUnset ? null : Math.round(parseFloat(priceReais.replace(",", ".")) * 100);
      if (!priceUnset && (!Number.isFinite(priceInCents) || (priceInCents as number) < 0)) {
        throw new Error("Preço inválido. Use valor em reais, ex.: 149,90.");
      }
      await fetchWithToken(`/api/admin/planos/${plan.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name,
          tagline,
          description,
          priceInCents,
          highlights: highlights.split("\n").map((h) => h.trim()).filter(Boolean),
          active,
          isPublic,
          popular,
          salesOnly,
          trialDays: Math.max(0, Math.min(90, parseInt(trialDays, 10) || 0)),
          ctaLabel,
          sortOrder: Math.max(0, Math.min(999, parseInt(sortOrder, 10) || 0)),
        }),
      });
      onSaved();
    } catch (err) {
      onNotifyError(friendlyError(err, "Não foi possível salvar o plano."));
    } finally {
      setSaving(false);
    }
  };

  const resetToDefault = async () => {
    if (!confirm(`Remover a personalização de "${base.name}" e voltar ao padrão do código?`)) return;
    setSaving(true);
    try {
      await fetchWithToken(`/api/admin/planos/${plan.id}`, { method: "DELETE" });
      onSaved();
    } catch (err) {
      onNotifyError(friendlyError(err, "Não foi possível remover a personalização."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      onClose={onCancel}
      title={`Editar ${base.name}`}
      busy={saving}
      footer={
        <>
          {plan.hasOverride && (
            <Button variant="ghost" onClick={resetToDefault} disabled={saving}>
              Voltar ao padrão
            </Button>
          )}
          <Button variant="secondary" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} loading={saving}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="kd-stack-sm">
        <TextField label="Nome exibido" value={name} onChange={(e) => setName(e.target.value)} />
        <TextField label="Subtítulo (tagline)" value={tagline} onChange={(e) => setTagline(e.target.value)} />
        <TextArea label="Descrição" value={description} rows={3} onChange={(e) => setDescription(e.target.value)} />
        <div className="kd-row" style={{ gap: 12, alignItems: "flex-end" }}>
          <TextField
            label="Preço (R$ por mês)"
            value={priceReais}
            disabled={priceUnset}
            inputMode="decimal"
            placeholder="149,90"
            onChange={(e) => setPriceReais(e.target.value)}
          />
          <label className="kd-row" style={{ alignItems: "center", gap: 6, paddingBottom: 10 }}>
            <input type="checkbox" checked={priceUnset} onChange={(e) => setPriceUnset(e.target.checked)} />
            Sob consulta
          </label>
        </div>
        <TextArea
          label={`Benefícios (um por linha, ${highlights.split("\n").filter(Boolean).length}/20)`}
          value={highlights}
          rows={6}
          onChange={(e) => setHighlights(e.target.value)}
        />
        <div className="kd-row" style={{ gap: 12, flexWrap: "wrap" }}>
          <Toggle label="Ativo" value={active} onChange={setActive} />
          <Toggle label="Visível na página pública" value={isPublic} onChange={setIsPublic} />
          <Toggle label="Destaque (Mais Popular)" value={popular} onChange={setPopular} />
          <Toggle label="Só por time comercial" value={salesOnly} onChange={setSalesOnly} />
        </div>
        <div className="kd-row" style={{ gap: 12 }}>
          <TextField label="Dias de teste grátis" value={trialDays} inputMode="numeric" onChange={(e) => setTrialDays(e.target.value)} />
          <TextField label="Ordem de exibição" value={sortOrder} inputMode="numeric" onChange={(e) => setSortOrder(e.target.value)} />
          <TextField label="Texto do botão" value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} />
        </div>
        <p className="kd-hint">
          Limites de mesas e pedidos e as funcionalidades (PDV, estoque, etc) seguem o padrão do código ({base.limits.maxTables === null ? "mesas ilimitadas" : `${base.limits.maxTables} mesas`}, {base.limits.maxNativeOrdersPerMonth === null ? "pedidos ilimitados" : `${base.limits.maxNativeOrdersPerMonth} pedidos/mês`}). Trocar isso aqui exige revisão técnica — fale com o time antes.
        </p>
        <p className="kd-hint">
          O ID técnico <code>{plan.id}</code> nunca muda; é o que o sistema usa para controlar o acesso.
        </p>
      </div>
    </Modal>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="kd-row" style={{ alignItems: "center", gap: 6 }}>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
