"use client";

import { useCallback, useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { RotateCw } from "lucide-react";
import { getDb } from "@/lib/firebase";
import { friendlyError, withTimeout } from "@/lib/async";
import { adminSubscriptionAction, type AdminRestaurant } from "@/lib/admin-db";
import { FEATURE_KEYS, PLAN_CATALOG, PLAN_ORDER, orderQuota, resolveEntitlements, shortPlanName, toDate, usagePeriod, type FeatureKey, type StoredSubscription } from "@/lib/billing/plans";
import { Badge, Button, Callout, Card, CardHead, EmptyState, SelectField, Skeleton, TextArea, TextField } from "@/components/ui";
import type { Notify } from "@/components/dashboard/types";

const STATUSES: [string, string][] = [
  ["active", "Ativa"],
  ["trialing", "Teste"],
  ["past_due", "Pagamento pendente"],
  ["canceled", "Cancelada (vale até o fim do período)"],
  ["expired", "Expirada"],
  ["suspended", "Suspensa"],
];

const FEATURE_LABEL: Record<FeatureKey, string> = {
  videoMenu: "Cardápio em vídeo",
  qrCode: "QR Code",
  waiterCall: "Chamar garçom",
  billRequest: "Pedir a conta",
  customBranding: "Cores e logotipo",
  pdvAccess: "PDV",
  orderManagement: "Pedidos",
  cashRegister: "Caixa",
  inventory: "Estoque",
  financialManagement: "Financeiro",
  deliveryManagement: "Entregas",
  courierManagement: "Entregadores",
  reports: "Relatórios",
  promotions: "Promoções",
  marketplaceIntegrations: "Marketplaces",
  multiUnit: "Múltiplas unidades",
  prioritySupport: "Suporte prioritário",
};

const limitText = (value: number | null | undefined) => (value === null ? "ilimitado" : value === undefined ? "" : String(value));
const dateInput = (value: unknown) => toDate(value)?.toISOString().slice(0, 10) || "";

/**
 * Assinatura de um estabelecimento na administração: plano, situação, fim do período, valor e personalizações
 * (Enterprise ou condições especiais). Tudo passa pelo servidor, com motivo obrigatório e registro antes/depois.
 */
export function SubscriptionAdminCard({ restaurant, notify, onDone }: { restaurant: AdminRestaurant; notify: Notify; onDone: () => void }) {
  const stored = (restaurant.subscription || null) as StoredSubscription | null;
  const e = resolveEntitlements(stored, { createdAt: restaurant.rawCreatedAt, restaurantStatus: restaurant.suspended ? "suspended" : "active" });
  const [form, setForm] = useState({
    planId: e.planId as string,
    status: e.status as string,
    periodEnd: dateInput(stored?.currentPeriodEnd || stored?.nextPaymentDate),
    price: stored?.priceCents ? (stored.priceCents / 100).toFixed(2).replace(".", ",") : "",
    maxTables: limitText(stored?.customLimits?.maxTables),
    maxOrders: limitText(stored?.customLimits?.maxNativeOrdersPerMonth),
    features: { ...(stored?.customFeatures || {}) } as Partial<Record<FeatureKey, boolean>>,
    reason: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [usage, setUsage] = useState<{ used: number; checked?: string } | null>(null);
  const period = usagePeriod();

  useEffect(() => {
    getDoc(doc(getDb(), "restaurantes", restaurant.id, "uso", period.periodId))
      .then((snap) => setUsage({ used: Number(snap.get("nativeOrdersUsed")) || 0 }))
      .catch(() => setUsage({ used: 0 }));
  }, [restaurant.id, period.periodId]);

  const save = async () => {
    setError("");
    if (form.reason.trim().length < 5) return setError("Informe o motivo da alteração.");
    setSaving(true);
    try {
      const cents = form.price.trim() ? Math.round(Number(form.price.replace(/\./g, "").replace(",", ".")) * 100) : undefined;
      const parse = (v: string) => (v.trim() === "" ? undefined : v.trim().toLowerCase() === "ilimitado" ? null : Number(v));
      await adminSubscriptionAction({
        restaurantId: restaurant.id,
        action: "set_subscription",
        reason: form.reason.trim(),
        planId: form.planId,
        status: form.status,
        currentPeriodEnd: form.periodEnd ? new Date(`${form.periodEnd}T23:59:59-03:00`).toISOString() : null,
        ...(cents !== undefined && Number.isFinite(cents) ? { priceCents: cents } : {}),
        customLimits: { maxTables: parse(form.maxTables), maxNativeOrdersPerMonth: parse(form.maxOrders) },
        customFeatures: form.features,
      });
      notify("Assinatura atualizada e registrada no histórico");
      setForm((f) => ({ ...f, reason: "" }));
      onDone();
    } catch (err) {
      setError(friendlyError(err, "Não foi possível salvar a alteração."));
    } finally {
      setSaving(false);
    }
  };

  const reconcile = async (apply: boolean) => {
    try {
      const result = await adminSubscriptionAction({ restaurantId: restaurant.id, action: "reconcile_usage", periodId: period.periodId, apply, reason: apply ? form.reason.trim() : undefined });
      setUsage({ used: result.applied ? result.confirmed : result.recorded, checked: result.consistent ? "Contador confere com os pedidos confirmados." : `Contador ${result.recorded}, pedidos confirmados ${result.confirmed}.` });
      notify(result.applied ? "Consumo corrigido e registrado" : result.consistent ? "Consumo conferido: tudo certo" : "Há diferença no consumo: informe o motivo e corrija.");
    } catch (err) {
      notify(friendlyError(err, "Não foi possível conferir o consumo."), "error");
    }
  };

  const quota = orderQuota(usage?.used || 0, e.limits.maxNativeOrdersPerMonth);
  return (
    <Card aria-labelledby="adm-billing">
      <CardHead id="adm-billing" kicker="Plano e limites" title={`${e.planName}${e.valid ? "" : " · sem acesso"}`} />
      <dl className="kd-facts-list">
        <div>
          <dt>Pedidos próprios em {period.periodId}</dt>
          <dd className="kd-num">{usage ? `${quota.used} / ${e.limits.maxNativeOrdersPerMonth === null ? "ilimitado" : e.limits.maxNativeOrdersPerMonth}` : "…"}</dd>
        </div>
        <div>
          <dt>Mesas (limite)</dt>
          <dd className="kd-num">{e.limits.maxTables === null ? "Ilimitadas" : e.limits.maxTables}</dd>
        </div>
        <div>
          <dt>PDV</dt>
          <dd>{e.features.pdvAccess ? "Liberado" : "Bloqueado"}</dd>
        </div>
      </dl>
      {usage?.checked && <p className="kd-hint">{usage.checked}</p>}
      <div className="kd-row">
        <Button size="sm" variant="secondary" onClick={() => reconcile(false)}>
          Conferir consumo
        </Button>
        <Button size="sm" variant="ghost" onClick={() => reconcile(true)}>
          Corrigir consumo
        </Button>
      </div>
      <div className="kd-admin-form">
        <SelectField label="Plano" value={form.planId} onChange={(ev) => setForm((f) => ({ ...f, planId: ev.target.value }))}>
          {PLAN_ORDER.map((id) => (
            <option key={id} value={id}>
              {PLAN_CATALOG[id].name}
            </option>
          ))}
        </SelectField>
        <SelectField label="Situação" value={form.status} onChange={(ev) => setForm((f) => ({ ...f, status: ev.target.value }))}>
          {STATUSES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
        <TextField label="Fim do período pago" type="date" value={form.periodEnd} onChange={(ev) => setForm((f) => ({ ...f, periodEnd: ev.target.value }))} />
        <TextField label="Valor mensal (R$)" optional inputMode="decimal" placeholder="Ex.: 899,00" value={form.price} onChange={(ev) => setForm((f) => ({ ...f, price: ev.target.value }))} />
        <TextField label="Limite de mesas" optional hint="Vazio: o do plano. “ilimitado”: sem limite." value={form.maxTables} onChange={(ev) => setForm((f) => ({ ...f, maxTables: ev.target.value }))} />
        <TextField label="Pedidos próprios por mês" optional hint="Vazio: o do plano. “ilimitado”: sem limite." value={form.maxOrders} onChange={(ev) => setForm((f) => ({ ...f, maxOrders: ev.target.value }))} />
      </div>
      <fieldset className="kd-admin-features">
        <legend className="kd-label">Recursos personalizados (sobrepõem o plano)</legend>
        {FEATURE_KEYS.map((key) => {
          const value = form.features[key];
          return (
            <label key={key} className="kd-admin-feature">
              <select
                aria-label={FEATURE_LABEL[key]}
                value={value === undefined ? "" : value ? "on" : "off"}
                onChange={(ev) =>
                  setForm((f) => {
                    const features = { ...f.features };
                    if (ev.target.value === "") delete features[key];
                    else features[key] = ev.target.value === "on";
                    return { ...f, features };
                  })
                }
              >
                <option value="">Do plano</option>
                <option value="on">Liberado</option>
                <option value="off">Bloqueado</option>
              </select>
              <span>{FEATURE_LABEL[key]}</span>
            </label>
          );
        })}
      </fieldset>
      <TextArea label="Motivo da alteração" value={form.reason} maxLength={500} rows={2} placeholder="Ex.: contrato Enterprise assinado em 10/11, 2 unidades" onChange={(ev) => setForm((f) => ({ ...f, reason: ev.target.value }))} />
      {error && (
        <p className="kd-form-error" role="alert">
          {error}
        </p>
      )}
      <Button onClick={save} loading={saving}>
        {saving ? "Salvando…" : "Salvar assinatura"}
      </Button>
      <p className="kd-hint">A alteração vale na hora no painel e no PDV e fica registrada com o seu e-mail e o motivo.</p>
    </Card>
  );
}

type Proposal = { id: string; name: string; email: string; company: string; phone?: string; units?: string; monthlyOrders?: string; message?: string; createdAt: string; status: string };
type Failure = { id: string; kind: string; restaurantId?: string; createdAt: string };

const FAILURE_LABEL: Record<string, string> = {
  offer_mismatch: "Pagamento com oferta diferente do plano escolhido (plano não ativado)",
  unknown_offer: "Pagamento de oferta desconhecida (plano não ativado)",
  cancel_previous_subscription: "Assinatura anterior não foi cancelada na Cakto depois do upgrade",
  event_for_replaced_subscription: "Evento de uma assinatura já substituída",
  webhook_restaurant_not_found: "Pagamento sem estabelecimento identificado",
  refund_of_other_payment: "Estorno de um pagamento que não é o atual",
};

/** Propostas Enterprise recebidas e falhas de sincronização com a cobrança que precisam de atenção. */
export function BillingOpsPanel({ notify }: { notify: Notify }) {
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [failures, setFailures] = useState<Failure[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const db = getDb();
      const [p, f] = await Promise.all([
        withTimeout(getDocs(query(collection(db, "propostasEnterprise"), orderBy("createdAt", "desc"), limit(20)))),
        withTimeout(getDocs(query(collection(db, "falhasSincronizacao"), where("resolved", "==", false), limit(30)))),
      ]);
      setProposals(p.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Proposal, "id">) })));
      setFailures(f.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Failure, "id">) }) as Failure).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))));
    } catch (err) {
      setError(friendlyError(err, "Não foi possível carregar."));
      setProposals([]);
      setFailures([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const resolve = async (failure: Failure) => {
    const reason = window.prompt("Como foi resolvido? (fica registrado)");
    if (!reason || reason.trim().length < 5) return;
    try {
      await adminSubscriptionAction({ action: "resolve_failure", failureId: failure.id, reason: reason.trim(), restaurantId: failure.restaurantId || "" });
      notify("Marcada como resolvida");
      load();
    } catch (err) {
      notify(friendlyError(err, "Não foi possível registrar."), "error");
    }
  };

  return (
    <div className="kd-split">
      <Card aria-labelledby="adm-failures">
        <CardHead
          id="adm-failures"
          kicker="Cobrança"
          title="Falhas de sincronização"
          action={
            <Button size="sm" variant="ghost" icon={<RotateCw size={14} />} onClick={load}>
              Atualizar
            </Button>
          }
        />
        {error && <Callout tone="warn" title={error} />}
        {failures === null ? (
          <Skeleton rows={2} height={40} />
        ) : failures.length ? (
          <ul className="kd-admin-list is-static">
            {failures.map((f) => (
              <li key={f.id}>
                <span className="kd-admin-list-main">
                  <b>{FAILURE_LABEL[f.kind] || f.kind}</b>
                  <small className="kd-num">
                    {toDate(f.createdAt)?.toLocaleString("pt-BR")} {f.restaurantId ? `· ${f.restaurantId}` : ""}
                  </small>
                </span>
                <Button size="sm" variant="secondary" onClick={() => resolve(f)}>
                  Resolvida
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact title="Nenhuma falha pendente" description="Pagamentos e eventos da Cakto estão sincronizados." />
        )}
      </Card>
      <Card aria-labelledby="adm-proposals">
        <CardHead id="adm-proposals" kicker="Enterprise" title="Pedidos de proposta" />
        {proposals === null ? (
          <Skeleton rows={2} height={40} />
        ) : proposals.length ? (
          <ul className="kd-admin-list is-static">
            {proposals.map((p) => (
              <li key={p.id}>
                <span className="kd-admin-list-main">
                  <b>
                    {p.company} · {p.name}
                  </b>
                  <small>
                    <a href={`mailto:${p.email}`}>{p.email}</a>
                    {p.phone ? ` · ${p.phone}` : ""}
                    {p.units ? ` · ${p.units} unidades` : ""}
                    {p.monthlyOrders ? ` · ~${p.monthlyOrders} pedidos/mês` : ""}
                  </small>
                  {p.message && <small>{p.message}</small>}
                </span>
                <Badge tone="outline">{toDate(p.createdAt)?.toLocaleDateString("pt-BR")}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact title="Nenhum pedido de proposta" description="Os pedidos feitos em “Falar com vendas” aparecem aqui." />
        )}
      </Card>
    </div>
  );
}

export const adminPlanName = (planId: string | undefined) => (planId === "essencial" ? "Start (antigo Essencial)" : shortPlanName(planId));
