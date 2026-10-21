"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { useNow } from "@/lib/hooks";
import { orderQuota, resolveEntitlements, usagePeriod, type Entitlements, type FeatureKey, type StoredSubscription } from "@/lib/billing/plans";
import type { AccountInfo } from "@/components/dashboard/types";
import { subscribeShared } from "@/lib/firestore-shared-listener";

/**
 * Hooks de planos para as telas. Só controlam a experiência (o que aparece, travado ou liberado): toda operação
 * limitada é conferida de novo no servidor (lib/billing/server.ts).
 *
 * A assinatura chega em tempo real pelo documento do restaurante (já observado pelo app); o uso do mês, pelo
 * documento restaurantes/{id}/uso/{AAAA-MM}. Um upgrade aparece na hora, sem recarregar.
 */

/** Direitos efetivos agora. Reavaliados a cada minuto: o fim do teste ou do período vale sem recarregar. */
export function usePlanEntitlements(account: AccountInfo): Entitlements {
  const now = useNow(60_000);
  return useMemo(
    () =>
      resolveEntitlements(account.subscription as StoredSubscription | null, {
        createdAt: account.createdAt,
        restaurantStatus: account.suspended ? "suspended" : "active",
        now,
      }),
    [account.subscription, account.createdAt, account.suspended, now],
  );
}

export function useSubscription(account: AccountInfo) {
  const entitlements = usePlanEntitlements(account);
  return { entitlements, subscription: account.subscription, hasPaidSubscription: Boolean(account.subscription?.planId) && !entitlements.implicitTrial };
}

export type PlanUsage = ReturnType<typeof orderQuota> & { loading: boolean; periodId: string; periodStart: string; periodEnd: string; error: boolean };

/** Pedidos próprios usados no mês atual (fuso de São Paulo), em tempo real. */
export function usePlanUsage(restaurantId: string, entitlements: Entitlements): PlanUsage {
  const now = useNow(60_000);
  const period = useMemo(() => usagePeriod(now), [now]);
  const [state, setState] = useState<{ periodId: string; used: number; loading: boolean; error: boolean }>({ periodId: period.periodId, used: 0, loading: true, error: false });
  useEffect(() => {
    if (!restaurantId) return;
    setState({ periodId: period.periodId, used: 0, loading: true, error: false });
    return subscribeShared<number>(`usage:${restaurantId}:${period.periodId}`, (emit, fail) => onSnapshot(
      doc(getDb(), "restaurantes", restaurantId, "uso", period.periodId),
      (snap) => emit(Number(snap.get("nativeOrdersUsed")) || 0, snap.exists() ? 1 : 0),
      fail,
    ), (used) => setState({ periodId: period.periodId, used, loading: false, error: false }), () => setState((s) => ({ ...s, loading: false, error: true })));
  }, [restaurantId, period.periodId]);
  const quota = orderQuota(state.used, entitlements.limits.maxNativeOrdersPerMonth);
  return { ...quota, loading: state.loading, error: state.error, periodId: period.periodId, periodStart: period.start, periodEnd: period.end };
}

/** O plano libera o recurso? "subscription": volta ao regularizar; "plan": precisa de outro plano. */
export function useFeatureAccess(account: AccountInfo, feature: FeatureKey) {
  const entitlements = usePlanEntitlements(account);
  if (entitlements.features[feature]) return { allowed: true, reason: null as null | "plan" | "subscription", entitlements };
  return { allowed: false, reason: entitlements.contracted.features[feature] ? ("subscription" as const) : ("plan" as const), entitlements };
}

export { apiError, billingFetch } from "./api";
