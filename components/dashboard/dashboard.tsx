"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { signOut } from "firebase/auth";
import {
  Armchair,
  BarChart3,
  Bell,
  BellRing,
  BookOpen,
  Check,
  ChevronRight,
  Copy,
  CloudOff,
  RotateCw,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  ImagePlus,
  LayoutDashboard,
  Link2,
  LogOut,
  Menu,
  Package,
  Palette,
  Pencil,
  Plus,
  Printer,
  QrCode,
  Search,
  Settings2,
  Star,
  Tags,
  Trash2,
  Video,
  X,
} from "lucide-react";
import {
  createRestaurantCategory,
  createRestaurantProduct,
  createRestaurantTable,
  deleteRestaurantCategory,
  deleteRestaurantProduct,
  deleteRestaurantTable,
  publicMenuPath,
  renameRestaurantTable,
  updateRestaurantCategory,
  updateRestaurantProduct,
} from "@/lib/restaurant-db";
import { uploadProductImage, uploadProductVideo, uploadRestaurantImage } from "@/lib/storage";
import { getFirebaseAuth } from "@/lib/auth";
import { friendlyError, isQueued } from "@/lib/async";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Modal,
  PageIntro,
  SelectField,
  Skeleton,
  Switch,
  TextArea,
  TextField,
} from "./ui";

export type Brand = { logo: string; cover: string };
export type RestaurantSettings = {
  waiter: boolean;
  bill: boolean;
  google: boolean;
  sound: boolean;
  googleReviewUrl?: string;
};
export type Call = { _key: string; _source: "sub" | "legacy"; _id: string; table: string; type: string; status: string; time: string; createdAt?: string };
export type CallStatus = "ativo" | "andamento" | "concluido";
export type Notify = (message: string, tone?: "success" | "error") => void;
export type DataLoaded = { products: boolean; categories: boolean; tables: boolean };
export type LoadErrors = Partial<Record<keyof DataLoaded, string>>;

type Setter<T> = React.Dispatch<React.SetStateAction<T>>;

export type DashboardProps = {
  path: string;
  calls: Call[];
  advanceCall: (key: string, next: CallStatus) => void;
  chamadosHasMore: boolean;
  chamadosLoading: boolean;
  chamadosError: string;
  loadMoreChamados: () => void;
  notify: Notify;
  brand: Brand;
  setBrand: Setter<Brand>;
  restaurantName: string;
  settings: RestaurantSettings;
  setSettings: Setter<RestaurantSettings>;
  foods: any[];
  categories: any[];
  tables: string[];
  tableTokens: Record<string, string>;
  pendingTables: string[];
  loaded: DataLoaded;
  loadErrors: LoadErrors;
  onRetry: () => void;
};

const QUEUED_MESSAGE =
  "Sem resposta do servidor. A alteração ficou guardada neste aparelho (marcada como “Sincronizando”) e será enviada quando a conexão voltar.";

function reportError(error: unknown, notify: Notify, fallback: string) {
  notify(isQueued(error) ? QUEUED_MESSAGE : friendlyError(error, fallback), "error");
}

function SyncBadge() {
  return (
    <span className="kd-sync" title="Salvo neste aparelho, aguardando confirmação do servidor">
      <RotateCw size={12} aria-hidden className="kd-sync-icon" /> Sincronizando
    </span>
  );
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <EmptyState
      icon={<CloudOff size={22} />}
      title="Não foi possível carregar"
      description={message}
      action={
        <Button size="sm" variant="secondary" icon={<RotateCw size={15} />} onClick={onRetry}>
          Tentar novamente
        </Button>
      }
    />
  );
}

type NavItem = { label: string; href: string; icon: typeof LayoutDashboard };

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Operação",
    items: [
      { label: "Visão geral", href: "/dashboard", icon: LayoutDashboard },
      { label: "Chamados", href: "/dashboard/chamados", icon: BellRing },
      { label: "Mesas", href: "/dashboard/mesas", icon: Armchair },
      { label: "QR Codes", href: "/dashboard/qrcodes", icon: QrCode },
    ],
  },
  {
    group: "Cardápio",
    items: [
      { label: "Cardápio", href: "/dashboard/cardapio", icon: BookOpen },
      { label: "Categorias", href: "/dashboard/categorias", icon: Tags },
      { label: "Produtos", href: "/dashboard/produtos", icon: Package },
    ],
  },
  {
    group: "Estabelecimento",
    items: [
      { label: "Avaliações", href: "/dashboard/avaliacoes", icon: Star },
      { label: "Relatórios", href: "/dashboard/relatorios", icon: BarChart3 },
      { label: "Personalização", href: "/dashboard/personalizacao", icon: Palette },
      { label: "Configurações", href: "/dashboard/configuracoes", icon: Settings2 },
    ],
  },
];

const PAGE_TITLES: Record<string, string> = {
  "/dashboard/assinatura": "Assinatura",
};

const brl = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

const productCents = (product: any) =>
  typeof product.priceCents === "number"
    ? product.priceCents
    : Math.round(Number(String(product.price || "0").replace(/\./g, "").replace(",", ".")) * 100) || 0;

const menuUrl = () =>
  `${typeof window === "undefined" ? "" : window.location.origin}${publicMenuPath()}`;

async function copyText(text: string, notify: Notify, success: string) {
  try {
    await navigator.clipboard.writeText(text);
    notify(success);
  } catch {
    notify("Não foi possível copiar automaticamente. Selecione o link e copie manualmente.", "error");
  }
}

function downloadQr(svgId: string, fileName: string) {
  const svg = document.getElementById(svgId);
  if (!svg) return false;
  const data = new XMLSerializer().serializeToString(svg);
  const img = new Image();
  img.onload = () => {
    const scale = 4;
    const canvas = document.createElement("canvas");
    canvas.width = img.width * scale + 80;
    canvas.height = img.height * scale + 80;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 40, 40, img.width * scale, img.height * scale);
    const link = document.createElement("a");
    link.download = fileName;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };
  img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(data)));
  return true;
}

function playCallTone() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const context = new Ctx();
    [0, 0.18].forEach((delay) => {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.frequency.value = delay ? 880 : 660;
      gain.gain.setValueAtTime(0.0001, context.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + delay + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + delay + 0.14);
      osc.connect(gain).connect(context.destination);
      osc.start(context.currentTime + delay);
      osc.stop(context.currentTime + delay + 0.15);
    });
    setTimeout(() => context.close(), 500);
  } catch {}
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return "Boa noite";
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function rise(index: number) {
  return { "--i": Math.min(index, 12) } as React.CSSProperties;
}

/* ───────────────────────── Shell ───────────────────────── */

