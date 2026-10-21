"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { signOut } from "firebase/auth";
import { AlertTriangle, ArrowLeft, Bug, CircleDollarSign, Copy, ExternalLink, LayoutDashboard, LoaderCircle, LogOut, RotateCw, Search, ShieldAlert, ShieldCheck, Store, Trash2, Wallet } from "lucide-react";
import { getFirebaseAuth } from "@/lib/auth";
import { friendlyError } from "@/lib/async";
import { brl, plural } from "@/lib/format";
import { PLAN_CATALOG } from "@/lib/billing/plans";
import { BillingOpsPanel, SubscriptionAdminCard } from "./billing-admin";
import { PlanCatalogEditor } from "./plan-editor";
import { AdminDashboardV2 } from "./admin-dashboard-v2";
import { accountState, effectiveSubscription, monthlyCents, planLabel, toDate, trialDaysLeft, type AccountState } from "@/lib/cakto/access";
import {
  canExtendTrial,
  extendTrial,
  getRestaurant,
  getRestaurantDetail,
  isSystemAdmin,
  listAdminLog,
  listRestaurants,
  setSuspended,
  type AdminIdentity,
  type AdminLogEntry,
  type AdminRestaurant,
  type RestaurantDetail,
} from "@/lib/admin-db";
import { KardapLogo } from "@/components/brand/logo";
import { FinancialDashboard } from "./financial-dashboard";
import { clearAccountStorage, endSsoSession } from "@/lib/sso/client";
import { PLAN_ORDER, PlanComparison } from "@/components/plans/plan-cards";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardHead,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  SelectField,
  Skeleton,
  SpeedLoader,
  TextArea,
  TextField,
  type BadgeTone,
} from "@/components/ui";
import type { Notify } from "@/components/dashboard/types";

/* ───────────────────────── Situação comercial ───────────────────────── */

const STATE_LABEL: Record<AccountState | "demo", { label: string; tone: BadgeTone }> = {
  trial: { label: "Em teste", tone: "signal" },
  trial_ended: { label: "Teste encerrado", tone: "outline" },
  active: { label: "Assinante", tone: "success" },
  late: { label: "Inadimplente", tone: "danger" },
  canceled: { label: "Cancelada", tone: "outline" },
  expired: { label: "Expirada", tone: "outline" },
  none: { label: "Sem dados", tone: "neutral" },
  demo: { label: "Demonstração", tone: "outline" },
};

export type Row = AdminRestaurant & { state: AccountState | "demo"; daysLeft: number | null; mrr: number; planId: string };

export function toRow(r: AdminRestaurant, now: number): Row {
  const sub = effectiveSubscription(r.subscription, r.rawCreatedAt);
  // A demonstração tem plano liberado sem cobrança: não é assinante, não conta na receita nem nos testes.
  const state = r.isDemo ? "demo" : accountState(sub, now);
  return {
    ...r,
    state,
    daysLeft: trialDaysLeft(sub, now),
    // Receita só conta assinaturas pagas (ativas ou em carência).
    mrr: state === "active" || state === "late" ? monthlyCents(r.subscription as any) : 0,
    planId: sub?.planId || "",
  };
}

const date = (value: Date | null) => (value ? value.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "—");

function StateBadge({ row }: { row: Row }) {
  if (row.suspended) return <Badge tone="danger">Suspenso</Badge>;
  const meta = STATE_LABEL[row.state];
  return (
    <Badge tone={meta.tone}>
      {meta.label}
      {row.state === "trial" && row.daysLeft !== null ? ` · ${row.daysLeft} d` : ""}
    </Badge>
  );
}

/* ───────────────────────── Acesso ───────────────────────── */

type Gate = { state: "checking" } | { state: "denied"; identity: AdminIdentity } | { state: "error"; message: string } | { state: "ok"; identity: AdminIdentity };

