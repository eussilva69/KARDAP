import type { NextRequest } from "next/server";
import { authenticate, errorResponse, json, readJson } from "@/lib/billing/http";
import { applySubscriptionChange, BillingError, reconcileUsage, type Actor } from "@/lib/billing/server";
import { CATALOG_VERSION, FEATURE_KEYS, isPeriodId, isPlanId, normalizeStatus, resolveEntitlements, shortPlanName, type FeatureKey, type PlanLimits, type StoredSubscription } from "@/lib/billing/plans";
import { adminDb } from "@/lib/firebase-admin";

/**
 * Ações da administração do KARDAP sobre assinaturas (somente administradores em admins/{uid}).
 * Toda alteração registra administrador, estabelecimento, valor anterior, novo valor, data e motivo
 * (adminLog e restaurantes/{id}/eventosAssinatura). Donos de restaurante não chegam aqui.
 *
 * Corpo: { restaurantId, action, reason, ... }
 * - extend_trial { days: 7 | 15 | 30 }
 * - set_subscription { planId, status, currentPeriodEnd?, priceCents?, customLimits?, customFeatures? }
 * - reconcile_usage { periodId, apply? }
 * - resolve_failure { failureId }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

function limitValue(value: unknown, field: string): number | null | undefined {
  if (value === undefined || value === "") return undefined;
  if (value === null || value === "ilimitado") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 10_000_000) throw new BillingError("invalid", 400, `Valor inválido em ${field}.`);
  return n;
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJson(req);
    const caller = await authenticate(req);
    const db = adminDb();
    if (!(await db.collection("admins").doc(caller.uid).get()).exists) throw new BillingError("forbidden", 403, "Acesso restrito à administração do KARDAP.");

    const restaurantId = String(body.restaurantId || "");
    const reason = String(body.reason || "").trim();
    const action = String(body.action || "");
    if (action === "resolve_failure") {
      if (reason.length < 5) throw new BillingError("reason_required", 400, "Informe o motivo da alteração (mínimo de 5 caracteres).");
      const id = String(body.failureId || "");
      const failure = db.collection("falhasSincronizacao").doc(id);
      const snap = id ? await failure.get() : null;
      if (!snap?.exists) throw new BillingError("not_found", 404, "Registro não encontrado.");
      await failure.set({ resolved: true, resolvedBy: caller.email || caller.uid, resolvedAt: new Date().toISOString(), resolution: reason }, { merge: true });
      await db.collection("adminLog").add({ adminUid: caller.uid, adminEmail: caller.email || "", restaurantId: String(snap.get("restaurantId") || ""), restaurantName: "", action, detail: `Falha de sincronização (${snap.get("kind")}) marcada como resolvida`, reason, before: { resolved: false }, after: { resolved: true }, createdAt: new Date().toISOString() });
      return json(req, { resolved: true });
    }

    const ref = db.collection("restaurantes").doc(restaurantId);
    const restaurant = await ref.get();
    if (!restaurant.exists) throw new BillingError("not_found", 404, "Estabelecimento não encontrado.");
    const actor: Actor = { kind: "admin", uid: caller.uid, email: caller.email };
    const needsReason = () => {
      if (reason.length < 5) throw new BillingError("reason_required", 400, "Informe o motivo da alteração (mínimo de 5 caracteres).");
    };
    const log = (detail: string, before: unknown, after: unknown) =>
      db.collection("adminLog").add({
        adminUid: caller.uid,
        adminEmail: caller.email || "",
        restaurantId,
        restaurantName: String(restaurant.get("name") || ""),
        action,
        detail,
        reason,
        before: before ?? null,
        after: after ?? null,
        createdAt: new Date().toISOString(),
      });

    if (action === "extend_trial") {
      needsReason();
      const days = Number(body.days);
      if ([7, 15, 30].indexOf(days) < 0) throw new BillingError("invalid", 400, "Escolha 7, 15 ou 30 dias.");
      const current = restaurant.get("subscription") as StoredSubscription | undefined;
      const e = resolveEntitlements(current, { createdAt: restaurant.get("createdAt") });
      if (current?.planId && (e.status === "active" || e.status === "past_due")) throw new BillingError("paying", 409, "Assinaturas pagas em andamento não recebem extensão de teste.");
      const base = e.status === "trialing" && e.trialEndsAt ? Math.max(Date.now(), Date.parse(e.trialEndsAt)) : Date.now();
      const trialEndsAt = new Date(base + days * DAY).toISOString();
      const result = await applySubscriptionChange(restaurantId, { planId: "pro", planVersion: CATALOG_VERSION, status: "trialing", trialEndsAt, priceCents: current?.priceCents ?? 0 }, actor, reason);
      await log(`Teste do Pro estendido em ${days} dias, até ${new Date(trialEndsAt).toLocaleDateString("pt-BR")}`, result.before, result.after);
      return json(req, { trialEndsAt });
    }

    if (action === "set_subscription") {
      needsReason();
      if (!isPlanId(body.planId)) throw new BillingError("invalid", 400, "Plano inválido.");
      const status = normalizeStatus(body.status);
      if (!status) throw new BillingError("invalid", 400, "Situação inválida.");
      const patch: Partial<StoredSubscription> = { planId: body.planId, planName: shortPlanName(body.planId), planVersion: CATALOG_VERSION, status };
      if (body.currentPeriodEnd !== undefined) {
        const end = body.currentPeriodEnd ? new Date(String(body.currentPeriodEnd)) : null;
        if (end && Number.isNaN(end.getTime())) throw new BillingError("invalid", 400, "Data de fim do período inválida.");
        patch.currentPeriodEnd = end ? end.toISOString() : null;
        patch.nextPaymentDate = end ? end.toISOString() : null;
      }
      if (body.priceCents !== undefined) {
        const cents = body.priceCents === null ? null : Number(body.priceCents);
        if (cents !== null && (!Number.isInteger(cents) || cents < 0 || cents > 100_000_000)) throw new BillingError("invalid", 400, "Valor inválido.");
        patch.priceCents = cents ?? 0;
      }
      if (body.customLimits !== undefined) {
        const raw = (body.customLimits || {}) as Record<string, unknown>;
        const limits: Partial<PlanLimits> = {};
        const tables = limitValue(raw.maxTables, "mesas");
        const orders = limitValue(raw.maxNativeOrdersPerMonth, "pedidos");
        if (tables !== undefined) limits.maxTables = tables;
        if (orders !== undefined) limits.maxNativeOrdersPerMonth = orders;
        patch.customLimits = Object.keys(limits).length ? limits : null;
      }
      if (body.customFeatures !== undefined) {
        const raw = (body.customFeatures || {}) as Record<string, unknown>;
        const features: Partial<Record<FeatureKey, boolean>> = {};
        Object.keys(raw).forEach((key) => {
          if (FEATURE_KEYS.indexOf(key as FeatureKey) < 0 || typeof raw[key] !== "boolean") throw new BillingError("invalid", 400, `Recurso desconhecido: ${key}.`);
          features[key as FeatureKey] = raw[key] as boolean;
        });
        patch.customFeatures = Object.keys(features).length ? features : null;
      }
      if (status === "active") {
        patch.lateSince = null;
        patch.canceledAt = null;
      }
      const result = await applySubscriptionChange(restaurantId, patch, actor, reason);
      await log(`Assinatura alterada para ${shortPlanName(body.planId)} (${status})`, result.before, result.after);
      return json(req, { subscription: result.after });
    }

    if (action === "reconcile_usage") {
      if (!isPeriodId(body.periodId)) throw new BillingError("invalid", 400, "Período inválido (use AAAA-MM).");
      const apply = body.apply === true;
      if (apply) needsReason();
      const result = await reconcileUsage(restaurantId, body.periodId, { uid: caller.uid, email: caller.email || undefined }, apply);
      if (result.applied) await log(`Consumo de ${body.periodId} corrigido: ${result.recorded} → ${result.confirmed}`, { nativeOrdersUsed: result.recorded }, { nativeOrdersUsed: result.confirmed });
      return json(req, result);
    }

    throw new BillingError("invalid", 400, "Ação desconhecida.");
  } catch (error) {
    return errorResponse(req, "admin assinaturas", error);
  }
}
