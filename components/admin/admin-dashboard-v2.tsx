"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertCircle,
  Bell,
  CheckCircle2,
  DollarSign,
  Package,
  RotateCw,
  Store,
  TrendingUp,
  Users,
} from "lucide-react";
import { brl, plural } from "@/lib/format";
import { PLAN_CATALOG, PLAN_ORDER, type PlanId } from "@/lib/billing/plans";
import { listAdminLog, type AdminLogEntry } from "@/lib/admin-db";
import type { Row } from "./admin-panel";

/**
 * Painel administrativo — visão geral. Lê os números dos restaurantes já carregados pelo AdminApp (`rows`) e um
 * recorte curto de `adminLog`. Tudo em tempo real do que já veio do Firestore; não mocka números.
 */

export function AdminDashboardV2({ rows, loading, onRefresh }: { rows: Row[]; loading: boolean; onRefresh: () => void }) {
  const [log, setLog] = useState<AdminLogEntry[] | null>(null);
  useEffect(() => {
    listAdminLog(undefined, 6).then(setLog);
  }, [rows]);

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const paying = rows.filter((r) => r.state === "active" || r.state === "late");
  const mrr = paying.reduce((sum, r) => sum + r.mrr, 0);
  const trials = rows.filter((r) => r.state === "trial");
  const endingSoon = trials.filter((r) => (r.daysLeft ?? 99) <= 3);
  const late = rows.filter((r) => r.state === "late");
  const suspended = rows.filter((r) => r.suspended);
  const newThisWeek = rows.filter((r) => (r.createdAt?.getTime() || 0) >= weekAgo).length;
  const published = rows.filter((r) => r.onboardingCompleted).length;

  const stats = [
    {
      label: "Receita mensal",
      value: brl(mrr),
      hint: `${plural(paying.length, "assinatura paga", "assinaturas pagas")}`,
      icon: DollarSign,
      tone: "emerald" as const,
      trend: paying.length > 0 ? "up" : null,
    },
    {
      label: "Assinantes",
      value: String(paying.length),
      hint: `${plural(late.length, "em atraso", "em atraso")}`,
      icon: Users,
      tone: "yellow" as const,
      trend: late.length === 0 ? "up" : null,
    },
    {
      label: "Em teste",
      value: String(trials.length),
      hint: endingSoon.length > 0 ? `${endingSoon.length} termina em ≤ 3 d` : "Nenhum terminando",
      icon: Activity,
      tone: "sky" as const,
      trend: endingSoon.length === 0 ? "up" : null,
    },
    {
      label: "Restaurantes",
      value: String(rows.length),
      hint: `${published} publicados · ${newThisWeek} novos (7d)`,
      icon: Store,
      tone: "violet" as const,
      trend: newThisWeek > 0 ? "up" : null,
    },
  ];

  const attention = [
    ...late.map((r) => ({ row: r, reason: "Pagamento atrasado", icon: AlertCircle, tone: "red" as const })),
    ...endingSoon.map((r) => ({ row: r, reason: r.daysLeft === 0 ? "Teste termina hoje" : `Teste termina em ${plural(r.daysLeft || 0, "dia", "dias")}`, icon: Bell, tone: "amber" as const })),
    ...suspended.map((r) => ({ row: r, reason: r.suspendedReason || "Cardápio suspenso", icon: AlertCircle, tone: "red" as const })),
  ].slice(0, 6);

  const planCounts: Array<{ planId: PlanId; count: number; revenueCents: number }> = PLAN_ORDER.map((planId) => {
    const planPaying = paying.filter((r) => r.planId === planId);
    return { planId, count: planPaying.length, revenueCents: planPaying.reduce((s, r) => s + r.mrr, 0) };
  }).sort((a, b) => b.count - a.count);

  const conversionRate = rows.length > 0 ? (paying.length / rows.length) * 100 : 0;
  const trialShare = rows.length > 0 ? (trials.length / rows.length) * 100 : 0;
  const publishRate = rows.length > 0 ? (published / rows.length) * 100 : 0;

  return (
    <div className="min-h-full">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-neutral-900">Visão geral</h1>
          <p className="text-neutral-600 mt-1 text-sm">Situação comercial e de uso de todos os restaurantes do KARDAP.</p>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 shadow-sm text-sm font-medium transition-colors disabled:opacity-60"
        >
          <RotateCw size={15} className={loading ? "animate-spin" : ""} />
          {loading ? "Atualizando…" : "Atualizar"}
        </button>
      </div>

      {/* Cards de métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-8">
        {stats.map((s) => (
          <article key={s.label} className="p-5 rounded-xl border border-neutral-200 bg-white shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className={toneWrap(s.tone)}>
                <s.icon className={`h-5 w-5 ${toneText(s.tone)}`} />
              </div>
              {s.trend === "up" && <TrendingUp className="h-4 w-4 text-emerald-500" aria-label="tendência positiva" />}
            </div>
            <h3 className="font-medium text-neutral-500 text-sm mb-1">{s.label}</h3>
            <p className="text-2xl font-bold text-neutral-900 tabular-nums">{s.value}</p>
            <p className="text-xs text-neutral-500 mt-1">{s.hint}</p>
          </article>
        ))}
      </div>

      {/* Grid de conteúdo */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna esquerda — pede atenção + log */}
        <div className="lg:col-span-2 space-y-6">
          <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-neutral-900">Pede atenção</h2>
              <Link href="/admin/restaurantes" className="text-sm text-neutral-700 hover:text-neutral-900 font-medium">
                Ver restaurantes →
              </Link>
            </div>
            {attention.length === 0 ? (
              <div className="flex items-center gap-3 py-6">
                <div className="p-2 rounded-lg bg-emerald-50">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="font-medium text-neutral-900">Tudo em dia</p>
                  <p className="text-sm text-neutral-500">Sem pagamentos atrasados, testes acabando ou cardápios suspensos.</p>
                </div>
              </div>
            ) : (
              <ul className="space-y-2">
                {attention.map((item, i) => (
                  <li key={item.row.id + i}>
                    <Link
                      href={`/admin/restaurantes/${encodeURIComponent(item.row.id)}`}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-neutral-50 transition-colors"
                    >
                      <div className={toneWrap(item.tone)}>
                        <item.icon className={`h-4 w-4 ${toneText(item.tone)}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-neutral-900 truncate">{item.row.name || "Sem nome"}</p>
                        <p className="text-xs text-neutral-500 truncate">{item.reason}</p>
                      </div>
                      <span className="text-xs text-neutral-400 whitespace-nowrap">{item.row.state === "late" ? "Inadimplente" : item.row.state === "trial" ? "Em teste" : "Suspenso"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-neutral-900">Atividade recente</h2>
              <span className="text-xs text-neutral-500">últimos 6</span>
            </div>
            {log === null ? (
              <ul className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <li key={i} className="h-12 rounded-lg bg-neutral-100 animate-pulse" />
                ))}
              </ul>
            ) : log.length === 0 ? (
              <p className="text-sm text-neutral-500 py-4">Nenhuma ação registrada ainda.</p>
            ) : (
              <ul className="space-y-1">
                {log.map((entry) => {
                  const meta = actionMeta(entry.action);
                  return (
                    <li key={entry.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-neutral-50 transition-colors">
                      <div className={toneWrap(meta.tone)}>
                        <meta.icon className={`h-4 w-4 ${toneText(meta.tone)}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-neutral-900 truncate">{meta.label}</p>
                        <p className="text-xs text-neutral-500 truncate">{entry.detail || entry.restaurantName || "—"}</p>
                      </div>
                      <span className="text-xs text-neutral-400 whitespace-nowrap">{formatRelative(entry.createdAt)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* Coluna direita — stats rápidas + planos */}
        <div className="space-y-6">
          <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-neutral-900 mb-5">Indicadores</h2>
            <div className="space-y-5">
              <Bar label="Conversão em assinante" value={conversionRate} tone="emerald" />
              <Bar label="Em teste agora" value={trialShare} tone="sky" />
              <Bar label="Cardápios publicados" value={publishRate} tone="yellow" />
            </div>
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-neutral-900 mb-5">Planos mais contratados</h2>
            {paying.length === 0 ? (
              <p className="text-sm text-neutral-500">Ainda sem assinaturas pagas.</p>
            ) : (
              <ul className="space-y-3">
                {planCounts.map((p) => (
                  <li key={p.planId} className="flex items-center justify-between py-1">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-900 truncate">{PLAN_CATALOG[p.planId].name}</p>
                      <p className="text-xs text-neutral-500">{plural(p.count, "assinante", "assinantes")}</p>
                    </div>
                    <span className="text-sm font-semibold text-neutral-900 tabular-nums whitespace-nowrap">{brl(p.revenueCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className={toneWrap("yellow")}>
                <Package className={`h-5 w-5 ${toneText("yellow")}`} />
              </div>
              <h2 className="text-base font-semibold text-neutral-900">Catálogo</h2>
            </div>
            <p className="text-sm text-neutral-500 mb-4">Preços e visibilidade dos planos podem ser alterados sem deploy.</p>
            <Link
              href="/admin/planos"
              className="inline-flex items-center justify-center w-full px-4 py-2 rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 text-sm font-medium transition-colors"
            >
              Editar catálogo
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── helpers visuais ───────────────────────── */

type Tone = "emerald" | "yellow" | "sky" | "violet" | "red" | "amber" | "neutral";

function toneWrap(tone: Tone) {
  const map: Record<Tone, string> = {
    emerald: "bg-emerald-50",
    yellow: "bg-yellow-100",
    sky: "bg-sky-50",
    violet: "bg-violet-50",
    red: "bg-red-50",
    amber: "bg-amber-50",
    neutral: "bg-neutral-100",
  };
  return `p-2 rounded-lg ${map[tone]}`;
}

function toneText(tone: Tone) {
  const map: Record<Tone, string> = {
    emerald: "text-emerald-600",
    yellow: "text-yellow-700",
    sky: "text-sky-600",
    violet: "text-violet-600",
    red: "text-red-600",
    amber: "text-amber-600",
    neutral: "text-neutral-600",
  };
  return map[tone];
}

function Bar({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  const pct = Math.max(0, Math.min(100, value));
  const barColor: Record<Tone, string> = {
    emerald: "bg-emerald-500",
    yellow: "bg-yellow-400",
    sky: "bg-sky-500",
    violet: "bg-violet-500",
    red: "bg-red-500",
    amber: "bg-amber-500",
    neutral: "bg-neutral-400",
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-neutral-600">{label}</span>
        <span className="text-sm font-semibold text-neutral-900 tabular-nums">{pct.toFixed(1)}%</span>
      </div>
      <div className="w-full h-2 rounded-full bg-neutral-100 overflow-hidden">
        <div className={`${barColor[tone]} h-full rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function actionMeta(action: AdminLogEntry["action"]): { label: string; icon: typeof Activity; tone: Tone } {
  switch (action) {
    case "extend_trial":
      return { label: "Teste estendido", icon: Activity, tone: "sky" };
    case "suspend":
      return { label: "Cardápio suspenso", icon: AlertCircle, tone: "red" };
    case "reactivate":
      return { label: "Cardápio reativado", icon: CheckCircle2, tone: "emerald" };
    case "set_subscription":
      return { label: "Assinatura ajustada", icon: DollarSign, tone: "yellow" };
    case "reconcile_usage":
      return { label: "Franquia reconciliada", icon: RotateCw, tone: "neutral" };
    case "resolve_failure":
      return { label: "Falha marcada como resolvida", icon: CheckCircle2, tone: "emerald" };
    case "catalog_update":
      return { label: "Catálogo atualizado", icon: Package, tone: "yellow" };
    default:
      return { label: String(action), icon: Activity, tone: "neutral" };
  }
}

function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  if (diff < 60_000) return "agora";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} d`;
  return new Date(t).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