export default function Dashboard(props: DashboardProps) {
  const { path, brand, restaurantName, notify, calls, settings } = props;
  const [drawer, setDrawer] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const allItems = NAV.flatMap((g) => g.items);
  const current = allItems.find((item) => item.href === path);
  const title = current?.label || PAGE_TITLES[path] || "Painel";
  const openCalls = calls.filter((c) => c.status !== "concluido").length;

  useEffect(() => {
    document.title = `${title} · Kardap`;
  }, [title]);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [drawer]);

  const { loaded } = props;
  const allLoaded = loaded.products && loaded.categories && loaded.tables;
  const [slowData, setSlowData] = useState(false);
  useEffect(() => {
    if (allLoaded) return setSlowData(false);
    const timer = setTimeout(() => setSlowData(true), 9000);
    return () => clearTimeout(timer);
  }, [allLoaded]);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const activeCount = calls.filter((c) => c.status === "ativo").length;
  const previousActive = useRef(activeCount);
  useEffect(() => {
    if (settings.sound && activeCount > previousActive.current) playCallTone();
    previousActive.current = activeCount;
  }, [activeCount, settings.sound]);

  const logout = async () => {
    setSigningOut(true);
    try {
      await signOut(getFirebaseAuth());
      ["kardap-session", "kardap-restaurant-id", "kardap-restaurant-owner", "kardap-restaurant-slug"].forEach((key) =>
        localStorage.removeItem(key),
      );
      window.location.href = "/";
    } catch {
      setSigningOut(false);
      notify("Não foi possível sair agora. Verifique sua conexão e tente de novo.", "error");
    }
  };

  return (
    <div className="kd">
      <a href="#kd-main" className="kd-skip">
        Pular para o conteúdo
      </a>
      <div className={`kd-scrim ${drawer ? "is-open" : ""}`} onClick={() => setDrawer(false)} aria-hidden />
      <aside className={`kd-side ${drawer ? "is-open" : ""}`} aria-label="Navegação do painel">
        <div className="kd-side-top">
          <Link href="/dashboard" className="kd-side-logo" aria-label="Kardap, visão geral">
            <img src="/Logo%20KARDAP%20do%20Chef%20Corredor.png" alt="Kardap" width={124} height={40} />
          </Link>
          <IconButton label="Fechar menu" className="kd-only-mobile" onClick={() => setDrawer(false)}>
            <X size={18} />
          </IconButton>
        </div>
        <nav className="kd-nav">
          {NAV.map((group) => (
            <div key={group.group} className="kd-nav-group">
              <p className="kd-nav-label">{group.group}</p>
              {group.items.map(({ label, href, icon: Icon }) => {
                const active = href === path;
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setDrawer(false)}
                    className={`kd-nav-link ${active ? "is-active" : ""}`}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon size={17} strokeWidth={1.8} aria-hidden />
                    <span>{label}</span>
                    {href === "/dashboard/chamados" && openCalls > 0 && (
                      <span className="kd-nav-count" aria-label={`${openCalls} chamados abertos`}>
                        {openCalls}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="kd-account">
          <span className="kd-avatar" aria-hidden>
            {brand.logo ? <img src={brand.logo} alt="" /> : (restaurantName.trim()[0] || "K").toUpperCase()}
          </span>
          <span className="kd-account-name">
            <b>{restaurantName || "Seu estabelecimento"}</b>
            <small>Conta do proprietário</small>
          </span>
          <IconButton label="Sair da conta" onClick={logout} disabled={signingOut}>
            <LogOut size={17} />
          </IconButton>
        </div>
      </aside>

      <div className="kd-main-wrap">
        <header className="kd-topbar">
          <IconButton label="Abrir menu" className="kd-only-mobile" onClick={() => setDrawer(true)}>
            <Menu size={20} />
          </IconButton>
          <div className="kd-topbar-title">
            <p className="kd-crumb">
              <Link href="/dashboard">Painel</Link>
              {path !== "/dashboard" && (
                <>
                  <ChevronRight size={12} aria-hidden /> <span>{title}</span>
                </>
              )}
            </p>
            <h1>{title}</h1>
          </div>
          <ButtonLink href={publicMenuPath()} external variant="secondary" icon={<ExternalLink size={15} />}>
            <span className="kd-hide-xs">Ver cardápio</span>
          </ButtonLink>
        </header>
        <main id="kd-main" className="kd-main">
          {(offline || slowData) && (
            <div className="kd-callout kd-callout--warn kd-banner" role="status">
              <span>
                {offline
                  ? "Você está sem internet. O que você alterar fica guardado neste aparelho e é enviado quando a conexão voltar."
                  : "A conexão está lenta: alguns dados ainda estão carregando."}
              </span>
              {!offline && (
                <Button size="sm" variant="secondary" icon={<RotateCw size={14} />} onClick={props.onRetry}>
                  Tentar novamente
                </Button>
              )}
            </div>
          )}
          <div key={path} className="kd-page">
            <DashboardRoutes {...props} />
          </div>
        </main>
      </div>
    </div>
  );
}

export function DashboardSkeleton({ error, slow, onRetry }: { error?: string; slow?: boolean; onRetry?: () => void } = {}) {
  if (error || slow)
    return (
      <div className="kd kd-center">
        <Card className="kd-load-card">
          {error ? (
            <LoadError message={error} onRetry={onRetry || (() => location.reload())} />
          ) : (
            <EmptyState
              icon={<RotateCw size={22} className="kd-spin" />}
              title="Está demorando mais que o normal"
              description="Ainda estamos buscando os dados do seu restaurante. Se a internet estiver instável, tente de novo."
              action={
                <Button size="sm" variant="secondary" onClick={onRetry || (() => location.reload())}>
                  Tentar novamente
                </Button>
              }
            />
          )}
        </Card>
      </div>
    );
  return (
    <div className="kd" aria-busy="true" aria-label="Carregando painel">
      <aside className="kd-side kd-side--ghost" aria-hidden>
        <div className="kd-side-top">
          <span className="kd-side-logo">
            <img src="/Logo%20KARDAP%20do%20Chef%20Corredor.png" alt="" width={124} height={40} />
          </span>
        </div>
        <div className="kd-nav">
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className="kd-skeleton kd-skeleton--nav" />
          ))}
        </div>
      </aside>
      <div className="kd-main-wrap">
        <header className="kd-topbar">
          <div className="kd-topbar-title">
            <span className="kd-skeleton" style={{ display: "block", width: 70, height: 12, marginBottom: 8 }} />
            <span className="kd-skeleton" style={{ display: "block", width: 160, height: 22 }} />
          </div>
        </header>
        <main className="kd-main">
          <div className="kd-stack">
            <span className="kd-skeleton" style={{ display: "block", width: "min(360px, 70%)", height: 40 }} />
            <div className="kd-metrics">
              {Array.from({ length: 4 }).map((_, i) => (
                <span key={i} className="kd-skeleton" style={{ height: 116 }} />
              ))}
            </div>
            <div className="kd-split">
              <span className="kd-skeleton" style={{ height: 260 }} />
              <span className="kd-skeleton" style={{ height: 260 }} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function DashboardRoutes(props: DashboardProps) {
  const { path } = props;
  switch (path) {
    case "/dashboard":
      return <Overview {...props} />;
    case "/dashboard/chamados":
      return <CallsPage {...props} />;
    case "/dashboard/cardapio":
      return <MenuPage {...props} />;
    case "/dashboard/categorias":
      return <CategoriesPage {...props} />;
    case "/dashboard/produtos":
      return <ProductsPage {...props} />;
    case "/dashboard/mesas":
      return <TablesPage {...props} />;
    case "/dashboard/qrcodes":
      return <QrPage {...props} />;
    case "/dashboard/avaliacoes":
      return <ReviewsPage {...props} />;
    case "/dashboard/relatorios":
      return <ReportsPage {...props} />;
    case "/dashboard/personalizacao":
      return <BrandPage {...props} />;
    case "/dashboard/configuracoes":
      return <SettingsPage {...props} />;
    case "/dashboard/assinatura":
      return (
        <EmptyState
          title="Assinatura"
          description="Os detalhes de plano e cobrança ainda não estão disponíveis no painel. Fale com o suporte Kardap para alterar seu plano."
        />
      );
    default:
      return (
        <EmptyState
          title="Página não encontrada"
          description="Este endereço não existe no painel."
          action={<ButtonLink href="/dashboard">Voltar para a visão geral</ButtonLink>}
        />
      );
  }
}

/* ───────────────────────── Visão geral ───────────────────────── */

function Overview({ calls, advanceCall, notify, restaurantName, foods, categories, tables, brand, loaded, loadErrors, onRetry }: DashboardProps) {
  const open = calls.filter((c) => c.status !== "concluido");
  const steps = [
    { done: categories.length > 0, label: "Crie a primeira categoria", href: "/dashboard/categorias" },
    { done: foods.length > 0, label: "Cadastre o primeiro produto", href: "/dashboard/produtos" },
    { done: tables.length > 0, label: "Cadastre suas mesas", href: "/dashboard/mesas" },
    { done: Boolean(brand.logo || brand.cover), label: "Adicione logo ou capa", href: "/dashboard/personalizacao" },
  ];
  const ready = loaded.products && loaded.categories && loaded.tables;
  const done = steps.filter((s) => s.done).length;

  const metrics = [
    { value: open.length, label: "Chamados abertos", href: "/dashboard/chamados", hot: open.length > 0 },
    { value: foods.length, label: "Produtos no cardápio", href: "/dashboard/produtos" },
    { value: categories.length, label: "Categorias", href: "/dashboard/categorias" },
    { value: tables.length, label: "Mesas com QR Code", href: "/dashboard/mesas" },
  ];

  return (
    <div className="kd-stack">
      <div className="kd-hello kd-rise" style={rise(0)}>
        <div>
          <p className="kd-kicker">{greeting()}</p>
          <h2 className="kd-display">{restaurantName || "Seu estabelecimento"}</h2>
        </div>
        <Button
          variant="secondary"
          icon={<Copy size={15} />}
          onClick={() => copyText(menuUrl(), notify, "Link do cardápio copiado")}
        >
          Copiar link do cardápio
        </Button>
      </div>

      {ready && done < steps.length && (
        <Card className="kd-setup kd-rise" style={rise(1)}>
          <div className="kd-setup-head">
            <div>
              <h3>Falta pouco para receber clientes</h3>
              <p>
                {done} de {steps.length} etapas concluídas
              </p>
            </div>
            <div className="kd-meter" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done}>
              <i style={{ width: `${(done / steps.length) * 100}%` }} />
            </div>
          </div>
          <ol className="kd-setup-list">
            {steps.map((step, i) => (
              <li key={step.href}>
                <Link href={step.href} className={step.done ? "is-done" : ""}>
                  <span className="kd-step-mark" aria-hidden>
                    {step.done ? <Check size={13} strokeWidth={3} /> : i + 1}
                  </span>
                  <span>{step.label}</span>
                  {!step.done && <ChevronRight size={15} aria-hidden />}
                  <span className="kd-sr">{step.done ? "(concluída)" : "(pendente)"}</span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <div className="kd-metrics">
        {metrics.map((m, i) => (
          <Link key={m.label} href={m.href} className={`kd-metric kd-rise ${m.hot ? "is-hot" : ""}`} style={rise(i + 1)}>
            <b>{ready || m.label === "Chamados abertos" ? m.value : "–"}</b>
            <span>{m.label}</span>
          </Link>
        ))}
      </div>

      <div className="kd-split">
        <CallsList calls={calls} advanceCall={advanceCall} notify={notify} compact />
        <Card className="kd-rise" style={rise(3)}>
          <div className="kd-card-head">
            <div>
              <p className="kd-kicker">Cardápio</p>
              <h3>Últimos produtos</h3>
            </div>
            <ButtonLink href="/dashboard/produtos" variant="link" size="sm">
              Ver todos
            </ButtonLink>
          </div>
          {loadErrors.products ? (
            <LoadError message={loadErrors.products} onRetry={onRetry} />
          ) : !loaded.products ? (
            <Skeleton rows={3} height={52} />
          ) : foods.length ? (
            <ul className="kd-mini-list">
              {foods.slice(0, 4).map((f) => (
                <li key={f.id || f.name}>
                  <ProductThumb product={f} />
                  <span>
                    <b>{f.name}</b>
                    <small>{f.category || "Sem categoria"}</small>
                  </span>
                  <span className="kd-num">{brl(productCents(f))}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<Package size={22} />}
              title="Nenhum produto ainda"
              description="Os produtos cadastrados aparecem aqui e no cardápio público."
              action={<ButtonLink href="/dashboard/produtos" variant="primary" size="sm" icon={<Plus size={15} />}>Cadastrar produto</ButtonLink>}
            />
          )}
        </Card>
      </div>
    </div>
  );
}

const uploadPercent = (...parts: (number | null)[]) => {
  const active = parts.filter((p): p is number => p !== null);
  return active.length ? Math.round(active.reduce((sum, p) => sum + p, 0) / active.length) : 0;
};

function UploadBar({ value }: { value: number }) {
  return (
    <span className="kd-upload-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-label="Progresso do envio">
      <i style={{ width: `${value}%` }} />
    </span>
  );
}

function ProductThumb({ product }: { product: any }) {
  return product.image ? (
    <img className="kd-thumb" src={product.image} alt="" loading="lazy" width={44} height={44} />
  ) : (
    <span className="kd-thumb kd-thumb--empty" aria-hidden>
      {String(product.name || "?").trim()[0]?.toUpperCase()}
    </span>
  );
}

/* ───────────────────────── Chamados ───────────────────────── */

const CALL_STATUS: Record<string, { label: string; tone: "warning" | "accent" | "muted" }> = {
  ativo: { label: "Aguardando", tone: "warning" },
  andamento: { label: "Em atendimento", tone: "accent" },
  concluido: { label: "Concluído", tone: "muted" },
};

function CallsList({
  calls,
  advanceCall,
  notify,
  compact = false,
  filter = "abertos",
}: {
  calls: Call[];
  advanceCall: (key: string, next: CallStatus) => void;
  notify: Notify;
  compact?: boolean;
  filter?: "abertos" | "concluidos" | "todos";
}) {
  const visible = calls.filter((call) =>
    filter === "todos" ? true : filter === "concluidos" ? call.status === "concluido" : call.status !== "concluido",
  );
  const advance = (call: Call) => {
    const next: CallStatus = call.status === "ativo" ? "andamento" : "concluido";
    advanceCall(call._key, next);
    notify(next === "andamento" ? `${call.table}: atendimento iniciado` : `${call.table}: chamado concluído`);
  };

  return (
    <Card className="kd-calls kd-rise" style={rise(2)}>
      {compact && (
        <div className="kd-card-head">
          <div>
            <p className="kd-kicker">
              <span className="kd-live" aria-hidden /> Tempo real
            </p>
            <h3>Chamados das mesas</h3>
          </div>
          <ButtonLink href="/dashboard/chamados" variant="link" size="sm">
            Histórico
          </ButtonLink>
        </div>
      )}
      {visible.length ? (
        <ul className="kd-call-list" role="list" aria-label="Chamados das mesas">
          {(compact ? visible.slice(0, 5) : visible).map((call, i) => {
            const status = CALL_STATUS[call.status] || CALL_STATUS.ativo;
            return (
              <li key={call._key} className={`kd-call is-${call.status} kd-rise`} style={rise(i)}>
                <span className="kd-call-icon" aria-hidden>
                  <Bell size={16} />
                </span>
                <span className="kd-call-body">
                  <b>{call.table}</b>
                  <span>{call.type}</span>
                </span>
                <span className="kd-call-meta">
                  <Badge tone={status.tone}>{status.label}</Badge>
                  <small>{call.time === "agora" ? "Agora" : `Há ${call.time}`}</small>
                </span>
                {call.status !== "concluido" && (
                  <Button
                    size="sm"
                    variant={call.status === "ativo" ? "primary" : "secondary"}
                    onClick={() => advance(call)}
                    aria-label={`${call.status === "ativo" ? "Atender" : "Concluir"} chamado da ${call.table}`}
                  >
                    {call.status === "ativo" ? "Atender" : "Concluir"}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon={<BellRing size={22} />}
          title={filter === "concluidos" ? "Nenhum chamado concluído" : "Nenhuma mesa chamando agora"}
          description={
            filter === "concluidos"
              ? "Chamados finalizados ficam registrados aqui."
              : "Quando um cliente tocar em “Chamar garçom” no cardápio, o pedido aparece aqui na hora."
          }
        />
      )}
    </Card>
  );
}

function CallsPage({ calls, advanceCall, notify, chamadosHasMore, chamadosLoading, chamadosError, loadMoreChamados }: DashboardProps) {
  const [filter, setFilter] = useState<"abertos" | "concluidos" | "todos">("abertos");
  const counts = {
    abertos: calls.filter((c) => c.status !== "concluido").length,
    concluidos: calls.filter((c) => c.status === "concluido").length,
    todos: calls.length,
  };
  return (
    <div className="kd-stack">
      <PageIntro
        description="Pedidos de atendimento enviados pelas mesas. Toque em Atender para avisar a equipe que alguém está a caminho."
      />
      <div className="kd-tabs" role="tablist" aria-label="Filtrar chamados">
        {(
          [
            ["abertos", "Abertos"],
            ["concluidos", "Concluídos"],
            ["todos", "Todos"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={filter === key}
            className={filter === key ? "is-active" : ""}
            onClick={() => setFilter(key)}
          >
            {label}
            <span className="kd-num">{counts[key]}</span>
          </button>
        ))}
      </div>
      <CallsList calls={calls} advanceCall={advanceCall} notify={notify} filter={filter} />
      {chamadosError ? (
        <LoadError message={chamadosError} onRetry={loadMoreChamados} />
      ) : chamadosHasMore ? (
        <div className="kd-row" style={{ justifyContent: "center" }}>
          <Button variant="secondary" onClick={loadMoreChamados} disabled={chamadosLoading} aria-busy={chamadosLoading || undefined}>
            {chamadosLoading ? "Carregando..." : "Carregar mais chamados"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/* ───────────────────────── Cardápio ───────────────────────── */

function MenuPage({ notify, categories, foods, loaded, loadErrors, onRetry }: DashboardProps) {
  const url = menuUrl();
  const countByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    foods.forEach((f) => {
      if (f.categoryId) map[f.categoryId] = (map[f.categoryId] || 0) + 1;
    });
    return map;
  }, [foods]);

  return (
    <div className="kd-stack">
      <Card className="kd-share kd-rise" style={rise(0)}>
        <div className="kd-share-qr" aria-hidden>
          <QRCodeSVG value={url || "https://kardap.app"} size={112} level="M" bgColor="transparent" fgColor="#000000" />
        </div>
        <div className="kd-share-body">
          <p className="kd-kicker">
            <span className="kd-live" aria-hidden /> Publicado
          </p>
          <h3>Seu cardápio está no ar</h3>
          <p className="kd-share-url">
            <Link2 size={14} aria-hidden /> <span>{url}</span>
          </p>
          <div className="kd-row">
            <Button icon={<Copy size={15} />} onClick={() => copyText(url, notify, "Link do cardápio copiado")}>
              Copiar link
            </Button>
            <ButtonLink href={publicMenuPath()} external variant="secondary" icon={<ExternalLink size={15} />}>
              Abrir
            </ButtonLink>
            <ButtonLink href="/dashboard/qrcodes" variant="ghost" icon={<QrCode size={15} />}>
              QR Codes das mesas
            </ButtonLink>
          </div>
        </div>
      </Card>

      <Card className="kd-rise" style={rise(1)}>
        <div className="kd-card-head">
          <div>
            <p className="kd-kicker">Estrutura</p>
            <h3>Como o cliente vê seu cardápio</h3>
          </div>
          <ButtonLink href="/dashboard/categorias" variant="link" size="sm">
            Editar categorias
          </ButtonLink>
        </div>
        {loadErrors.categories ? (
          <LoadError message={loadErrors.categories} onRetry={onRetry} />
        ) : !loaded.categories ? (
          <Skeleton rows={3} height={48} />
        ) : categories.length ? (
          <ol className="kd-outline">
            {categories.map((c, i) => (
              <li key={c.id} className="kd-rise" style={rise(i)}>
                <span className="kd-outline-index kd-num">{String(i + 1).padStart(2, "0")}</span>
                <b>{c.name}</b>
                <span className="kd-muted">
                  {countByCategory[c.id] || 0} {(countByCategory[c.id] || 0) === 1 ? "produto" : "produtos"}
                </span>
                {!c.active && <Badge tone="muted">Oculta</Badge>}
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState
            icon={<Tags size={22} />}
            title="O cardápio ainda está vazio"
            description="Comece criando categorias como Entradas, Pratos e Bebidas. Depois adicione os produtos em cada uma."
            action={<ButtonLink href="/dashboard/categorias" variant="primary" size="sm" icon={<Plus size={15} />}>Criar categoria</ButtonLink>}
          />
        )}
      </Card>
    </div>
  );
}

/* ───────────────────────── Categorias ───────────────────────── */

function CategoriesPage({ notify, categories, foods, loaded, loadErrors, onRetry }: DashboardProps) {
  const [editing, setEditing] = useState<any | "new" | null>(null);
  const [removing, setRemoving] = useState<any | null>(null);
  const count = (id: string) => foods.filter((f) => f.categoryId === id).length;

  return (
    <div className="kd-stack">
      <PageIntro
        description="Seções do seu cardápio, na ordem em que o cliente vê. Categorias ocultas não aparecem no link público."
        actions={
          <Button icon={<Plus size={16} />} onClick={() => setEditing("new")}>
            Nova categoria
          </Button>
        }
      />
      <Card className="kd-flush">
        {loadErrors.categories ? (
          <LoadError message={loadErrors.categories} onRetry={onRetry} />
        ) : !loaded.categories ? (
          <div className="kd-pad">
            <Skeleton rows={4} />
          </div>
        ) : categories.length ? (
          <ul className="kd-rows">
            {categories.map((c, i) => {
              const n = count(c.id);
              return (
                <li key={c.id} className="kd-row-item kd-rise" style={rise(i)}>
                  <span className="kd-outline-index kd-num">{String(c.order ?? i).padStart(2, "0")}</span>
                  <span className="kd-row-main">
                    <b>{c.name}</b>
                    <small>{c.description || `${n} ${n === 1 ? "produto" : "produtos"}`}</small>
                  </span>
                  {c.pending ? <SyncBadge /> : <Badge tone={c.active ? "success" : "muted"}>{c.active ? "Visível" : "Oculta"}</Badge>}
                  <span className="kd-row-actions">
                    <IconButton label={`Editar ${c.name}`} onClick={() => setEditing(c)}>
                      <Pencil size={16} />
                    </IconButton>
                    <IconButton label={`Excluir ${c.name}`} tone="danger" onClick={() => setRemoving({ ...c, count: n })}>
                      <Trash2 size={16} />
                    </IconButton>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon={<Tags size={22} />}
            title="Nenhuma categoria criada"
            description="Categorias organizam o cardápio. Exemplos: Entradas, Pizzas, Bebidas, Sobremesas."
            action={<Button size="sm" icon={<Plus size={15} />} onClick={() => setEditing("new")}>Criar primeira categoria</Button>}
          />
        )}
      </Card>

      {editing && (
        <CategoryForm
          category={editing === "new" ? null : editing}
          nextOrder={categories.length}
          notify={notify}
          onClose={() => setEditing(null)}
        />
      )}
      {removing && (
        <ConfirmDialog
          title={`Excluir “${removing.name}”?`}
          description={
            removing.count > 0
              ? `Esta categoria tem ${removing.count} ${removing.count === 1 ? "produto vinculado" : "produtos vinculados"}. Mova ou exclua esses produtos antes, ou apenas oculte a categoria.`
              : "A categoria sai do cardápio público. Essa ação não pode ser desfeita."
          }
          confirmLabel="Excluir categoria"
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            try {
              await deleteRestaurantCategory(removing.id);
              notify("Categoria excluída");
            } catch (error) {
              reportError(error, notify, "Não foi possível excluir a categoria. Tente de novo.");
              return isQueued(error) ? undefined : false;
            }
          }}
        />
      )}
    </div>
  );
}

function CategoryForm({
  category,
  nextOrder,
  notify,
  onClose,
}: {
  category: any | null;
  nextOrder: number;
  notify: Notify;
  onClose: () => void;
}) {
  const [name, setName] = useState(category?.name || "");
  const [description, setDescription] = useState(category?.description || "");
  const [order, setOrder] = useState(String(category?.order ?? nextOrder));
  const [active, setActive] = useState<boolean>(category?.active ?? true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!name.trim()) return setError("Dê um nome para a categoria.");
    setSaving(true);
    try {
      const data = { name, description, order: Number(order) || 0, active };
      if (category) await updateRestaurantCategory(category.id, data);
      else await createRestaurantCategory(data);
      notify(category ? "Categoria atualizada" : "Categoria criada");
      onClose();
    } catch (err) {
      reportError(err, notify, "Não foi possível salvar a categoria. Tente de novo.");
      // Se a gravação ficou na fila, reenviar criaria uma duplicata: fecha e deixa a sincronização terminar.
      if (isQueued(err)) return onClose();
      setSaving(false);
    }
  };

  return (
    <Modal
      title={category ? "Editar categoria" : "Nova categoria"}
      onClose={saving ? () => undefined : onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="kd-category-form" loading={saving}>
            {category ? "Salvar alterações" : "Criar categoria"}
          </Button>
        </>
      }
    >
      <form id="kd-category-form" className="kd-form" onSubmit={save} noValidate>
        <TextField
          label="Nome"
          placeholder="Ex.: Pizzas"
          value={name}
          maxLength={60}
          error={error}
          onChange={(e) => {
            setName(e.target.value);
            setError("");
          }}
        />
        <TextField
          label="Descrição"
          hint="Opcional. Aparece abaixo do nome da categoria."
          value={description}
          maxLength={140}
          onChange={(e) => setDescription(e.target.value)}
        />
        <TextField
          label="Posição no cardápio"
          hint="Números menores aparecem primeiro."
          type="number"
          inputMode="numeric"
          min={0}
          value={order}
          onChange={(e) => setOrder(e.target.value)}
        />
        <Switch
          label="Visível no cardápio"
          description="Desative para esconder a categoria sem excluí-la."
          checked={active}
          onChange={setActive}
        />
      </form>
    </Modal>
  );
}

/* ───────────────────────── Produtos ───────────────────────── */

function ProductsPage({ notify, foods, categories, loaded, loadErrors, onRetry }: DashboardProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [toggling, setToggling] = useState<string | null>(null);
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [categoryFilter, setCategoryFilter] = useState(() => searchParams.get("cat") ?? "");
  const [mediaFilter, setMediaFilter] = useState(() => searchParams.get("media") ?? "");
  const pushParams = useCallback((q: string, cat: string, media: string) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (cat) params.set("cat", cat);
    if (media) params.set("media", media);
    const qs = params.toString();
    router.replace(qs ? `/dashboard/produtos?${qs}` : "/dashboard/produtos", { scroll: false });
  }, [router]);
  const [editing, setEditing] = useState<any | "new" | null>(null);
  const [removing, setRemoving] = useState<any | null>(null);
  const activeCategories = categories.filter((c) => c.active);

  const filtered = foods.filter((f) => {
    const q = query.trim().toLowerCase();
    if (q && !String(f.name).toLowerCase().includes(q) && !String(f.description || "").toLowerCase().includes(q)) return false;
    if (categoryFilter && f.categoryId !== categoryFilter) return false;
    if (mediaFilter === "video" && !f.videoUrl) return false;
    if (mediaFilter === "sem-foto" && f.image) return false;
    if (mediaFilter === "ocultos" && f.available !== false) return false;
    return true;
  });
  const hasFilters = Boolean(query || categoryFilter || mediaFilter);

  const toggleAvailable = async (f: any) => {
    setToggling(f.id);
    try {
      await updateRestaurantProduct(f.id, { available: f.available === false });
      notify(f.available === false ? `${f.name} voltou ao cardápio` : `${f.name} foi ocultado do cardápio`);
    } catch (error) {
      reportError(error, notify, "Não foi possível alterar a disponibilidade. Tente de novo.");
    } finally {
      setToggling(null);
    }
  };

  return (
    <div className="kd-stack">
      <PageIntro
        description="Tudo o que aparece no cardápio. Produtos ocultos ficam salvos aqui, mas o cliente não vê."
        actions={
          <Button
            icon={<Plus size={16} />}
            onClick={() =>
              activeCategories.length
                ? setEditing("new")
                : notify("Crie uma categoria visível antes de cadastrar produtos.", "error")
            }
          >
            Novo produto
          </Button>
        }
      />

      {loaded.categories && !activeCategories.length && (
        <div className="kd-callout">
          <span>Para cadastrar produtos, primeiro crie uma categoria visível.</span>
          <ButtonLink href="/dashboard/categorias" size="sm" variant="secondary">
            Ir para categorias
          </ButtonLink>
        </div>
      )}

      <div className="kd-toolbar" role="search">
        <label className="kd-search">
          <Search size={16} aria-hidden />
          <input
            type="search"
            placeholder="Buscar por nome ou descrição"
            aria-label="Buscar produto"
            value={query}
            onChange={(e) => { setQuery(e.target.value); pushParams(e.target.value, categoryFilter, mediaFilter); }}
          />
        </label>
        <select aria-label="Filtrar por categoria" value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); pushParams(query, e.target.value, mediaFilter); }}>
          <option value="">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select aria-label="Filtrar por situação" value={mediaFilter} onChange={(e) => { setMediaFilter(e.target.value); pushParams(query, categoryFilter, e.target.value); }}>
          <option value="">Todas as situações</option>
          <option value="video">Com vídeo</option>
          <option value="sem-foto">Sem foto</option>
          <option value="ocultos">Ocultos</option>
        </select>
      </div>

      <Card className="kd-flush">
        {loadErrors.products ? (
          <LoadError message={loadErrors.products} onRetry={onRetry} />
        ) : !loaded.products ? (
          <div className="kd-pad">
            <Skeleton rows={5} height={60} />
          </div>
        ) : filtered.length ? (
          <ul className="kd-rows" role="list" aria-label={`${filtered.length} produto${filtered.length !== 1 ? "s" : ""}`}>
            {filtered.map((f, i) => (
              <li key={f.id || f.name + i} className={`kd-row-item kd-product kd-rise ${f.available === false ? "is-off" : ""}`} style={{ ...rise(i), contentVisibility: "auto", containIntrinsicSize: "0 68px" }}>
                <ProductThumb product={f} />
                <span className="kd-row-main">
                  <b>{f.name}</b>
                  <small>{f.category || "Sem categoria"}</small>
                </span>
                <span className="kd-product-tags">
                  {f.videoUrl && (
                    <Badge tone="accent">
                      <Video size={12} aria-hidden /> Vídeo
                    </Badge>
                  )}
                  {f.available === false && <Badge tone="muted">Oculto</Badge>}
                  {f.pending && <SyncBadge />}
                </span>
                <span className="kd-num kd-price">{brl(productCents(f))}</span>
                <span className="kd-row-actions">
                  <IconButton
                    label={f.available === false ? `Mostrar ${f.name} no cardápio` : `Ocultar ${f.name} do cardápio`}
                    onClick={() => toggleAvailable(f)}
                    disabled={toggling === f.id}
                    aria-busy={toggling === f.id || undefined}
                  >
                    {toggling === f.id ? <RotateCw size={16} className="kd-spin" /> : f.available === false ? <EyeOff size={16} /> : <Eye size={16} />}
                  </IconButton>
                  <IconButton label={`Editar ${f.name}`} onClick={() => setEditing(f)}>
                    <Pencil size={16} />
                  </IconButton>
                  <IconButton label={`Excluir ${f.name}`} tone="danger" onClick={() => setRemoving(f)}>
                    <Trash2 size={16} />
                  </IconButton>
                </span>
              </li>
            ))}
          </ul>
        ) : hasFilters ? (
          <EmptyState
            icon={<Search size={22} />}
            title="Nenhum produto encontrado"
            description="Ajuste a busca ou limpe os filtros para ver todos os produtos."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setQuery(""); setCategoryFilter(""); setMediaFilter("");
                  pushParams("", "", "");
                }}
              >
                Limpar filtros
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<Package size={22} />}
            title="Nenhum produto cadastrado"
            description="Cadastre pratos e bebidas com preço, descrição, foto e vídeo curto."
          />
        )}
      </Card>

      {editing && (
        <ProductForm
          product={editing === "new" ? null : editing}
          categories={categories}
          notify={notify}
          onClose={() => setEditing(null)}
        />
      )}
      {removing && (
        <ConfirmDialog
          title={`Excluir “${removing.name}”?`}
          description="O produto sai do cardápio e do painel. Se quiser apenas tirar de circulação por um tempo, use Ocultar."
          confirmLabel="Excluir produto"
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            try {
              await deleteRestaurantProduct(removing.id);
              notify("Produto excluído");
            } catch (error) {
              reportError(error, notify, "Não foi possível excluir o produto. Tente de novo.");
              return isQueued(error) ? undefined : false;
            }
          }}
        />
      )}
    </div>
  );
}

function ProductForm({
  product,
  categories,
  notify,
  onClose,
}: {
  product: any | null;
  categories: any[];
  notify: Notify;
  onClose: () => void;
}) {
  const [name, setName] = useState(product?.name || "");
  const [cents, setCents] = useState<number>(product ? productCents(product) : 0);
  const [categoryId, setCategoryId] = useState(product?.categoryId || "");
  const [description, setDescription] = useState(product?.description || "");
  const [image, setImage] = useState<File | null>(null);
  const [video, setVideo] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"" | "uploading" | "saving">("");
  const [progress, setProgress] = useState<{ image?: number; video?: number }>({});
  const uploaded = useRef<{ image?: { file: File; url: string }; video?: { file: File; url: string } }>({});
  const imagePreview = useMemo(() => (image ? URL.createObjectURL(image) : product?.image || ""), [image, product]);
  useEffect(() => () => {
    if (image) URL.revokeObjectURL(imagePreview);
  }, [image, imagePreview]);

  const validate = () => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Informe o nome do produto.";
    if (!categoryId) next.category = "Escolha uma categoria.";
    if (cents <= 0) next.price = "Informe um preço maior que zero.";
    if (image && (!/^image\/(png|jpe?g|webp)$/.test(image.type) || image.size > 10 * 1024 * 1024))
      next.image = "Use PNG, JPG ou WebP de até 10 MB.";
    if (video && (!/^video\/(mp4|webm|quicktime)$/.test(video.type) || video.size > 100 * 1024 * 1024))
      next.video = "Use MP4, WebM ou MOV de até 100 MB.";
    setErrors(next);
    return !Object.keys(next).length;
  };

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!validate()) return;
    const category = categories.find((c) => c.id === categoryId);
    try {
      setStatus(image || video ? "uploading" : "saving");
      // Reaproveita arquivos já enviados numa tentativa anterior que falhou só ao salvar.
      const send = async (kind: "image" | "video", file: File | null) => {
        if (!file) return undefined;
        const cached = uploaded.current[kind];
        if (cached && cached.file === file) return cached.url;
        const url = await (kind === "image" ? uploadProductImage : uploadProductVideo)(file, (pct) =>
          setProgress((current) => ({ ...current, [kind]: pct })),
        );
        uploaded.current[kind] = { file, url };
        return url;
      };
      const [imageUrl, videoUrl] = await Promise.all([send("image", image), send("video", video)]);
      setStatus("saving");
      const data = {
        name,
        categoryId,
        category: category?.name || "",
        description,
        price: (cents / 100).toFixed(2).replace(".", ","),
        priceCents: cents,
        ...(imageUrl ? { image: imageUrl } : {}),
        ...(videoUrl ? { videoUrl } : {}),
      };
      if (product) await updateRestaurantProduct(product.id, data);
      else await createRestaurantProduct({ ...data, available: true });
      notify(product ? "Produto atualizado" : "Produto adicionado ao cardápio");
      onClose();
    } catch (err) {
      reportError(err, notify, "Não foi possível salvar o produto. Seus dados continuam no formulário; tente de novo.");
      if (isQueued(err)) return onClose();
      setStatus("");
      setProgress({});
    }
  };

  const busy = Boolean(status);
  return (
    <Modal
      title={product ? "Editar produto" : "Novo produto"}
      description={product ? undefined : "Os campos marcados são obrigatórios."}
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" form="kd-product-form" loading={busy}>
            {status === "uploading"
              ? `Enviando mídia… ${uploadPercent(image ? progress.image ?? 0 : null, video ? progress.video ?? 0 : null)}%`
              : status === "saving"
                ? "Salvando…"
                : product
                  ? "Salvar alterações"
                  : "Adicionar produto"}
          </Button>
        </>
      }
    >
      <form id="kd-product-form" className="kd-form" onSubmit={save} noValidate>
        <fieldset className="kd-fieldset" disabled={busy}>
        <TextField
          label="Nome *"
          placeholder="Ex.: Pizza Margherita"
          value={name}
          maxLength={80}
          error={errors.name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="kd-form-grid">
          <TextField
            label="Preço *"
            inputMode="numeric"
            value={brl(cents)}
            error={errors.price}
            onChange={(e) => setCents(Math.min(Number(e.target.value.replace(/\D/g, "")) || 0, 99999999))}
          />
          <SelectField label="Categoria *" value={categoryId} error={errors.category} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Selecione</option>
            {categories
              .filter((c) => c.active || c.id === categoryId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </SelectField>
        </div>
        <TextArea
          label="Descrição"
          hint="Ingredientes, tamanho, acompanhamentos."
          rows={3}
          maxLength={400}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="kd-form-grid">
          <label className={`kd-drop ${errors.image ? "is-invalid" : ""}`}>
            <input type="file" accept="image/png,image/jpeg,image/webp" className="kd-sr" onChange={(e) => setImage(e.target.files?.[0] || null)} />
            {imagePreview ? (
              <img src={imagePreview} alt="Prévia da foto do produto" />
            ) : (
              <ImagePlus size={22} aria-hidden />
            )}
            <b>{imagePreview ? "Trocar foto" : "Adicionar foto"}</b>
            <small>{errors.image || image?.name || "PNG, JPG ou WebP · até 10 MB"}</small>
            {image && progress.image !== undefined && <UploadBar value={progress.image} />}
          </label>
          <label className={`kd-drop ${errors.video ? "is-invalid" : ""}`}>
            <input type="file" accept="video/mp4,video/webm,video/quicktime" className="kd-sr" onChange={(e) => setVideo(e.target.files?.[0] || null)} />
            <Video size={22} aria-hidden />
            <b>{video || product?.videoUrl ? "Trocar vídeo" : "Adicionar vídeo"}</b>
            <small>{errors.video || video?.name || (product?.videoUrl ? "Vídeo atual mantido" : "MP4, WebM ou MOV · até 100 MB")}</small>
            {video && progress.video !== undefined && <UploadBar value={progress.video} />}
          </label>
        </div>
        </fieldset>
      </form>
    </Modal>
  );
}

/* ───────────────────────── Mesas ───────────────────────── */

function tableLink(table: string, tokens: Record<string, string>) {
  return `${menuUrl()}?mesa=${encodeURIComponent(tokens[table] || table)}`;
}

function TablesPage({ notify, tables, tableTokens, loaded, loadErrors, onRetry, pendingTables }: DashboardProps) {
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  const create = async () => {
    setCreating(true);
    try {
      const table = await createRestaurantTable();
      notify(`${table.name} criada com QR Code próprio`);
    } catch (error) {
      reportError(error, notify, "Não foi possível criar a mesa. Tente de novo.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="kd-stack">
      <PageIntro
        description={`Cada mesa tem um QR Code único: os chamados chegam identificados com o nome da mesa.${loaded.tables ? ` ${tables.length} ${tables.length === 1 ? "mesa cadastrada" : "mesas cadastradas"}.` : ""}`}
        actions={
          <Button icon={<Plus size={16} />} loading={creating} onClick={create}>
            Nova mesa
          </Button>
        }
      />
      {loadErrors.tables ? (
        <Card>
          <LoadError message={loadErrors.tables} onRetry={onRetry} />
        </Card>
      ) : !loaded.tables ? (
        <div className="kd-tables">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className="kd-skeleton" style={{ height: 82 }} />
          ))}
        </div>
      ) : tables.length ? (
        <div className="kd-tables" role="list" aria-label="Mesas cadastradas">
          {tables.map((t, i) => (
            <Card as="article" role="listitem" key={t} className="kd-table kd-rise" style={rise(i)}>
              <button className="kd-table-qr" onClick={() => setViewing(t)} aria-label={`Ver QR Code da ${t}`}>
                <QRCodeSVG value={tableLink(t, tableTokens)} size={56} level="L" bgColor="transparent" fgColor="#000000" />
              </button>
              <span className="kd-table-name">
                <b>{t}</b>
                {pendingTables.includes(t) ? <SyncBadge /> : <small>QR Code ativo</small>}
              </span>
              <span className="kd-row-actions">
                <IconButton label={`Renomear ${t}`} onClick={() => setRenaming(t)}>
                  <Pencil size={16} />
                </IconButton>
                <IconButton label={`Excluir ${t}`} tone="danger" onClick={() => setRemoving(t)}>
                  <Trash2 size={16} />
                </IconButton>
              </span>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={<Armchair size={22} />}
            title="Nenhuma mesa cadastrada"
            description="Crie as mesas do salão para gerar um QR Code por mesa. Assim você sabe exatamente de onde vem cada chamado."
            action={<Button size="sm" icon={<Plus size={15} />} loading={creating} onClick={create}>Criar primeira mesa</Button>}
          />
        </Card>
      )}

      {renaming && <RenameTable current={renaming} notify={notify} onClose={() => setRenaming(null)} />}
      {removing && (
        <ConfirmDialog
          title={`Excluir ${removing}?`}
          description="O QR Code impresso desta mesa deixa de funcionar. Se for reutilizar a mesa, prefira renomeá-la."
          confirmLabel="Excluir mesa"
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            try {
              await deleteRestaurantTable(removing);
              notify(`${removing} excluída`);
            } catch (error) {
              reportError(error, notify, "Não foi possível excluir a mesa. Tente de novo.");
              return isQueued(error) ? undefined : false;
            }
          }}
        />
      )}
      {viewing && (
        <Modal
          title={viewing}
          description="Aponte a câmera do celular para testar."
          onClose={() => setViewing(null)}
          size="sm"
          footer={
            <>
              <ButtonLink href={tableLink(viewing, tableTokens)} external variant="ghost" icon={<ExternalLink size={15} />}>
                Abrir link
              </ButtonLink>
              <Button
                icon={<Download size={15} />}
                onClick={() => {
                  if (downloadQr("kd-qr-modal", `QR-${viewing.replace(/\s+/g, "-")}.png`)) notify("Download do QR Code iniciado");
                }}
              >
                Baixar PNG
              </Button>
            </>
          }
        >
          <div className="kd-qr-big">
            <QRCodeSVG id="kd-qr-modal" value={tableLink(viewing, tableTokens)} size={220} level="M" bgColor="#ffffff" fgColor="#000000" includeMargin />
          </div>
        </Modal>
      )}
    </div>
  );
}

function RenameTable({ current, notify, onClose }: { current: string; notify: Notify; onClose: () => void }) {
  const [name, setName] = useState(current);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!name.trim()) return setError("O nome da mesa não pode ficar vazio.");
    if (name.trim() === current) return onClose();
    setSaving(true);
    try {
      await renameRestaurantTable(current, name);
      notify("Mesa renomeada. O QR Code continua o mesmo.");
      onClose();
    } catch (err) {
      reportError(err, notify, "Não foi possível renomear a mesa. Tente de novo.");
      if (isQueued(err)) return onClose();
      setSaving(false);
    }
  };
  return (
    <Modal
      title="Renomear mesa"
      size="sm"
      onClose={saving ? () => undefined : onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="kd-rename-form" loading={saving}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="kd-rename-form" className="kd-form" onSubmit={save} noValidate>
        <TextField
          label="Nome da mesa"
          hint="Ex.: Mesa 12, Varanda 3, Balcão. O QR Code impresso não muda."
          value={name}
          maxLength={40}
          error={error}
          onChange={(e) => {
            setName(e.target.value);
            setError("");
          }}
        />
      </form>
    </Modal>
  );
}

/* ───────────────────────── QR Codes ───────────────────────── */

function QrPage({ notify, tables, tableTokens, restaurantName, loaded, loadErrors, onRetry }: DashboardProps) {
  return (
    <div className="kd-stack">
      <PageIntro
        description="Imprima e cole um código em cada mesa. A impressão já sai organizada em folha A4, com o nome da mesa abaixo de cada código."
        actions={
          tables.length > 0 && (
            <Button icon={<Printer size={16} />} onClick={() => window.print()}>
              Imprimir todos
            </Button>
          )
        }
      />
      {loadErrors.tables ? (
        <Card>
          <LoadError message={loadErrors.tables} onRetry={onRetry} />
        </Card>
      ) : !loaded.tables ? (
        <div className="kd-qr-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i} className="kd-skeleton" style={{ height: 280 }} />
          ))}
        </div>
      ) : tables.length ? (
        <div className="kd-qr-grid kd-print-area">
          {tables.map((t, i) => {
            const id = `kd-qr-${i}`;
            return (
              <Card as="article" key={t} className="kd-qr-card kd-rise" style={rise(i)}>
                <small className="kd-qr-brand">{restaurantName || "Cardápio digital"}</small>
                <QRCodeSVG id={id} value={tableLink(t, tableTokens)} size={148} level="M" bgColor="#ffffff" fgColor="#000000" includeMargin />
                <b>{t}</b>
                <small className="kd-qr-hint">Aponte a câmera para ver o cardápio</small>
                <div className="kd-qr-actions kd-no-print">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Download size={14} />}
                    onClick={() => {
                      if (downloadQr(id, `QR-${t.replace(/\s+/g, "-")}.png`)) notify(`Download do QR Code da ${t} iniciado`);
                    }}
                  >
                    PNG
                  </Button>
                  <ButtonLink href={tableLink(t, tableTokens)} external size="sm" variant="ghost" icon={<ExternalLink size={14} />}>
                    Testar
                  </ButtonLink>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={<QrCode size={22} />}
            title="Nenhum QR Code para imprimir"
            description="Os QR Codes são gerados automaticamente quando você cadastra as mesas."
            action={<ButtonLink href="/dashboard/mesas" variant="primary" size="sm">Cadastrar mesas</ButtonLink>}
          />
        </Card>
      )}
    </div>
  );
}

/* ───────────────────────── Avaliações ───────────────────────── */

function ReviewsPage({ settings, setSettings, notify }: DashboardProps) {
  const [url, setUrl] = useState(settings.googleReviewUrl || "");
  const [error, setError] = useState("");
  const saved = (settings.googleReviewUrl || "") === url.trim();

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const value = url.trim();
    if (value) {
      try {
        const parsed = new URL(value);
        if (!/^https?:$/.test(parsed.protocol)) throw new Error();
      } catch {
        return setError("Cole um link completo, começando com https://");
      }
    }
    setError("");
    setSettings((current) => ({ ...current, googleReviewUrl: value }));
    notify(value ? "Link de avaliação salvo" : "Link de avaliação removido");
  };

  return (
    <div className="kd-stack kd-narrow">
      <PageIntro
        description="Depois de atendido, o cliente pode abrir sua página de avaliação direto pelo cardápio. Mais avaliações ajudam o restaurante a aparecer nas buscas da região."
      />
      <Card>
        <form className="kd-form" onSubmit={save} noValidate>
          <TextField
            label="Link de avaliação do Google"
            type="url"
            inputMode="url"
            placeholder="https://g.page/r/…/review"
            value={url}
            error={error}
            hint={
              <>
                No Perfil da Empresa no Google, toque em <b>Pedir avaliações</b> e copie o link.
              </>
            }
            onChange={(e) => {
              setUrl(e.target.value);
              setError("");
            }}
          />
          <div className="kd-row">
            <Button type="submit" disabled={saved}>
              {saved && url ? "Salvo" : "Salvar link"}
            </Button>
            {settings.googleReviewUrl && (
              <ButtonLink href={settings.googleReviewUrl} external variant="ghost" icon={<ExternalLink size={15} />}>
                Testar link
              </ButtonLink>
            )}
          </div>
        </form>
      </Card>
      <Card>
        <Switch
          label="Mostrar botão “Avaliar” no cardápio"
          description={
            settings.googleReviewUrl
              ? "O botão aparece para o cliente na tela inicial do cardápio."
              : "Salve o link acima para o botão aparecer no cardápio."
          }
          checked={settings.google}
          onChange={(checked) => {
            setSettings((current) => ({ ...current, google: checked }));
            notify(checked ? "Botão de avaliação ativado" : "Botão de avaliação desativado");
          }}
        />
      </Card>
    </div>
  );
}

/* ───────────────────────── Relatórios ───────────────────────── */

function ReportsPage({ calls, foods, categories, tables }: DashboardProps) {
  const byType = useMemo(() => {
    const map = new Map<string, number>();
    calls.forEach((c) => map.set(c.type, (map.get(c.type) || 0) + 1));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [calls]);
  const byTable = useMemo(() => {
    const map = new Map<string, number>();
    calls.forEach((c) => map.set(c.table, (map.get(c.table) || 0) + 1));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [calls]);
  const max = Math.max(1, ...byType.map(([, n]) => n), ...byTable.map(([, n]) => n));
  const done = calls.filter((c) => c.status === "concluido").length;
  const hidden = foods.filter((f) => f.available === false).length;
  const noPhoto = foods.filter((f) => !f.image).length;

  return (
    <div className="kd-stack">
      <PageIntro
        description="Números calculados a partir dos chamados e do cardápio registrados nesta conta."
      />
      <div className="kd-metrics">
        {[
          [calls.length, "Chamados registrados"],
          [done, "Chamados concluídos"],
          [foods.length - hidden, "Produtos visíveis"],
          [noPhoto, "Produtos sem foto"],
        ].map(([value, label], i) => (
          <div key={String(label)} className="kd-metric kd-rise" style={rise(i)}>
            <b>{value}</b>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="kd-split">
        <Card className="kd-rise" style={rise(2)}>
          <div className="kd-card-head">
            <h3>Motivos dos chamados</h3>
          </div>
          {byType.length ? (
            <BarList rows={byType} max={max} />
          ) : (
            <EmptyState title="Sem chamados ainda" description="Quando as mesas começarem a chamar, você verá aqui os motivos mais comuns." />
          )}
        </Card>
        <Card className="kd-rise" style={rise(3)}>
          <div className="kd-card-head">
            <h3>Mesas que mais chamaram</h3>
          </div>
          {byTable.length ? (
            <BarList rows={byTable} max={max} />
          ) : (
            <EmptyState
              title="Sem dados por mesa"
              description={tables.length ? "Os chamados aparecem aqui por mesa assim que forem feitos." : "Cadastre mesas para acompanhar os chamados por mesa."}
            />
          )}
        </Card>
      </div>
      {categories.length > 0 && noPhoto > 0 && (
        <div className="kd-callout">
          <span>
            {noPhoto} {noPhoto === 1 ? "produto está" : "produtos estão"} sem foto. Pratos com foto costumam ser escolhidos com mais facilidade no cardápio.
          </span>
          <ButtonLink href="/dashboard/produtos" size="sm" variant="secondary">
            Revisar produtos
          </ButtonLink>
        </div>
      )}
    </div>
  );
}

function BarList({ rows, max }: { rows: [string, number][]; max: number }) {
  return (
    <ul className="kd-bars">
      {rows.map(([label, n], i) => (
        <li key={label}>
          <span className="kd-bars-label">{label}</span>
          <span className="kd-bars-track">
            <i style={{ width: `${(n / max) * 100}%`, ...rise(i) }} />
          </span>
          <b className="kd-num">{n}</b>
        </li>
      ))}
    </ul>
  );
}

/* ───────────────────────── Personalização ───────────────────────── */

function BrandPage({ brand, setBrand, restaurantName, notify }: DashboardProps) {
  const [uploading, setUploading] = useState<"" | "logo" | "cover">("");
  const [pct, setPct] = useState(0);
  const upload = async (input: HTMLInputElement, key: "logo" | "cover") => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    setUploading(key);
    setPct(0);
    try {
      const url = await uploadRestaurantImage(file, key === "logo" ? "logos" : "capas", setPct);
      setBrand((current) => ({ ...current, [key]: url }));
      notify(key === "logo" ? "Logo atualizada no cardápio" : "Capa atualizada no cardápio");
    } catch (error) {
      reportError(error, notify, "Não foi possível enviar a imagem. Tente de novo.");
    } finally {
      setUploading("");
    }
  };

  return (
    <div className="kd-brand">
      <div className="kd-stack">
        <PageIntro
          description="Logo e capa aparecem no topo do cardápio público. As alterações são salvas assim que o envio termina."
        />
        <Card>
          <div className="kd-upload-row">
            <span className="kd-avatar kd-avatar--lg" aria-hidden>
              {brand.logo ? <img src={brand.logo} alt="" /> : (restaurantName.trim()[0] || "K").toUpperCase()}
            </span>
            <span className="kd-row-main">
              <b>Logo</b>
              <small>Quadrada, PNG, JPG ou WebP até 10 MB.</small>
            </span>
            <label className={`kd-btn kd-btn--secondary kd-btn--sm ${uploading ? "is-disabled" : ""}`}>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="kd-sr"
                disabled={Boolean(uploading)}
                onChange={(e) => upload(e.currentTarget, "logo")}
              />
              <span aria-live="polite">{uploading === "logo" ? `Enviando… ${pct}%` : brand.logo ? "Trocar" : "Enviar"}</span>
            </label>
            {brand.logo && (
              <IconButton label="Remover logo" tone="danger" onClick={() => setBrand((c) => ({ ...c, logo: "" }))}>
                <Trash2 size={16} />
              </IconButton>
            )}
          </div>
          <hr className="kd-hr" />
          <div className="kd-upload-row">
            <span className="kd-cover-thumb" style={brand.cover ? { backgroundImage: `url(${brand.cover})` } : undefined} aria-hidden />
            <span className="kd-row-main">
              <b>Foto de capa</b>
              <small>Horizontal, de preferência do salão ou de um prato da casa.</small>
            </span>
            <label className={`kd-btn kd-btn--secondary kd-btn--sm ${uploading ? "is-disabled" : ""}`}>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="kd-sr"
                disabled={Boolean(uploading)}
                onChange={(e) => upload(e.currentTarget, "cover")}
              />
              <span aria-live="polite">{uploading === "cover" ? `Enviando… ${pct}%` : brand.cover ? "Trocar" : "Enviar"}</span>
            </label>
            {brand.cover && (
              <IconButton label="Remover capa" tone="danger" onClick={() => setBrand((c) => ({ ...c, cover: "" }))}>
                <Trash2 size={16} />
              </IconButton>
            )}
          </div>
        </Card>
      </div>
      <figure className="kd-phone" aria-label="Prévia do topo do cardápio">
        <div className="kd-phone-screen">
          <div className="kd-phone-cover" style={brand.cover ? { backgroundImage: `url(${brand.cover})` } : undefined}>
            <span className="kd-avatar kd-avatar--lg">
              {brand.logo ? <img src={brand.logo} alt="" /> : (restaurantName.trim()[0] || "K").toUpperCase()}
            </span>
          </div>
          <div className="kd-phone-body">
            <b>{restaurantName || "Seu estabelecimento"}</b>
            <small>Cardápio digital</small>
            <span className="kd-phone-line" />
            <span className="kd-phone-line kd-phone-line--short" />
          </div>
        </div>
        <figcaption>Prévia</figcaption>
      </figure>
    </div>
  );
}

/* ───────────────────────── Configurações ───────────────────────── */

function SettingsPage({ settings, setSettings, notify }: DashboardProps) {
  const options: { key: keyof RestaurantSettings; label: string; description: string }[] = [
    { key: "waiter", label: "Chamar garçom", description: "O cliente avisa a equipe pelo cardápio e o chamado chega com o nome da mesa." },
    { key: "bill", label: "Pedir a conta", description: "Mostra a opção de pedir a conta pelo cardápio." },
    { key: "google", label: "Avaliar no Google", description: "Mostra o botão de avaliação. Configure o link em Avaliações." },
    { key: "sound", label: "Som para novos chamados", description: "Toca um aviso curto neste navegador quando uma mesa chamar." },
  ];
  return (
    <div className="kd-stack kd-narrow">
      <PageIntro
        description="Escolha o que o cliente pode fazer pelo cardápio. Cada alteração é salva na hora."
      />
      <Card className="kd-flush">
        <ul className="kd-rows">
          {options.map((o, i) => (
            <li key={o.key} className="kd-pad-row kd-rise" style={rise(i)}>
              <Switch
                label={o.label}
                description={o.description}
                checked={Boolean(settings[o.key])}
                onChange={(checked) => {
                  setSettings((current) => ({ ...current, [o.key]: checked }));
                  if (o.key === "sound" && checked) playCallTone();
                  notify(`${o.label}: ${checked ? "ativado" : "desativado"}`);
                }}
              />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