export default function AdminPanel({ path, notify }: { path: string; notify: Notify }) {
  const [gate, setGate] = useState<Gate>({ state: "checking" });

  const check = useCallback(async () => {
    setGate({ state: "checking" });
    const user = getFirebaseAuth().currentUser;
    if (!user) return setGate({ state: "error", message: "Sua sessão expirou. Entre de novo." });
    const identity = { uid: user.uid, email: user.email || "" };
    try {
      setGate((await isSystemAdmin(user.uid)) ? { state: "ok", identity } : { state: "denied", identity });
    } catch (error) {
      setGate({ state: "error", message: friendlyError(error, "Não foi possível verificar seu acesso.") });
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  useEffect(() => {
    document.title = "Administração · Kardap";
  }, []);

  if (gate.state === "checking")
    return (
      <div className="kd-state">
        <SpeedLoader large label="Verificando acesso" />
      </div>
    );
  if (gate.state === "error")
    return (
      <div className="kd-state" role="alert">
        <h1 className="kd-state-title">Não foi possível abrir a administração</h1>
        <p className="kd-state-text">{gate.message}</p>
        <Button icon={<RotateCw size={16} />} onClick={check}>
          Tentar de novo
        </Button>
      </div>
    );
  if (gate.state === "denied") return <AccessDenied identity={gate.identity} notify={notify} />;
  return <AdminApp path={path} identity={gate.identity} notify={notify} />;
}

async function signOutToLogin(notify: Notify) {
  try {
    await endSsoSession();
    await signOut(getFirebaseAuth());
    clearAccountStorage();
    window.location.href = "/login";
  } catch {
    notify("Não foi possível sair agora. Tente de novo.", "error");
  }
}

export function AccessDenied({ identity, notify }: { identity: AdminIdentity; notify: Notify }) {
  return (
    <main className="kd-state kd-admin-denied">
      <span className="kd-empty-icon" aria-hidden>
        <ShieldAlert size={22} />
      </span>
      <h1 className="kd-state-title">Área restrita à administração do Kardap</h1>
      <p className="kd-state-text">
        A conta {identity.email ? <b>{identity.email}</b> : "atual"} não tem acesso. Se você administra o sistema, peça para outro administrador
        liberar este identificador:
      </p>
      <div className="kd-copyfield kd-admin-uid">
        <input readOnly value={identity.uid} aria-label="Identificador da conta" onFocus={(e) => e.currentTarget.select()} />
        <Button
          size="sm"
          variant="secondary"
          icon={<Copy size={14} />}
          onClick={() => navigator.clipboard.writeText(identity.uid).then(() => notify("Identificador copiado"), () => notify("Copie o identificador manualmente.", "error"))}
        >
          Copiar
        </Button>
      </div>
      <p className="kd-hint">Liberação: crie o documento admins/{"{identificador}"} no Firestore ou rode scripts/grant-admin.mjs.</p>
      <div className="kd-row" style={{ justifyContent: "center" }}>
        <ButtonLink href="/dashboard" variant="secondary">
          Ir para o painel do restaurante
        </ButtonLink>
        <Button variant="ghost" onClick={() => signOutToLogin(notify)}>
          Entrar com outra conta
        </Button>
      </div>
    </main>
  );
}

/** Garante ponto final em textos digitados pela equipe antes de emendar outra frase. */
const sentence = (text: string) => {
  const t = text.trim();
  return !t || /[.!?…]$/.test(t) ? t : t + ".";
};

/* ───────────────────────── Estrutura ───────────────────────── */

const SECTIONS = [
  { href: "/admin", label: "Visão geral", icon: LayoutDashboard },
  { href: "/admin/restaurantes", label: "Restaurantes", icon: Store },
  { href: "/admin/planos", label: "Planos", icon: Wallet },
  { href: "/admin/financeiro", label: "Financeiro", icon: CircleDollarSign },
  { href: "/admin/debug", label: "Debug", icon: Bug },
];

function AdminApp({ path, identity, notify }: { path: string; identity: AdminIdentity; notify: Notify }) {
  const [data, setData] = useState<{ items: AdminRestaurant[]; truncated: boolean } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await listRestaurants());
      setNow(Date.now());
    } catch (err) {
      setError(friendlyError(err, "Não foi possível carregar os restaurantes."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => (data?.items || []).map((r) => toRow(r, now)), [data, now]);
  const updateRow = (next: AdminRestaurant) =>
    setData((current) => (current ? { ...current, items: current.items.map((r) => (r.id === next.id ? next : r)) } : current));

  const detailId = path.startsWith("/admin/restaurantes/") ? decodeURIComponent(path.split("/")[3] || "") : "";
  const section = detailId ? "/admin/restaurantes" : SECTIONS.find((s) => s.href === path)?.href || "/admin";

  return (
    <AdminFrame section={section} detail={Boolean(detailId)} identity={identity} notify={notify}>
      {error ? (

          <Card>
            <EmptyState
              title="Não foi possível carregar os dados"
              description={error}
              action={
                <Button variant="secondary" icon={<RotateCw size={15} />} onClick={load}>
                  Tentar de novo
                </Button>
              }
            />
          </Card>
        ) : !data ? (
          <div className="kd-stack" role="status" aria-label="Carregando dados da administração">
            <span className="kd-skel" style={{ width: 280, height: 40 }} />
            <div className="kd-stats">
              {Array.from({ length: 4 }).map((_, i) => (
                <span key={i} className="kd-skel" style={{ height: 112 }} />
              ))}
            </div>
            <span className="kd-skel" style={{ height: 320 }} />
          </div>
        ) : (
          <div key={detailId || section} className="kd-page">
            {data.truncated && (
              <div className="kd-banner">
                <Callout tone="warn" title="Mostrando os primeiros 2.000 restaurantes">
                  Os números desta área consideram só esse conjunto.
                </Callout>
              </div>
            )}
            {detailId ? (
              <RestaurantDetailPage id={detailId} rows={rows} identity={identity} notify={notify} onChange={updateRow} now={now} />
            ) : section === "/admin/restaurantes" ? (
              <RestaurantsPage rows={rows} />
            ) : section === "/admin/planos" ? (
              <PlansAdminPage rows={rows} notify={notify} />
            ) : section === "/admin/financeiro" ? (
              <FinancialDashboard notify={notify} />
            ) : section === "/admin/debug" ? (
              <SystemResetPage notify={notify} />
            ) : (
              <AdminDashboardV2 rows={rows} loading={loading} onRefresh={load} />
            )}
          </div>
        )}
    </AdminFrame>
  );
}

/** Sidebar + área principal da administração. */
export function AdminFrame({
  section,
  detail = false,
  identity,
  notify,
  children,
}: {
  section: string;
  detail?: boolean;
  identity: AdminIdentity;
  notify: Notify;
  children: React.ReactNode;
}) {
  const logout = () => signOutToLogin(notify);
  return (
    <div className="kd-admin">
      <a href="#kd-admin-main" className="kd-skip">
        Pular para o conteúdo
      </a>
      <aside className="kd-admin-sidebar">
        <Link href="/admin" className="kd-admin-brand" aria-label="Administração do Kardap, visão geral">
          <KardapLogo width={104} alt="" />
          <span className="kd-admin-tag">Admin</span>
        </Link>
        <nav className="kd-admin-nav" aria-label="Seções da administração">
          {SECTIONS.map((s) => (
            <Link key={s.href} href={s.href} className={`kd-admin-nav-link${section === s.href ? " is-active" : ""}`} aria-current={section === s.href && !detail ? "page" : undefined}>
              <s.icon size={18} aria-hidden />
              <span>{s.label}</span>
            </Link>
          ))}
        </nav>
        <div className="kd-admin-sidebar-footer">
          <div className="kd-admin-account">
            <span className="kd-admin-avatar" aria-hidden>
              {(identity.email || "A")[0].toUpperCase()}
            </span>
            <span className="kd-admin-email" title={identity.email}>
              {identity.email || "Administrador"}
            </span>
          </div>
          <button type="button" className="kd-admin-nav-link kd-admin-logout" onClick={logout}>
            <LogOut size={18} aria-hidden />
            <span>Sair</span>
          </button>
        </div>
      </aside>
      <main id="kd-admin-main" className="kd-admin-main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}

/* ───────────────────────── Visão geral ───────────────────────── */

export function OverviewPage({ rows, loading, onRefresh }: { rows: Row[]; loading: boolean; onRefresh: () => void }) {
  const [log, setLog] = useState<AdminLogEntry[] | null>(null);
  useEffect(() => {
    listAdminLog(undefined, 8).then(setLog);
  }, [rows]);

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const paying = rows.filter((r) => r.state === "active" || r.state === "late");
  const mrr = paying.reduce((sum, r) => sum + r.mrr, 0);
  const byPlan = (id: string) => paying.filter((r) => r.planId === id).length;
  const trials = rows.filter((r) => r.state === "trial");
  const endingSoon = trials.filter((r) => (r.daysLeft ?? 99) <= 3);
  const late = rows.filter((r) => r.state === "late");
  const suspended = rows.filter((r) => r.suspended);
  const published = rows.filter((r) => r.onboardingCompleted).length;
  const newThisWeek = rows.filter((r) => (r.createdAt?.getTime() || 0) >= weekAgo).length;
  const attention = [
    ...late.map((r) => ({ row: r, reason: "Pagamento atrasado" })),
    ...endingSoon.map((r) => ({ row: r, reason: r.daysLeft === 0 ? "Teste termina hoje" : `Teste termina em ${plural(r.daysLeft || 0, "dia", "dias")}` })),
    ...suspended.map((r) => ({ row: r, reason: r.suspendedReason || "Cardápio suspenso" })),
  ];

  return (
    <div className="kd-stack">
      <PageHeader
        kicker="Administração"
        title="Visão geral"
        description="Situação comercial e de uso de todos os restaurantes do Kardap."
        actions={
          <Button variant="secondary" icon={<RotateCw size={15} />} loading={loading} onClick={onRefresh}>
            {loading ? "Atualizando…" : "Atualizar"}
          </Button>
        }
      />

      <section className="kd-kpis" aria-label="Indicadores principais">
        <div className="kd-kpi is-lead">
          <span className="kd-kpi-label">Receita mensal estimada</span>
          <span className="kd-kpi-value kd-num">{brl(mrr)}</span>
          <span className="kd-kpi-note">{plural(paying.length, "assinatura paga", "assinaturas pagas")} (anuais divididas por 12)</span>
        </div>
        <div className="kd-kpi">
          <span className="kd-kpi-label">Assinantes</span>
          <span className="kd-kpi-value kd-num">{paying.length}</span>
          <span className="kd-kpi-note">
            {byPlan("essencial")} Essencial · {byPlan("pro")} Pro
          </span>
        </div>
        <div className="kd-kpi">
          <span className="kd-kpi-label">Em teste</span>
          <span className="kd-kpi-value kd-num">{trials.length}</span>
          <span className="kd-kpi-note">{endingSoon.length ? `${endingSoon.length} terminando em até 3 dias` : "Nenhum terminando nos próximos dias"}</span>
        </div>
        <div className="kd-kpi">
          <span className="kd-kpi-label">Restaurantes</span>
          <span className="kd-kpi-value kd-num">{rows.length}</span>
          <span className="kd-kpi-note">
            {published} com cardápio publicado · {newThisWeek} novos em 7 dias
          </span>
        </div>
      </section>

      <div className="kd-split">
        <Card aria-labelledby="adm-attention">
          <CardHead id="adm-attention" kicker="Pede atenção" title={attention.length ? plural(attention.length, "restaurante", "restaurantes") : "Tudo em dia"} />
          {attention.length ? (
            <ul className="kd-admin-list">
              {attention.slice(0, 8).map(({ row, reason }) => (
                <li key={row.id + reason}>
                  <Link href={`/admin/restaurantes/${encodeURIComponent(row.id)}`}>
                    <span className="kd-admin-list-main">
                      <b>{row.name || "Sem nome"}</b>
                      <small>{reason}</small>
                    </span>
                    <StateBadge row={row} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact title="Nenhuma pendência" description="Sem pagamentos atrasados, testes acabando ou cardápios suspensos." />
          )}
        </Card>

        <Card aria-labelledby="adm-recent">
          <CardHead
            id="adm-recent"
            kicker="Cadastros recentes"
            title="Novos restaurantes"
            action={
              <ButtonLink href="/admin/restaurantes" variant="link" size="sm">
                Ver todos
              </ButtonLink>
            }
          />
          {rows.length ? (
            <ul className="kd-admin-list">
              {rows.slice(0, 6).map((row) => (
                <li key={row.id}>
                  <Link href={`/admin/restaurantes/${encodeURIComponent(row.id)}`}>
                    <span className="kd-admin-list-main">
                      <b>{row.name || "Sem nome"}</b>
                      <small>
                        {date(row.createdAt)} · {row.onboardingCompleted ? "Cardápio publicado" : "Em configuração"}
                      </small>
                    </span>
                    <StateBadge row={row} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact title="Nenhum restaurante ainda" description="Os cadastros aparecem aqui assim que forem feitos." />
          )}
        </Card>
      </div>

      <Card aria-labelledby="adm-log">
        <CardHead id="adm-log" kicker="Registro" title="Ações da administração" />
        {log === null ? <Skeleton rows={3} height={40} label="Carregando registro" /> : <LogList entries={log} empty="Nenhuma ação registrada ainda." />}
      </Card>
    </div>
  );
}

function LogList({ entries, empty }: { entries: AdminLogEntry[]; empty: string }) {
  if (!entries.length) return <p className="kd-muted kd-admin-empty-line">{empty}</p>;
  return (
    <ol className="kd-admin-log">
      {entries.map((e) => (
        <li key={e.id}>
          <span className="kd-admin-log-what">
            <b>{e.restaurantName || "Restaurante"}</b> · {e.detail}
          </span>
          <span className="kd-admin-log-who">
            {e.adminEmail || "Administrador"} · {toDate(e.createdAt)?.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
          </span>
        </li>
      ))}
    </ol>
  );
}

/* ───────────────────────── Restaurantes ───────────────────────── */

const FILTERS: { value: string; label: string; test: (r: Row) => boolean }[] = [
  { value: "todos", label: "Todas as situações", test: () => true },
  { value: "teste", label: "Em teste", test: (r) => r.state === "trial" },
  { value: "teste-encerrado", label: "Teste encerrado", test: (r) => r.state === "trial_ended" },
  { value: "assinantes", label: "Assinantes", test: (r) => r.state === "active" },
  { value: "inadimplentes", label: "Inadimplentes", test: (r) => r.state === "late" },
  { value: "canceladas", label: "Canceladas ou expiradas", test: (r) => r.state === "canceled" || r.state === "expired" },
  { value: "suspensos", label: "Suspensos", test: (r) => r.suspended },
  { value: "configuracao", label: "Cardápio em configuração", test: (r) => !r.onboardingCompleted },
];

export function RestaurantsPage({ rows }: { rows: Row[] }) {
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState("todos");
  const needle = term.trim().toLowerCase();
  const test = FILTERS.find((f) => f.value === filter)?.test || (() => true);
  const visible = rows.filter(
    (r) => test(r) && (!needle || [r.name, r.slug, r.businessEmail, r.id].some((field) => field.toLowerCase().includes(needle))),
  );

  return (
    <div className="kd-stack">
      <PageHeader kicker="Administração" title="Restaurantes" description="Busque por nome, endereço do cardápio ou e-mail comercial. Clique para ver detalhes e ações." />
      <div className="kd-group">
        <div className="kd-toolbar kd-toolbar--admin" role="search">
          <label className="kd-search">
            <Search size={17} aria-hidden />
            <span className="kd-sr">Buscar restaurante</span>
            <input type="search" placeholder="Buscar restaurante" value={term} onChange={(e) => setTerm(e.target.value)} />
          </label>
          <select className="kd-input" aria-label="Filtrar por situação" value={filter} onChange={(e) => setFilter(e.target.value)}>
            {FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <p className="kd-results" aria-live="polite">
          {visible.length === rows.length ? plural(rows.length, "restaurante", "restaurantes") : `${visible.length} de ${plural(rows.length, "restaurante", "restaurantes")}`}
        </p>
        <Card flush>
          {visible.length ? (
            <div className="kd-table-scroll">
              <table className="kd-data-table kd-admin-table">
                <thead>
                  <tr>
                    <th scope="col">Restaurante</th>
                    <th scope="col">Situação</th>
                    <th scope="col">Plano</th>
                    <th scope="col">Cardápio</th>
                    <th scope="col">Criado em</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.id}>
                      <th scope="row" data-label="Restaurante">
                        <Link href={`/admin/restaurantes/${encodeURIComponent(r.id)}`} className="kd-admin-row-link">
                          <b>{r.name || "Sem nome"}</b>
                          <small>{r.slug ? `/r/${r.slug}` : r.businessEmail || r.id}</small>
                        </Link>
                      </th>
                      <td data-label="Situação">
                        <StateBadge row={r} />
                      </td>
                      <td data-label="Plano">{r.state === "active" || r.state === "late" || r.state === "trial" ? planLabel(r.planId) : "—"}</td>
                      <td data-label="Cardápio" className={r.onboardingCompleted ? "" : "kd-muted"}>
                        {r.onboardingCompleted ? "Publicado" : "Em configuração"}
                      </td>
                      <td data-label="Criado em" className="kd-muted kd-num">
                        {date(r.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={<Search size={22} />}
              title="Nenhum restaurante encontrado"
              description="Ajuste a busca ou escolha outra situação."
              action={
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setTerm("");
                    setFilter("todos");
                  }}
                >
                  Limpar busca e filtro
                </Button>
              }
            />
          )}
        </Card>
      </div>
    </div>
  );
}

/* ───────────────────────── Detalhe do restaurante ───────────────────────── */

export function RestaurantDetailPage({
  id,
  rows,
  identity,
  notify,
  onChange,
  now,
}: {
  id: string;
  rows: Row[];
  identity: AdminIdentity;
  notify: Notify;
  onChange: (next: AdminRestaurant) => void;
  now: number;
}) {
  const row = rows.find((r) => r.id === id) || null;
  const [detail, setDetail] = useState<RestaurantDetail | null>(null);
  const [days, setDays] = useState("15");
  const [extending, setExtending] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");

  const refresh = useCallback(async () => {
    const fresh = await getRestaurant(id);
    if (fresh) onChange(fresh);
    return fresh;
  }, [id, onChange]);

  useEffect(() => {
    if (!row) return;
    setDetail(null);
    getRestaurantDetail(row).then(setDetail);
    // Recarrega só quando muda o restaurante aberto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.id]);

  if (!row)
    return (
      <Card>
        <EmptyState
          title="Restaurante não encontrado"
          description="O endereço pode estar errado ou o restaurante foi removido."
          action={
            <ButtonLink href="/admin/restaurantes" variant="secondary">
              Voltar para a lista
            </ButtonLink>
          }
        />
      </Card>
    );

  const sub = effectiveSubscription(row.subscription, row.rawCreatedAt);
  const trialEnd = toDate(sub?.trialEndsAt);
  const nextCharge = toDate(row.subscription?.nextPaymentDate || row.subscription?.currentPeriodEnd);
  const extendable = canExtendTrial(row);

  const runExtend = async () => {
    setExtending(true);
    try {
      const end = await extendTrial(row, Number(days), identity);
      const fresh = await refresh();
      if (fresh) getRestaurantDetail(fresh).then(setDetail);
      notify(`Teste estendido até ${new Date(end).toLocaleDateString("pt-BR")}`);
    } catch (error) {
      notify(friendlyError(error, "Não foi possível estender o teste."), "error");
    } finally {
      setExtending(false);
    }
  };

  return (
    <div className="kd-stack">
      <div>
        <ButtonLink href="/admin/restaurantes" variant="link" size="sm" icon={<ArrowLeft size={15} aria-hidden />}>
          Restaurantes
        </ButtonLink>
      </div>
      <header className="kd-page-head">
        <div className="kd-page-head-text">
          <div className="kd-row">
            <StateBadge row={row} />
            <span className="kd-muted kd-admin-meta">Criado em {date(row.createdAt)}</span>
          </div>
          <h1 className="kd-h1">{row.name || "Restaurante sem nome"}</h1>
          <p className="kd-lead">
            {[row.establishmentType, detail?.ownerEmail || row.businessEmail, row.businessPhone].filter(Boolean).join(" · ") || "Sem dados de contato"}
          </p>
        </div>
        {row.slug && (
          <div className="kd-page-head-actions">
            <ButtonLink href={`/r/${row.slug}`} external variant="secondary" icon={<ExternalLink size={15} />}>
              Abrir cardápio
            </ButtonLink>
          </div>
        )}
      </header>

      {row.suspended && (
        <Callout tone="danger" icon={<ShieldAlert size={18} aria-hidden />} title="Cardápio suspenso">
          {sentence(row.suspendedReason) || "Sem motivo registrado."} Os clientes veem a mensagem de cardápio indisponível.
        </Callout>
      )}

      <div className="kd-split">
        <Card aria-labelledby="adm-sub">
          <CardHead id="adm-sub" kicker="Assinatura" title={sub ? `${planLabel(sub.planId)} · ${STATE_LABEL[row.state].label}` : "Sem assinatura"} />
          <dl className="kd-facts-list">
            {row.state === "trial" || row.state === "trial_ended" ? (
              <div>
                <dt>Teste {row.state === "trial" ? "termina em" : "terminou em"}</dt>
                <dd>{date(trialEnd)}</dd>
              </div>
            ) : (
              <div>
                <dt>Próxima cobrança</dt>
                <dd>{date(nextCharge)}</dd>
              </div>
            )}
            <div>
              <dt>Valor</dt>
              <dd className="kd-num">
                {row.subscription?.priceCents ? `${brl(row.subscription.priceCents)} ${row.subscription.cycle === "annual" ? "por ano" : "por mês"}` : "—"}
              </dd>
            </div>
            <div>
              <dt>Origem</dt>
              <dd>{row.subscription?.planId ? "Registrada" : "Teste automático desde o cadastro"}</dd>
            </div>
          </dl>
          <div className="kd-admin-action">
            <SelectField label="Estender teste do Pro" value={days} onChange={(e) => setDays(e.target.value)} disabled={!extendable || extending}>
              <option value="7">Mais 7 dias</option>
              <option value="15">Mais 15 dias</option>
              <option value="30">Mais 30 dias</option>
            </SelectField>
            <Button onClick={runExtend} loading={extending} disabled={!extendable}>
              {extending ? "Estendendo…" : "Estender teste"}
            </Button>
          </div>
          {!extendable && <p className="kd-hint">Assinaturas pagas em andamento não recebem extensão de teste.</p>}
        </Card>

        <Card aria-labelledby="adm-usage">
          <CardHead id="adm-usage" kicker="Uso" title="Cardápio e operação" />
          {detail ? (
            <dl className="kd-usage">
              <div>
                <dt>Produtos</dt>
                <dd className="kd-num">{detail.counts.products}</dd>
              </div>
              <div>
                <dt>Categorias</dt>
                <dd className="kd-num">{detail.counts.categories}</dd>
              </div>
              <div>
                <dt>Mesas</dt>
                <dd className="kd-num">{detail.counts.tables}</dd>
              </div>
              <div>
                <dt>Chamados em 30 dias</dt>
                <dd className="kd-num">{detail.counts.callsLast30}</dd>
              </div>
            </dl>
          ) : (
            <Skeleton rows={2} height={56} label="Carregando uso" />
          )}
          <p className="kd-hint">{row.onboardingCompleted ? "Configuração inicial concluída." : "A configuração inicial ainda não foi concluída."}</p>
        </Card>
      </div>

      <SubscriptionAdminCard
        key={JSON.stringify(row.subscription || null)}
        restaurant={row}
        notify={notify}
        onDone={async () => {
          const fresh = await refresh();
          if (fresh) getRestaurantDetail(fresh).then(setDetail);
        }}
      />

      <div className="kd-split">
        <Card aria-labelledby="adm-team">
          <CardHead id="adm-team" kicker="Equipe" title="Pessoas com acesso" />
          {detail ? (
            detail.members.length ? (
              <ul className="kd-admin-list is-static">
                {detail.members.map((m) => (
                  <li key={m.uid}>
                    <span className="kd-admin-list-main">
                      <b>{m.name || "Sem nome"}</b>
                      <small className="kd-num">{m.uid}</small>
                    </span>
                    <Badge tone={m.role === "owner" ? "ink" : "neutral"}>{m.role === "owner" ? "Dono" : "Equipe"}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="kd-muted kd-admin-empty-line">Nenhum membro registrado.</p>
            )
          ) : (
            <Skeleton rows={2} height={40} />
          )}
        </Card>

        <Card aria-labelledby="adm-pay">
          <CardHead id="adm-pay" kicker="Cobranças" title="Pagamentos" />
          {detail ? (
            detail.payments.length ? (
              <ul className="kd-admin-list is-static">
                {detail.payments.slice(0, 8).map((p) => (
                  <li key={p.id}>
                    <span className="kd-admin-list-main">
                      <b className="kd-num">{p.amount || "—"}</b>
                      <small>
                        {date(p.date)} · {p.method || "Forma não informada"}
                      </small>
                    </span>
                    <Badge tone={p.status === "paid" ? "success" : p.status === "refused" ? "danger" : "outline"}>
                      {p.status === "paid" ? "Aprovado" : p.status === "waiting_payment" ? "Aguardando" : p.status === "refused" ? "Recusado" : p.status || "—"}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="kd-muted kd-admin-empty-line">Nenhum pagamento registrado.</p>
            )
          ) : (
            <Skeleton rows={2} height={40} />
          )}
        </Card>
      </div>

      <Card aria-labelledby="adm-history">
        <CardHead id="adm-history" kicker="Registro" title="Ações da administração neste restaurante" />
        {detail ? <LogList entries={detail.log} empty="Nenhuma ação registrada." /> : <Skeleton rows={2} height={40} />}
      </Card>

      <section className="kd-danger-zone" aria-labelledby="adm-danger">
        <div>
          <h2 id="adm-danger" className="kd-h3">
            {row.suspended ? "Reativar o cardápio" : "Suspender o cardápio"}
          </h2>
          <p className="kd-muted">
            {row.suspended
              ? "O cardápio volta a abrir para os clientes imediatamente."
              : "Use em casos de abuso ou fraude. O cardápio público passa a mostrar que está indisponível; o painel do restaurante continua acessível."}
          </p>
        </div>
        <Button
          variant="secondary"
          className={row.suspended ? undefined : "is-destructive"}
          icon={row.suspended ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}
          onClick={() => {
            setReason("");
            setReasonError("");
            setSuspendOpen(true);
          }}
        >
          {row.suspended ? "Reativar cardápio" : "Suspender cardápio"}
        </Button>
      </section>

      {suspendOpen && (
        <ConfirmDialog
          title={row.suspended ? `Reativar o cardápio de “${row.name}”?` : `Suspender o cardápio de “${row.name}”?`}
          description={
            row.suspended
              ? "Os clientes voltam a ver o cardápio e a chamar a equipe."
              : "Os clientes deixam de ver o cardápio até a reativação. A ação fica registrada com o seu e-mail."
          }
          confirmLabel={row.suspended ? "Reativar cardápio" : "Suspender cardápio"}
          tone={row.suspended ? "primary" : "danger"}
          onClose={() => setSuspendOpen(false)}
          onConfirm={async () => {
            if (!row.suspended && reason.trim().length < 5) {
              setReasonError("Descreva o motivo em poucas palavras (mínimo de 5 caracteres).");
              return false;
            }
            try {
              await setSuspended(row, !row.suspended, reason, identity);
              const fresh = await refresh();
              if (fresh) getRestaurantDetail(fresh).then(setDetail);
              notify(row.suspended ? "Cardápio reativado" : "Cardápio suspenso");
            } catch (error) {
              notify(friendlyError(error, "Não foi possível concluir a ação."), "error");
              return false;
            }
          }}
        >
          {!row.suspended && (
            <TextArea
              label="Motivo"
              hint="Fica no registro da administração e aparece para outros administradores."
              rows={3}
              maxLength={300}
              value={reason}
              error={reasonError}
              onChange={(e) => {
                setReason(e.target.value);
                setReasonError("");
              }}
            />
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}

/* ───────────────────────── Planos ───────────────────────── */

export function PlansAdminPage({ rows, notify }: { rows: Row[]; notify: Notify }) {
  const paying = rows.filter((r) => r.state === "active" || r.state === "late");
  const trials = rows.filter((r) => r.state === "trial").length;
  const endedWithoutPlan = rows.filter((r) => r.state === "trial_ended").length;

  return (
    <div className="kd-stack">
      <PageHeader
        kicker="Administração"
        title="Planos"
        description="Preços, limites e assinantes de cada plano. Preço, nome, descrição e destaque podem ser alterados no editor abaixo (sem deploy); limites e funcionalidades seguem o catálogo em lib/billing/plans.ts. Trocar o preço exige atualizar também a oferta na Cakto (CAKTO_OFFER_*)."
      />
      <PlanCatalogEditor notify={notify} />
      <div className="kd-plans kd-plans--4">
        {PLAN_ORDER.map((id) => {
          const plan = PLAN_CATALOG[id];
          const subscribers = paying.filter((r) => r.planId === id);
          const revenue = subscribers.reduce((sum, r) => sum + r.mrr, 0);
          return (
            <Card as="article" key={id} className="kd-plan-admin" aria-label={`Plano ${plan.name}`}>
              <header className="kd-plan-head">
                <h2 className="kd-plan-name">{plan.name}</h2>
                <span className="kd-muted kd-num">{plan.priceInCents === null ? "Sob consulta" : `${brl(plan.priceInCents)} por mês`}</span>
              </header>
              <dl className="kd-usage">
                <div>
                  <dt>Assinantes</dt>
                  <dd className="kd-num">{subscribers.length}</dd>
                </div>
                <div>
                  <dt>Receita mensal</dt>
                  <dd className="kd-num">{brl(revenue)}</dd>
                </div>
              </dl>
              <p className="kd-hint">
                {plan.limits.maxTables === null ? "Mesas ilimitadas" : `Até ${plan.limits.maxTables} mesas`} ·{" "}
                {plan.limits.maxNativeOrdersPerMonth === null ? "pedidos ilimitados" : plan.limits.maxNativeOrdersPerMonth === 0 ? "sem pedidos próprios" : `${plan.limits.maxNativeOrdersPerMonth} pedidos próprios/mês`}
                {plan.features.pdvAccess ? " · PDV" : ""}
              </p>
            </Card>
          );
        })}
      </div>
      <BillingOpsPanel notify={notify} />
      <Card aria-labelledby="adm-funnel">
        <CardHead id="adm-funnel" kicker="Teste grátis" title="Quem ainda não assinou" />
        <dl className="kd-usage">
          <div>
            <dt>Em teste agora</dt>
            <dd className="kd-num">{trials}</dd>
          </div>
          <div>
            <dt>Teste encerrado sem plano</dt>
            <dd className="kd-num">{endedWithoutPlan}</dd>
          </div>
        </dl>
      </Card>
      <section aria-labelledby="adm-compare" className="kd-stack-sm">
        <h2 id="adm-compare" className="kd-h2">
          O que cada plano inclui
        </h2>
        <Card flush>
          <PlanComparison />
        </Card>
        <p className="kd-hint">
          Esta tabela também aparece na página pública <Link href="/planos">/planos</Link>.
        </p>
      </section>
    </div>
  );
}

/* ───────────────────────── Debug — Reset do Sistema ───────────────────────── */

type ResetScan = {
  dryRun: boolean;
  productionBlocked: boolean;
  environment: string;
  protectedAdmins: string[];
  authUsers: { total: number; toDelete: number; protected: number };
  collections: { name: string; count: number; action: "delete" | "preserve" }[];
  subcollections: { parent: string; name: string; estimatedCount: number }[];
  timestamp: string;
};

type ResetResult = {
  success: boolean;
  deletedUsers: number;
  deletedDocs: number;
  processedCollections: string[];
  protectedAdmins: string[];
  log: string[];
  errors: string[];
  timestamp: string;
};

async function adminApiCall<T>(path: string, method: string, body?: unknown): Promise<T> {
  const { getFirebaseAuth } = await import("@/lib/auth");
  const token = await getFirebaseAuth().currentUser?.getIdToken();
  if (!token) throw new Error("Sessão expirada.");
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Erro na operação.");
  return data as T;
}

function SystemResetPage({ notify }: { notify: Notify }) {
  const [scan, setScan] = useState<ResetScan | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<ResetResult | null>(null);
  const [step, setStep] = useState<"idle" | "scanned" | "confirming" | "done">("idle");

  const runScan = async () => {
    setScanning(true);
    setScanError("");
    setScan(null);
    setResult(null);
    setStep("idle");
    try {
      const data = await adminApiCall<ResetScan>("/api/admin/reset", "GET");
      setScan(data);
      setStep("scanned");
    } catch (err: any) {
      setScanError(err.message || "Erro ao escanear.");
    }
    setScanning(false);
  };

  const executeReset = async () => {
    if (confirmation !== "RESETAR KARDAPP") return;
    setExecuting(true);
    try {
      const data = await adminApiCall<ResetResult>("/api/admin/reset", "POST", { confirmation: "RESETAR KARDAPP" });
      setResult(data);
      setStep("done");
      notify(data.success ? "Reset concluído" : "Reset com erros", data.errors.length ? "error" : "success");
    } catch (err: any) {
      setScanError(err.message || "Erro ao executar reset.");
      notify(err.message || "Erro ao executar", "error");
    }
    setExecuting(false);
  };

  return (
    <div className="kd-stack kd-narrow">
      <PageHeader
        title="Debug — Reset do Sistema"
        description="Ferramenta para reinicializar o ambiente, excluindo contas e dados operacionais. Administradores globais são preservados."
      />

      <Card>
        <div style={{ padding: "4px 0" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 0", borderBottom: "2px solid var(--k-danger)" }}>
            <AlertTriangle size={24} style={{ color: "var(--k-danger-ink)", flexShrink: 0 }} />
            <div>
              <b style={{ color: "var(--k-danger-ink)", fontSize: "var(--k-fs-lg)" }}>Zona de perigo — Reset completo do sistema</b>
              <p style={{ color: "var(--k-muted)", fontSize: "var(--k-fs-sm)", marginTop: 4 }}>
                Esta ferramenta permite excluir permanentemente todas as contas e dados operacionais do sistema,
                preservando somente os administradores globais e seus registros protegidos.
              </p>
            </div>
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <Button
              variant="secondary"
              onClick={runScan}
              loading={scanning}
              icon={scanning ? undefined : <Search size={15} />}
            >
              Simular limpeza
            </Button>
          </div>

          {scanError && (
            <Callout tone="danger" role="alert" style={{ marginTop: 12 }}>
              {scanError}
            </Callout>
          )}
        </div>
      </Card>

      {scan && step !== "idle" && (
        <Card>
          <CardHead kicker="Simulação" title="Relatório de impacto" />

          <div style={{ marginTop: 8, fontSize: "var(--k-fs-sm)" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <Badge tone={scan.environment === "emulator" || scan.environment === "demo" ? "signal" : "danger"}>
                {scan.environment === "emulator" ? "Emulador" : scan.environment === "demo" ? "Demo" : "Produção"}
              </Badge>
              {scan.productionBlocked && <Badge tone="outline">Reset bloqueado</Badge>}
            </div>

            <h3 style={{ fontWeight: 700, margin: "12px 0 8px" }}>Firebase Authentication</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--k-fs-sm)" }}>
              <tbody>
                <tr style={{ borderBottom: "1px solid var(--k-line)" }}>
                  <td style={{ padding: "6px 0" }}>Usuários comuns</td>
                  <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 600, color: "var(--k-danger-ink)" }}>{scan.authUsers.toDelete} — Excluir</td>
                </tr>
                <tr style={{ borderBottom: "1px solid var(--k-line)" }}>
                  <td style={{ padding: "6px 0" }}>Administradores globais</td>
                  <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 600, color: "var(--k-success-ink)" }}>{scan.authUsers.protected} — Preservar</td>
                </tr>
              </tbody>
            </table>

            <h3 style={{ fontWeight: 700, margin: "16px 0 8px" }}>Coleções do Firestore</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--k-fs-sm)" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--k-line)" }}>
                  <th style={{ textAlign: "left", padding: "6px 0", fontWeight: 600 }}>Coleção</th>
                  <th style={{ textAlign: "right", padding: "6px 0", fontWeight: 600 }}>Documentos</th>
                  <th style={{ textAlign: "right", padding: "6px 0", fontWeight: 600 }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {scan.collections.map((c) => (
                  <tr key={c.name} style={{ borderBottom: "1px solid var(--k-line)" }}>
                    <td style={{ padding: "6px 0", fontFamily: "monospace" }}>{c.name}</td>
                    <td style={{ padding: "6px 0", textAlign: "right" }}>{c.count}</td>
                    <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 600, color: c.action === "preserve" ? "var(--k-success-ink)" : "var(--k-danger-ink)" }}>
                      {c.action === "preserve" ? "Preservar" : "Excluir"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {scan.subcollections.length > 0 && (
              <>
                <h3 style={{ fontWeight: 700, margin: "16px 0 8px" }}>Subcoleções (amostra)</h3>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--k-fs-sm)" }}>
                  <tbody>
                    {scan.subcollections.map((s) => (
                      <tr key={`${s.parent}/${s.name}`} style={{ borderBottom: "1px solid var(--k-line)" }}>
                        <td style={{ padding: "6px 0", fontFamily: "monospace" }}>{s.parent}/{s.name}</td>
                        <td style={{ padding: "6px 0", textAlign: "right" }}>~{s.estimatedCount}</td>
                        <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 600, color: "var(--k-danger-ink)" }}>Excluir</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            <h3 style={{ fontWeight: 700, margin: "16px 0 8px" }}>Admins protegidos</h3>
            <ul style={{ margin: 0, padding: "0 0 0 20px", fontSize: "var(--k-fs-sm)" }}>
              {scan.protectedAdmins.map((uid) => (
                <li key={uid} style={{ fontFamily: "monospace" }}>{uid}</li>
              ))}
            </ul>

            <p style={{ fontSize: "var(--k-fs-xs)", color: "var(--k-muted)", marginTop: 12 }}>
              Escaneado em {new Date(scan.timestamp).toLocaleString("pt-BR")}
            </p>
          </div>

          {!scan.productionBlocked && step === "scanned" && (
            <div style={{ marginTop: 20, borderTop: "2px solid var(--k-danger)", paddingTop: 16 }}>
              <Button
                variant="danger"
                onClick={() => setStep("confirming")}
                icon={<Trash2 size={15} />}
              >
                Preparar reset completo
              </Button>
            </div>
          )}

          {scan.productionBlocked && (
            <Callout tone="warn" style={{ marginTop: 16 }}>
              Reset bloqueado neste ambiente. Para habilitar, configure <code>ADMIN_ALLOW_RESET=true</code> nas variáveis de ambiente do servidor.
            </Callout>
          )}
        </Card>
      )}

      {step === "confirming" && (
        <Card>
          <CardHead kicker="Confirmação" title="Confirmar reset completo" />
          <div style={{ marginTop: 8 }}>
            <Callout tone="danger" title="Ação irreversível">
              Todos os restaurantes, usuários, pedidos, mesas e dados operacionais serão excluídos permanentemente.
              Os administradores globais e seus registros serão preservados.
            </Callout>
            <div className="kd-form" style={{ marginTop: 16 }}>
              <TextField
                label="Digite RESETAR KARDAPP para confirmar"
                placeholder="RESETAR KARDAPP"
                value={confirmation}
                error={confirmation.length > 0 && confirmation !== "RESETAR KARDAPP" ? "Digite exatamente: RESETAR KARDAPP" : ""}
                onChange={(e) => setConfirmation(e.target.value)}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <Button
                  variant="danger"
                  disabled={confirmation !== "RESETAR KARDAPP" || executing}
                  loading={executing}
                  onClick={executeReset}
                  icon={executing ? undefined : <Trash2 size={15} />}
                >
                  {executing ? "Executando reset..." : "Executar reset completo"}
                </Button>
                <Button variant="ghost" onClick={() => { setStep("scanned"); setConfirmation(""); }} disabled={executing}>
                  Cancelar
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {step === "done" && result && (
        <Card>
          <CardHead kicker="Resultado" title={result.success ? "Reset concluído" : "Reset com erros"} />
          <div style={{ marginTop: 8, fontSize: "var(--k-fs-sm)" }}>
            <dl className="kd-usage">
              <div>
                <dt>Contas excluídas</dt>
                <dd className="kd-num">{result.deletedUsers}</dd>
              </div>
              <div>
                <dt>Documentos excluídos</dt>
                <dd className="kd-num">{result.deletedDocs}</dd>
              </div>
              <div>
                <dt>Coleções processadas</dt>
                <dd className="kd-num">{result.processedCollections.length}</dd>
              </div>
            </dl>

            <h3 style={{ fontWeight: 700, margin: "16px 0 8px" }}>Log de execução</h3>
            <div style={{ background: "var(--k-sunken)", borderRadius: "var(--k-r-md)", padding: 12, maxHeight: 300, overflowY: "auto", fontFamily: "monospace", fontSize: "var(--k-fs-xs)", lineHeight: 1.6 }}>
              {result.log.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>

            {result.errors.length > 0 && (
              <>
                <h3 style={{ fontWeight: 700, margin: "16px 0 8px", color: "var(--k-danger-ink)" }}>Erros</h3>
                <ul style={{ margin: 0, padding: "0 0 0 20px", color: "var(--k-danger-ink)" }}>
                  {result.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </>
            )}

            <p style={{ fontSize: "var(--k-fs-xs)", color: "var(--k-muted)", marginTop: 12 }}>
              Executado em {new Date(result.timestamp).toLocaleString("pt-BR")}
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
