"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { signOut } from "firebase/auth";
import {
  AlertTriangle,
  Armchair,
  ArrowDown,
  ArrowUp,
  BarChart3,
  BookOpen,
  Check,
  ChevronRight,
  CloudOff,
  ConciergeBell,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  HandPlatter,
  ImageOff,
  ImagePlus,
  LayoutDashboard,
  Link2,
  LoaderCircle,
  LogOut,
  Menu,
  Palette,
  Pencil,
  Plus,
  Printer,
  QrCode,
  RotateCw,
  Search,
  Settings2,
  Star,
  Tags,
  Trash2,
  EyeOff,
  Heart,
  UtensilsCrossed,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  createRestaurantCategory,
  createRestaurantProduct,
  createRestaurantTable,
  deleteRestaurantCategory,
  deleteRestaurantProduct,
  deleteRestaurantTable,
  newProductId,
  publicMenuPath,
  renameRestaurantTable,
  updateRestaurantCategory,
  updateRestaurantProduct,
} from "@/lib/restaurant-db";
import { deleteManagedImages, imageMeta, scheduleImageCleanup, uploadImage, type UploadStage, type UploadedImage } from "@/lib/storage";
import { IMAGE_ACCEPT, IMAGE_HINT, ImageError, describeOptimization, optimizeImage, type OptimizedImage } from "@/lib/image-optimization";
import { VIDEO_ACCEPT, VIDEO_HINT, VideoFileError, discardProductVideo, startVideoUpload, validateVideoFile } from "@/lib/video-upload";
import { VideoJobChip, VideoJobInline, VideoUploadsTray, useVideoJobs, type JobView } from "./video-jobs";
import { getFirebaseAuth } from "@/lib/auth";
import { friendlyError, isQueued } from "@/lib/async";
import { brl, elapsed, greeting, initial, plural, productCents, stagger } from "@/lib/format";
import { useDialog, useNow, useRootPalette } from "@/lib/hooks";
import { isDefaultPalette, paletteVars, type PaletteColors } from "@/lib/palette";
import { PalettePicker } from "./palette-picker";
import { accountState, canAccessFeature, effectiveSubscription, planLabel, tableLimit, toDate, trialDaysLeft, type SubscriptionSummary } from "@/lib/cakto/access";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardHead,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Modal,
  PageHeader,
  Segmented,
  SelectField,
  Skeleton,
  Switch,
  TextArea,
  TextField,
  type BadgeTone,
} from "@/components/ui";
import { KardapLogo } from "@/components/brand/logo";
import { clearAccountStorage, endSsoSession } from "@/lib/sso/client";
import { MenuHero } from "@/components/menu/menu-hero";
import { DishRow } from "@/components/menu/dish-row";
import { SubscriptionPage } from "./subscription-page";
import type { AccountInfo, Brand, Call, CallStatus, DashboardProps, Notify, RestaurantSettings } from "./types";

export type { Brand, DashboardProps, DataLoaded, LoadErrors, Notify, RestaurantSettings } from "./types";

/* ───────────────────────── Utilidades ───────────────────────── */

const QUEUED_MESSAGE =
  "Sem resposta do servidor. A alteração ficou guardada neste aparelho (marcada como “Sincronizando”) e será enviada quando a conexão voltar.";

function reportError(error: unknown, notify: Notify, fallback: string) {
  notify(isQueued(error) ? QUEUED_MESSAGE : friendlyError(error, fallback), "error");
}

const menuUrl = () => `${typeof window === "undefined" ? "" : window.location.origin}${publicMenuPath()}`;

const tableLink = (table: string, tokens: Record<string, string>) =>
  `${menuUrl()}?mesa=${encodeURIComponent(tokens[table] || table)}`;

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
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(data);
  return true;
}

function playCallTone() {
  try {
    const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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

function SyncBadge() {
  return (
    <span className="kd-sync" title="Salvo neste aparelho, aguardando confirmação do servidor">
      <RotateCw size={12} aria-hidden className="kd-sync-icon" /> Sincronizando
    </span>
  );
}

/* ───────────────────────── Plano ───────────────────────── */

const SUPPORT_EMAIL = "suporte@kardap.com.br";

function usePlan(account: AccountInfo) {
  return useMemo(() => effectiveSubscription(account.subscription, account.createdAt), [account.subscription, account.createdAt]);
}

const shortDate = (value: unknown) => toDate(value)?.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) || "";

/** Resumo da situação do plano em linguagem do dono do restaurante. */
function planStatus(plan: SubscriptionSummary | null) {
  const state = accountState(plan);
  const days = trialDaysLeft(plan);
  switch (state) {
    case "trial":
      return { state, title: "Teste grátis do Pro", detail: days === 0 ? "Termina hoje" : `Faltam ${plural(days || 0, "dia", "dias")}`, urgent: (days ?? 99) <= 3 };
    case "trial_ended":
      return { state, title: "Teste encerrado", detail: "Escolha um plano para continuar com o Pro", urgent: true };
    case "active":
      return { state, title: `Plano ${planLabel(plan?.planId)}`, detail: "Assinatura ativa", urgent: false };
    case "late":
      return { state, title: "Pagamento pendente", detail: "Regularize para não perder recursos", urgent: true };
    case "canceled":
      return { state, title: "Assinatura cancelada", detail: plan?.currentPeriodEnd ? `Acesso até ${shortDate(plan.currentPeriodEnd)}` : "Escolha um plano", urgent: true };
    default:
      return { state, title: "Sem plano ativo", detail: "Escolha um plano", urgent: true };
  }
}

/** Explica por que o recurso está travado de acordo com a situação real da conta. */
function lockReason(plan: SubscriptionSummary | null) {
  switch (accountState(plan)) {
    case "active":
      return `Seu plano atual é o ${planLabel(plan?.planId)}. Mude para o Pro para liberar.`;
    case "late":
      return "O pagamento da assinatura está pendente. Regularize para voltar a usar.";
    case "canceled":
    case "expired":
      return "A assinatura foi encerrada. Assine o Pro para voltar a usar.";
    default:
      return "O teste grátis do Pro terminou. Assine o Pro para voltar a usar.";
  }
}

function ProLock({ feature, plan }: { feature: string; plan: SubscriptionSummary | null }) {
  return (
    <Callout
      tone="info"
      icon={<Star size={18} aria-hidden />}
      title={`${feature} faz parte do plano Pro`}
      action={
        <ButtonLink href="/dashboard/assinatura" size="sm" variant="secondary">
          Ver planos
        </ButtonLink>
      }
    >
      {lockReason(plan)}
    </Callout>
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

function ProductThumb({ product, size = 48 }: { product: any; size?: number }) {
  // Miniatura: versão pequena da foto; sem foto, a capa gerada na otimização do vídeo.
  const src = product.imageThumb || product.image || product.videoPoster;
  return src ? (
    <img className="kd-thumb" src={src} alt="" loading="lazy" decoding="async" width={size} height={size} />
  ) : (
    <span className="kd-thumb kd-thumb--empty" aria-hidden>
      {initial(String(product.name || "?"), "?")}
    </span>
  );
}

/** Nome atual da categoria (o texto salvo no produto pode estar desatualizado após renomear) e se ela está oculta. */
function useCategoryInfo(categories: any[]) {
  return useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    return (product: any) => {
      const category = byId.get(product.categoryId);
      return { name: category?.name || product.category || "Sem categoria", hidden: category ? category.active === false : false };
    };
  }, [categories]);
}

/* ───────────────────────── Navegação ───────────────────────── */

type NavItem = { label: string; href: string; icon: LucideIcon };

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Salão",
    items: [
      { label: "Visão geral", href: "/dashboard", icon: LayoutDashboard },
      { label: "Chamados", href: "/dashboard/chamados", icon: ConciergeBell },
      { label: "Mesas", href: "/dashboard/mesas", icon: Armchair },
      { label: "QR Codes", href: "/dashboard/qrcodes", icon: QrCode },
    ],
  },
  {
    group: "Cardápio",
    items: [
      { label: "Cardápio", href: "/dashboard/cardapio", icon: BookOpen },
      { label: "Categorias", href: "/dashboard/categorias", icon: Tags },
      { label: "Produtos", href: "/dashboard/produtos", icon: UtensilsCrossed },
    ],
  },
  {
    group: "Estabelecimento",
    items: [
      { label: "Avaliações", href: "/dashboard/avaliacoes", icon: Star },
      { label: "Relatórios", href: "/dashboard/relatorios", icon: BarChart3 },
      { label: "Personalização", href: "/dashboard/personalizacao", icon: Palette },
      { label: "Assinatura", href: "/dashboard/assinatura", icon: CreditCard },
      { label: "Configurações", href: "/dashboard/configuracoes", icon: Settings2 },
    ],
  },
];
const ALL_ITEMS = NAV.flatMap((group) => group.items);

/** Atalhos da barra inferior no celular: o que se usa durante o serviço. */
const TABS: NavItem[] = [
  { label: "Início", href: "/dashboard", icon: LayoutDashboard },
  { label: "Chamados", href: "/dashboard/chamados", icon: ConciergeBell },
  { label: "Produtos", href: "/dashboard/produtos", icon: UtensilsCrossed },
  { label: "Mesas", href: "/dashboard/mesas", icon: Armchair },
];

/* ───────────────────────── Estrutura ───────────────────────── */

export default function Dashboard(props: DashboardProps) {
  const { path, brand, restaurantName, notify, calls, settings, loaded, onRetry, account } = props;
  const plan = usePlan(account);
  const status = planStatus(plan);
  const [drawer, setDrawer] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const sideRef = useRef<HTMLElement>(null);
  const title = ALL_ITEMS.find((item) => item.href === path)?.label || "Painel";
  const waiting = calls.filter((c) => c.status === "ativo").length;

  useEffect(() => {
    document.title = `${waiting ? `(${waiting}) ` : ""}${title} · Kardap`;
  }, [title, waiting]);
  useEffect(() => setDrawer(false), [path]);
  useDialog(sideRef, () => setDrawer(false), drawer);
  useRootPalette(brand.palette, brand.palette?.panel === true);

  const allLoaded = loaded.products && loaded.categories && loaded.tables;
  const [slowData, setSlowData] = useState(false);
  useEffect(() => {
    if (allLoaded) {
      setSlowData(false);
      return;
    }
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

  const previousWaiting = useRef(waiting);
  useEffect(() => {
    if (settings.sound && waiting > previousWaiting.current) playCallTone();
    previousWaiting.current = waiting;
  }, [waiting, settings.sound]);

  const logout = async () => {
    setSigningOut(true);
    try {
      // Encerra antes a sessão compartilhada (PDV incluído); sem rede, o cookie ainda vence em até 5 dias.
      await endSsoSession();
      await signOut(getFirebaseAuth());
      clearAccountStorage();
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
      <aside
        ref={sideRef}
        id="kd-side"
        className={`kd-side ${drawer ? "is-open" : ""}`}
        aria-label="Navegação do painel"
        role={drawer ? "dialog" : undefined}
        aria-modal={drawer || undefined}
        tabIndex={-1}
      >
        <div className="kd-side-top">
          <Link href="/dashboard" className="kd-side-logo" aria-label="Kardap, visão geral">
            <KardapLogo width={128} alt="" />
          </Link>
          <IconButton label="Fechar menu" className="kd-side-close" onClick={() => setDrawer(false)}>
            <X size={18} />
          </IconButton>
        </div>
        <nav className="kd-nav" aria-label="Seções do painel">
          {NAV.map((group) => (
            <div key={group.group} className="kd-nav-group">
              <p className="kd-nav-label">{group.group}</p>
              <ul>
                {group.items.map(({ label, href, icon: Icon }) => {
                  const active = href === path;
                  return (
                    <li key={href}>
                      <Link href={href} className={`kd-nav-link ${active ? "is-active" : ""}`} aria-current={active ? "page" : undefined}>
                        <Icon size={18} strokeWidth={1.9} aria-hidden />
                        <span>{label}</span>
                        {href === "/dashboard/chamados" && waiting > 0 && (
                          <span className="kd-nav-count">
                            {waiting}
                            <span className="kd-sr"> {waiting === 1 ? "mesa aguardando" : "mesas aguardando"}</span>
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="kd-side-foot">
          <Link href="/dashboard/assinatura" className={`kd-side-plan ${status.urgent ? "is-urgent" : ""}`}>
            <b>{status.title}</b>
            <small>{status.detail}</small>
          </Link>
          <a className="kd-side-public" href={publicMenuPath()} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={16} aria-hidden />
            <span>Abrir cardápio público</span>
            <span className="kd-sr"> (abre em nova aba)</span>
          </a>
          <div className="kd-account">
            <span className="kd-avatar" aria-hidden>
              {brand.logo ? <img src={brand.logoSmall || brand.logo} alt="" /> : initial(restaurantName)}
            </span>
            <span className="kd-account-name">
              <b>{restaurantName || "Seu estabelecimento"}</b>
              <small>Conta do proprietário</small>
            </span>
            <IconButton label={signingOut ? "Saindo da conta" : "Sair da conta"} onClick={logout} disabled={signingOut}>
              {signingOut ? <LoaderCircle size={17} className="k-spin" /> : <LogOut size={17} />}
            </IconButton>
          </div>
        </div>
      </aside>
      <div className={`kd-scrim ${drawer ? "is-open" : ""}`} onClick={() => setDrawer(false)} aria-hidden />

      <div className="kd-main-wrap">
        <header className="kd-topbar">
          <Link href="/dashboard" className="kd-topbar-logo" aria-label="Kardap, visão geral">
            <KardapLogo width={104} alt="" />
          </Link>
          <div className="kd-topbar-actions">
            {waiting > 0 && path !== "/dashboard/chamados" && (
              <Link href="/dashboard/chamados" className="kd-call-pill">
                <ConciergeBell size={15} aria-hidden />
                {waiting === 1 ? "1 mesa chamando" : `${waiting} mesas chamando`}
              </Link>
            )}
            <ButtonLink href={publicMenuPath()} external size="sm" icon={<ExternalLink size={15} />}>
              Cardápio
            </ButtonLink>
          </div>
        </header>
        <main id="kd-main" className="kd-main" tabIndex={-1}>
          {account.suspended && (
            <div className="kd-banner">
              <Callout
                tone="danger"
                role="alert"
                icon={<AlertTriangle size={18} aria-hidden />}
                title="Seu cardápio público está suspenso"
                action={
                  <ButtonLink href={`mailto:${SUPPORT_EMAIL}`} size="sm" variant="secondary">
                    Falar com o suporte
                  </ButtonLink>
                }
              >
                {account.suspendedReason ? `Motivo informado: ${account.suspendedReason}. ` : ""}Os clientes veem uma mensagem de cardápio indisponível. O painel continua funcionando.
              </Callout>
            </div>
          )}
          {(offline || slowData) && (
            <div className="kd-banner">
              <Callout
                tone="warn"
                role="status"
                icon={offline ? <CloudOff size={18} aria-hidden /> : <AlertTriangle size={18} aria-hidden />}
                title={offline ? "Você está sem internet" : "A conexão está lenta"}
                action={
                  !offline && (
                    <Button size="sm" variant="secondary" icon={<RotateCw size={14} />} onClick={onRetry}>
                      Tentar novamente
                    </Button>
                  )
                }
              >
                {offline
                  ? "O que você alterar fica guardado neste aparelho e é enviado quando a conexão voltar."
                  : "Alguns dados ainda estão carregando."}
              </Callout>
            </div>
          )}
          <div key={path} className="kd-page">
            <DashboardRoutes {...props} />
          </div>
        </main>
      </div>

      <nav className="kd-tabbar" aria-label="Atalhos do painel">
        {TABS.map(({ label, href, icon: Icon }) => {
          const active = href === path;
          return (
            <Link key={href} href={href} className={`kd-tab ${active ? "is-active" : ""}`} aria-current={active ? "page" : undefined}>
              <span className="kd-tab-icon">
                <Icon size={20} strokeWidth={1.9} aria-hidden />
                {href === "/dashboard/chamados" && waiting > 0 && (
                  <span className="kd-tab-count">
                    {waiting}
                    <span className="kd-sr"> aguardando</span>
                  </span>
                )}
              </span>
              <span>{label}</span>
            </Link>
          );
        })}
        <button type="button" className="kd-tab" onClick={() => setDrawer(true)} aria-expanded={drawer} aria-controls="kd-side">
          <span className="kd-tab-icon">
            <Menu size={20} strokeWidth={1.9} aria-hidden />
          </span>
          <span>Mais</span>
        </button>
      </nav>
      <VideoUploadsTray products={props.foods} notify={notify} />
    </div>
  );
}

function DashboardRoutes(props: DashboardProps) {
  switch (props.path) {
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
      return <SubscriptionPage notify={props.notify} account={props.account} />;
    default:
      return (
        <EmptyState
          title="Página não encontrada"
          description="Este endereço não existe no painel. Use o menu para escolher uma seção."
          action={<ButtonLink href="/dashboard">Ir para a visão geral</ButtonLink>}
        />
      );
  }
}

/* ───────────────────────── Chamados (componentes) ───────────────────────── */

const CALL_STATUS: Record<CallStatus, { label: string; tone: BadgeTone; icon: LucideIcon }> = {
  ativo: { label: "Aguardando", tone: "signal", icon: ConciergeBell },
  andamento: { label: "Em atendimento", tone: "outline", icon: HandPlatter },
  concluido: { label: "Concluído", tone: "neutral", icon: Check },
};

const callTime = (call: Call) => (call.createdAt ? new Date(call.createdAt).getTime() : NaN);
/** Fila do salão: quem espera há mais tempo aparece primeiro. */
const oldestFirst = (a: Call, b: Call) => (callTime(a) || Infinity) - (callTime(b) || Infinity);
const newestFirst = (a: Call, b: Call) => (callTime(b) || -Infinity) - (callTime(a) || -Infinity);

function useAdvanceCall(advanceCall: DashboardProps["advanceCall"], notify: Notify) {
  return useCallback(
    (call: Call) => {
      const previous = call.status as CallStatus;
      const next: CallStatus = previous === "ativo" ? "andamento" : "concluido";
      advanceCall(call._key, next);
      notify(next === "andamento" ? `${call.table}: atendimento iniciado` : `${call.table}: chamado concluído`, "success", {
        label: "Desfazer",
        onAction: () => advanceCall(call._key, previous),
      });
    },
    [advanceCall, notify],
  );
}

function CallRow({ call, now, index, onAdvance }: { call: Call; now: number; index: number; onAdvance: (call: Call) => void }) {
  const status = CALL_STATUS[call.status as CallStatus] || CALL_STATUS.ativo;
  const Icon = status.icon;
  const since = call.createdAt ? elapsed(call.createdAt, now) : call.time === "agora" ? "agora" : call.time ? `há ${call.time}` : "";
  return (
    <li className={`kd-call is-${call.status}`} style={stagger(index)}>
      <span className="kd-call-icon" aria-hidden>
        <Icon size={18} strokeWidth={1.9} />
      </span>
      <div className="kd-call-main">
        <p className="kd-call-table">{call.table}</p>
        <p className="kd-call-reason">{call.type}</p>
        <p className="kd-call-when">
          {status.label}
          {since && (
            <>
              {" "}
              <time dateTime={call.createdAt || undefined}>{since}</time>
            </>
          )}
        </p>
      </div>
      {call.status !== "concluido" && (
        <Button
          size="sm"
          className="kd-call-action"
          variant={call.status === "ativo" ? "primary" : "secondary"}
          onClick={() => onAdvance(call)}
          aria-label={`${call.status === "ativo" ? "Atender" : "Concluir"} o chamado da ${call.table}`}
        >
          {call.status === "ativo" ? "Atender" : "Concluir"}
        </Button>
      )}
    </li>
  );
}

function CallList({ calls, onAdvance, label }: { calls: Call[]; onAdvance: (call: Call) => void; label: string }) {
  const now = useNow();
  return (
    <ul className="kd-call-list" aria-label={label}>
      {calls.map((call, i) => (
        <CallRow key={call._key} call={call} now={now} index={i} onAdvance={onAdvance} />
      ))}
    </ul>
  );
}

const NO_CALLS_HINT = "Quando um cliente tocar em Chamar garçom no cardápio, o chamado aparece aqui na hora, com o nome da mesa.";

/* ───────────────────────── Visão geral ───────────────────────── */

function Overview(props: DashboardProps) {
  const { calls, advanceCall, notify, restaurantName, foods, categories, tables, brand, loaded, loadErrors, onRetry, account } = props;
  const advance = useAdvanceCall(advanceCall, notify);
  const status = planStatus(usePlan(account));
  const ready = loaded.products && loaded.categories && loaded.tables;
  const steps = [
    { done: categories.length > 0, label: "Crie a primeira categoria", hint: "Entradas, pratos, bebidas…", href: "/dashboard/categorias" },
    { done: foods.length > 0, label: "Cadastre o primeiro produto", hint: "Com preço, foto e vídeo curto", href: "/dashboard/produtos" },
    { done: tables.length > 0, label: "Cadastre as mesas", hint: "Cada mesa ganha um QR Code", href: "/dashboard/mesas" },
    { done: Boolean(brand.logo || brand.cover), label: "Adicione logo ou capa", hint: "Aparecem no topo do cardápio", href: "/dashboard/personalizacao" },
  ];
  const done = steps.filter((s) => s.done).length;

  const waiting = calls.filter((c) => c.status === "ativo").sort(oldestFirst);
  const serving = calls.filter((c) => c.status === "andamento").sort(oldestFirst);
  const queue = [...waiting, ...serving].slice(0, 6);
  const hidden = foods.filter((f) => f.available === false).length;
  const noPhoto = foods.filter((f) => !f.image).length;
  const visibleCategories = categories.filter((c) => c.active).length;

  return (
    <div className="kd-stack">
      <PageHeader
        kicker={greeting()}
        title={restaurantName || "Seu estabelecimento"}
        display
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Copy size={15} />}
              aria-label="Copiar link do cardápio"
              onClick={() => copyText(menuUrl(), notify, "Link do cardápio copiado")}
            >
              Copiar link
            </Button>
            <ButtonLink href={publicMenuPath()} external variant="secondary" icon={<ExternalLink size={15} />}>
              Abrir cardápio
            </ButtonLink>
          </>
        }
      />

      {status.urgent && (
        <Callout
          tone={status.state === "late" ? "danger" : "warn"}
          icon={<CreditCard size={18} aria-hidden />}
          title={status.title}
          action={
            <ButtonLink href="/dashboard/assinatura" size="sm" variant="secondary">
              {status.state === "late" ? "Ver assinatura" : "Ver planos"}
            </ButtonLink>
          }
        >
          {status.detail}.
        </Callout>
      )}

      {ready && done < steps.length && (
        <Card className="kd-setup k-enter" aria-labelledby="kd-setup-title">
          <div className="kd-setup-head">
            <div>
              <p className="kd-overline">Primeiros passos</p>
              <h2 className="kd-h3" id="kd-setup-title">
                Falta pouco para receber clientes
              </h2>
            </div>
            <div className="kd-setup-progress">
              <span className="kd-num">
                {done} de {steps.length}
              </span>
              <span className="kd-meter" role="progressbar" aria-label="Etapas concluídas" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done}>
                <i style={{ width: `${(done / steps.length) * 100}%` }} />
              </span>
            </div>
          </div>
          <ol className="kd-setup-list">
            {steps.map((step, i) => (
              <li key={step.href}>
                <Link href={step.href} className={step.done ? "is-done" : ""}>
                  <span className="kd-step-mark" aria-hidden>
                    {step.done ? <Check size={14} strokeWidth={3} /> : i + 1}
                  </span>
                  <span className="kd-step-text">
                    <b>{step.label}</b>
                    <small>{step.done ? "Concluído" : step.hint}</small>
                  </span>
                  {!step.done && <ChevronRight size={16} aria-hidden />}
                  <span className="kd-sr">{step.done ? "(concluída)" : "(pendente)"}</span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <div className="kd-overview">
        <Card className="kd-service k-enter" style={stagger(1)} aria-labelledby="kd-service-title">
          <CardHead
            id="kd-service-title"
            kicker={
              <>
                <span className="kd-live" aria-hidden /> Ao vivo
              </>
            }
            title="Chamados das mesas"
            action={
              <ButtonLink href="/dashboard/chamados" variant="link" size="sm">
                Ver histórico
              </ButtonLink>
            }
          />
          <dl className="kd-service-stats">
            <div className={waiting.length ? "is-signal" : ""}>
              <dt>Aguardando</dt>
              <dd className="kd-num">{waiting.length}</dd>
            </div>
            <div>
              <dt>Em atendimento</dt>
              <dd className="kd-num">{serving.length}</dd>
            </div>
          </dl>
          {queue.length ? (
            <CallList calls={queue} onAdvance={advance} label="Chamados abertos" />
          ) : (
            <EmptyState compact icon={<ConciergeBell size={22} />} title="Nenhuma mesa chamando agora" description={NO_CALLS_HINT} />
          )}
        </Card>

        <Card className="kd-menu-card k-enter" style={stagger(2)} aria-labelledby="kd-menu-card-title">
          <CardHead
            id="kd-menu-card-title"
            kicker="Cardápio"
            title="O que o cliente vê"
            action={
              <ButtonLink href="/dashboard/cardapio" variant="link" size="sm">
                Detalhes
              </ButtonLink>
            }
          />
          {loadErrors.products ? (
            <LoadError message={loadErrors.products} onRetry={onRetry} />
          ) : !ready ? (
            <Skeleton rows={4} height={44} label="Carregando o cardápio" />
          ) : (
            <>
              <ul className="kd-facts">
                <li>
                  <Link href="/dashboard/produtos">
                    <span>Produtos no cardápio</span>
                    <b className="kd-num">{foods.length - hidden}</b>
                    <ChevronRight size={16} aria-hidden />
                  </Link>
                </li>
                <li>
                  <Link href="/dashboard/categorias">
                    <span>Categorias visíveis</span>
                    <b className="kd-num">{visibleCategories}</b>
                    <ChevronRight size={16} aria-hidden />
                  </Link>
                </li>
                <li>
                  <Link href="/dashboard/mesas">
                    <span>Mesas com QR Code</span>
                    <b className="kd-num">{tables.length}</b>
                    <ChevronRight size={16} aria-hidden />
                  </Link>
                </li>
              </ul>
              {(hidden > 0 || noPhoto > 0) && (
                <div className="kd-attention">
                  <p className="kd-overline">Pede atenção</p>
                  {noPhoto > 0 && (
                    <Link href="/dashboard/produtos?media=sem-foto" className="kd-attention-item">
                      <ImageOff size={16} aria-hidden />
                      <span>{plural(noPhoto, "produto sem foto", "produtos sem foto")}</span>
                      <ChevronRight size={16} aria-hidden />
                    </Link>
                  )}
                  {hidden > 0 && (
                    <Link href="/dashboard/produtos?media=ocultos" className="kd-attention-item">
                      <EyeOff size={16} aria-hidden />
                      <span>{plural(hidden, "produto oculto", "produtos ocultos")}</span>
                      <ChevronRight size={16} aria-hidden />
                    </Link>
                  )}
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ───────────────────────── Chamados ───────────────────────── */

function CallsPage({ calls, advanceCall, notify, chamadosHasMore, chamadosLoading, chamadosError, loadMoreChamados }: DashboardProps) {
  const [filter, setFilter] = useState<"abertos" | "concluidos" | "todos">("abertos");
  const advance = useAdvanceCall(advanceCall, notify);
  const waiting = calls.filter((c) => c.status === "ativo").sort(oldestFirst);
  const serving = calls.filter((c) => c.status === "andamento").sort(oldestFirst);
  const finished = calls.filter((c) => c.status === "concluido").sort(newestFirst);
  const all = [...calls].sort(newestFirst);

  return (
    <div className="kd-stack">
      <PageHeader
        title="Chamados"
        description="Pedidos de atendimento enviados pelas mesas. Toque em Atender quando alguém da equipe estiver indo até a mesa, e em Concluir quando terminar."
      />
      <div className="kd-group">
      <Segmented
        label="Filtrar chamados"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "abertos", label: "Abertos", count: waiting.length + serving.length },
          { value: "concluidos", label: "Concluídos", count: finished.length },
          { value: "todos", label: "Todos", count: calls.length },
        ]}
      />

      {filter === "abertos" ? (
        waiting.length + serving.length === 0 ? (
          <Card>
            <EmptyState icon={<ConciergeBell size={22} />} title="Nenhuma mesa chamando agora" description={NO_CALLS_HINT} />
          </Card>
        ) : (
          <div className="kd-call-groups">
            {waiting.length > 0 && (
              <Card className="kd-call-group is-waiting" aria-labelledby="kd-waiting-title">
                <h2 className="kd-overline kd-call-group-title" id="kd-waiting-title">
                  Aguardando · <span className="kd-num">{waiting.length}</span>
                </h2>
                <CallList calls={waiting} onAdvance={advance} label="Chamados aguardando atendimento" />
              </Card>
            )}
            {serving.length > 0 && (
              <Card className="kd-call-group" aria-labelledby="kd-serving-title">
                <h2 className="kd-overline kd-call-group-title" id="kd-serving-title">
                  Em atendimento · <span className="kd-num">{serving.length}</span>
                </h2>
                <CallList calls={serving} onAdvance={advance} label="Chamados em atendimento" />
              </Card>
            )}
          </div>
        )
      ) : (
        <Card>
          {(filter === "concluidos" ? finished : all).length ? (
            <CallList calls={filter === "concluidos" ? finished : all} onAdvance={advance} label={filter === "concluidos" ? "Chamados concluídos" : "Todos os chamados"} />
          ) : (
            <EmptyState
              icon={<Check size={22} />}
              title={filter === "concluidos" ? "Nenhum chamado concluído ainda" : "Nenhum chamado registrado"}
              description={filter === "concluidos" ? "Chamados finalizados ficam registrados aqui." : NO_CALLS_HINT}
            />
          )}
        </Card>
      )}

      </div>

      {chamadosError ? (
        <Card>
          <LoadError message={chamadosError} onRetry={loadMoreChamados} />
        </Card>
      ) : chamadosHasMore ? (
        <div className="kd-center-row">
          <Button variant="secondary" onClick={loadMoreChamados} loading={chamadosLoading}>
            {chamadosLoading ? "Carregando chamados…" : "Carregar chamados anteriores"}
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
      if (f.categoryId && f.available !== false) map[f.categoryId] = (map[f.categoryId] || 0) + 1;
    });
    return map;
  }, [foods]);

  return (
    <div className="kd-stack">
      <PageHeader title="Cardápio" description="O endereço público do seu cardápio e a ordem em que o cliente vê as seções." />
      <Card className="kd-share k-enter">
        <div className="kd-share-qr" aria-hidden>
          <QRCodeSVG value={url || "https://kardap.app"} size={132} level="M" bgColor="#ffffff" fgColor="#14201a" />
        </div>
        <div className="kd-share-body">
          <p className="kd-overline">
            <span className="kd-live" aria-hidden /> Publicado
          </p>
          <h2 className="kd-h2">Seu cardápio está no ar</h2>
          <div className="kd-copyfield">
            <Link2 size={16} aria-hidden />
            <input readOnly value={url} aria-label="Endereço do cardápio" onFocus={(e) => e.currentTarget.select()} />
            <Button size="sm" icon={<Copy size={14} />} onClick={() => copyText(url, notify, "Link do cardápio copiado")}>
              Copiar
            </Button>
          </div>
          <p className="kd-hint">
            Este link abre o cardápio sem mesa identificada. Para os chamados chegarem com o nome da mesa, use o QR Code de cada mesa.
          </p>
          <div className="kd-row">
            <ButtonLink href={publicMenuPath()} external variant="secondary" icon={<ExternalLink size={15} />}>
              Abrir cardápio
            </ButtonLink>
            <ButtonLink href="/dashboard/qrcodes" variant="ghost" icon={<QrCode size={15} />}>
              QR Codes das mesas
            </ButtonLink>
          </div>
        </div>
      </Card>

      <Card className="k-enter" style={stagger(1)} aria-labelledby="kd-structure-title">
        <CardHead
          id="kd-structure-title"
          kicker="Ordem das seções"
          title="Como o cliente navega"
          action={
            <ButtonLink href="/dashboard/categorias" variant="link" size="sm">
              Organizar categorias
            </ButtonLink>
          }
        />
        {loadErrors.categories ? (
          <LoadError message={loadErrors.categories} onRetry={onRetry} />
        ) : !loaded.categories ? (
          <Skeleton rows={3} height={48} />
        ) : categories.length ? (
          <ol className="kd-outline">
            {categories.map((c, i) => (
              <li key={c.id} className={c.active ? "" : "is-off"}>
                <span className="kd-outline-index kd-num" aria-hidden>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <b>{c.name}</b>
                <span className="kd-muted">
                  {c.active ? plural(countByCategory[c.id] || 0, "produto visível", "produtos visíveis") : "Não aparece no cardápio"}
                </span>
                {!c.active && <Badge tone="outline">Oculta</Badge>}
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState
            icon={<Tags size={22} />}
            title="O cardápio ainda está vazio"
            description="Comece criando categorias como Entradas, Pratos e Bebidas. Depois adicione os produtos em cada uma."
            action={
              <ButtonLink href="/dashboard/categorias" variant="primary" size="sm" icon={<Plus size={15} />}>
                Criar categoria
              </ButtonLink>
            }
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
  const [moving, setMoving] = useState<string | null>(null);
  const count = (id: string) => foods.filter((f) => f.categoryId === id).length;

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= categories.length || moving) return;
    const list = [...categories];
    [list[index], list[target]] = [list[target], list[index]];
    const changes = list.map((c, order) => ({ c, order })).filter(({ c, order }) => c.order !== order);
    setMoving(categories[index].id);
    try {
      await Promise.all(changes.map(({ c, order }) => updateRestaurantCategory(c.id, { order })));
    } catch (error) {
      reportError(error, notify, "Não foi possível mudar a ordem. Tente de novo.");
    } finally {
      setMoving(null);
    }
  };

  const hide = async (category: any) => {
    try {
      await updateRestaurantCategory(category.id, { active: false });
      notify(`“${category.name}” foi ocultada do cardápio`, "success", {
        label: "Desfazer",
        onAction: () => {
          updateRestaurantCategory(category.id, { active: true }).catch((error) => reportError(error, notify, "Não foi possível desfazer."));
        },
      });
      return true;
    } catch (error) {
      reportError(error, notify, "Não foi possível ocultar a categoria. Tente de novo.");
      return false;
    }
  };

  return (
    <div className="kd-stack">
      <PageHeader
        title="Categorias"
        description="As seções do seu cardápio, na ordem em que o cliente vê. Use as setas para reorganizar. Categorias ocultas não aparecem no link público."
        actions={
          <Button icon={<Plus size={16} />} onClick={() => setEditing("new")}>
            Nova categoria
          </Button>
        }
      />
      <Card flush>
        {loadErrors.categories ? (
          <LoadError message={loadErrors.categories} onRetry={onRetry} />
        ) : !loaded.categories ? (
          <div className="kd-pad">
            <Skeleton rows={4} />
          </div>
        ) : categories.length ? (
          <ol className="kd-rows" aria-label="Categorias na ordem do cardápio">
            {categories.map((c, i) => {
              const n = count(c.id);
              return (
                <li key={c.id} className={`kd-row-item k-enter ${c.active ? "" : "is-off"}`} style={stagger(i)}>
                  <span className="kd-order">
                    <IconButton label={`Mover ${c.name} para cima`} disabled={i === 0 || Boolean(moving)} onClick={() => move(i, -1)}>
                      <ArrowUp size={16} />
                    </IconButton>
                    <IconButton label={`Mover ${c.name} para baixo`} disabled={i === categories.length - 1 || Boolean(moving)} onClick={() => move(i, 1)}>
                      <ArrowDown size={16} />
                    </IconButton>
                  </span>
                  <span className="kd-row-main">
                    <b>{c.name}</b>
                    <small>{c.description || plural(n, "produto", "produtos")}</small>
                  </span>
                  {c.pending ? <SyncBadge /> : <Badge tone={c.active ? "success" : "outline"}>{c.active ? "Visível" : "Oculta"}</Badge>}
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
          </ol>
        ) : (
          <EmptyState
            icon={<Tags size={22} />}
            title="Nenhuma categoria criada"
            description="Categorias organizam o cardápio em seções. Exemplos: Entradas, Pizzas, Bebidas, Sobremesas."
            action={
              <Button size="sm" icon={<Plus size={15} />} onClick={() => setEditing("new")}>
                Criar primeira categoria
              </Button>
            }
          />
        )}
      </Card>

      {editing && (
        <CategoryForm category={editing === "new" ? null : editing} nextOrder={categories.length} notify={notify} onClose={() => setEditing(null)} />
      )}
      {removing &&
        (removing.count > 0 ? (
          <Modal
            title="Esta categoria ainda tem produtos"
            size="sm"
            onClose={() => setRemoving(null)}
            footer={
              <>
                <Button variant="ghost" onClick={() => setRemoving(null)}>
                  Voltar
                </Button>
                <ButtonLink href={`/dashboard/produtos?cat=${encodeURIComponent(removing.id)}`} variant="secondary" onClick={() => setRemoving(null)}>
                  Ver produtos
                </ButtonLink>
                {removing.active && (
                  <Button
                    onClick={async () => {
                      if (await hide(removing)) setRemoving(null);
                    }}
                  >
                    Ocultar categoria
                  </Button>
                )}
              </>
            }
          >
            <p className="kd-confirm-text">
              “{removing.name}” tem {plural(removing.count, "produto vinculado", "produtos vinculados")}. Para excluir, mova esses produtos para outra
              categoria ou exclua-os antes. {removing.active ? "Se quiser só tirar a seção do cardápio, oculte a categoria: os produtos continuam salvos." : ""}
            </p>
          </Modal>
        ) : (
          <ConfirmDialog
            title={`Excluir “${removing.name}”?`}
            description="A categoria sai do painel e do cardápio público. Essa ação não pode ser desfeita."
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
        ))}
    </div>
  );
}

function CategoryForm({ category, nextOrder, notify, onClose }: { category: any | null; nextOrder: number; notify: Notify; onClose: () => void }) {
  const initialValues = useRef({
    name: category?.name || "",
    description: category?.description || "",
    order: String(category?.order ?? nextOrder),
    active: category?.active ?? true,
  });
  const [name, setName] = useState(initialValues.current.name);
  const [description, setDescription] = useState(initialValues.current.description);
  const [order, setOrder] = useState(initialValues.current.order);
  const [active, setActive] = useState<boolean>(initialValues.current.active);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const start = initialValues.current;
  const dirty = name !== start.name || description !== start.description || order !== start.order || active !== start.active;

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!name.trim()) return setError("Dê um nome para a categoria. Exemplo: Pizzas.");
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
      onClose={onClose}
      dirty={dirty}
      busy={saving}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="kd-category-form" loading={saving}>
            {saving ? "Salvando…" : category ? "Salvar alterações" : "Criar categoria"}
          </Button>
        </>
      }
    >
      <form id="kd-category-form" className="kd-form" onSubmit={save} noValidate>
        <fieldset className="kd-fieldset" disabled={saving}>
          <TextField
            label="Nome"
            placeholder="Ex.: Pizzas"
            value={name}
            maxLength={60}
            error={error}
            autoComplete="off"
            data-autofocus
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
          />
          <TextField
            label="Descrição"
            optional
            hint="Aparece abaixo do nome da seção no cardápio."
            value={description}
            maxLength={140}
            onChange={(e) => setDescription(e.target.value)}
          />
          <TextField
            label="Posição no cardápio"
            hint="Números menores aparecem primeiro. Você também pode usar as setas na lista."
            type="number"
            inputMode="numeric"
            min={0}
            value={order}
            onChange={(e) => setOrder(e.target.value)}
          />
          <Switch label="Visível no cardápio" description="Desative para esconder a seção sem excluí-la." checked={active} onChange={setActive} />
        </fieldset>
      </form>
    </Modal>
  );
}

/* ───────────────────────── Produtos ───────────────────────── */

function MiniSwitch({ checked, label, onChange, busy }: { checked: boolean; label: string; onChange: () => void; busy?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="kd-mini-switch" onClick={onChange} disabled={busy} aria-busy={busy || undefined}>
      <span className="kd-mini-switch-track" aria-hidden>
        <span />
      </span>
      <span className="kd-mini-switch-text" aria-hidden>
        {checked ? "No cardápio" : "Oculto"}
      </span>
    </button>
  );
}

function ProductsPage({ notify, foods, categories, loaded, loadErrors, onRetry }: DashboardProps) {
  const videoJobs = useVideoJobs();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [categoryFilter, setCategoryFilter] = useState(() => searchParams.get("cat") ?? "");
  const [mediaFilter, setMediaFilter] = useState(() => searchParams.get("media") ?? "");
  const [toggling, setToggling] = useState<string | null>(null);
  const [editing, setEditing] = useState<any | "new" | null>(null);
  const [removing, setRemoving] = useState<any | null>(null);
  const activeCategories = categories.filter((c) => c.active);
  const categoryInfo = useCategoryInfo(categories);

  // Os filtros ficam na URL (dá para voltar e compartilhar), sem navegar a cada tecla.
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (categoryFilter) params.set("cat", categoryFilter);
      if (mediaFilter) params.set("media", mediaFilter);
      const base = window.location.pathname;
      const next = params.toString() ? `${base}?${params}` : base;
      if (next !== `${base}${window.location.search}`) router.replace(next, { scroll: false });
    }, 350);
    return () => clearTimeout(timer);
  }, [query, categoryFilter, mediaFilter, router]);

  const term = query.trim().toLowerCase();
  const filtered = foods.filter((f) => {
    if (term && !String(f.name).toLowerCase().includes(term) && !String(f.description || "").toLowerCase().includes(term)) return false;
    if (categoryFilter && f.categoryId !== categoryFilter) return false;
    if (mediaFilter === "video" && !f.videoUrl) return false;
    if (mediaFilter === "sem-foto" && f.image) return false;
    if (mediaFilter === "ocultos" && f.available !== false) return false;
    return true;
  });
  const hasFilters = Boolean(query || categoryFilter || mediaFilter);
  const clearFilters = () => {
    setQuery("");
    setCategoryFilter("");
    setMediaFilter("");
  };

  const toggleAvailable = async (f: any) => {
    const nextAvailable = f.available === false;
    setToggling(f.id);
    try {
      await updateRestaurantProduct(f.id, { available: nextAvailable });
      notify(nextAvailable ? `${f.name} voltou ao cardápio` : `${f.name} foi ocultado do cardápio`, "success", {
        label: "Desfazer",
        onAction: () => {
          updateRestaurantProduct(f.id, { available: !nextAvailable }).catch((error) => reportError(error, notify, "Não foi possível desfazer."));
        },
      });
    } catch (error) {
      reportError(error, notify, "Não foi possível alterar a disponibilidade. Tente de novo.");
    } finally {
      setToggling(null);
    }
  };

  return (
    <div className="kd-stack">
      <PageHeader
        title="Produtos"
        description="Tudo o que aparece no cardápio. Acabou um prato? Desligue “No cardápio”: ele some para o cliente e continua salvo aqui."
        actions={
          <Button
            icon={<Plus size={16} />}
            onClick={() => (activeCategories.length ? setEditing("new") : notify("Crie uma categoria visível antes de cadastrar produtos.", "error"))}
          >
            Novo produto
          </Button>
        }
      />

      {loaded.categories && !activeCategories.length && (
        <Callout
          tone="warn"
          icon={<Tags size={18} aria-hidden />}
          title="Primeiro, crie uma categoria"
          action={
            <ButtonLink href="/dashboard/categorias" size="sm" variant="secondary">
              Ir para categorias
            </ButtonLink>
          }
        >
          Todo produto pertence a uma seção visível do cardápio, como Pizzas ou Bebidas.
        </Callout>
      )}

      <div className="kd-group">
      <div className="kd-toolbar" role="search">
        <label className="kd-search">
          <Search size={17} aria-hidden />
          <span className="kd-sr">Buscar produto</span>
          <input type="search" placeholder="Buscar por nome ou descrição" value={query} onChange={(e) => setQuery(e.target.value)} />
          {query && (
            <IconButton label="Limpar busca" onClick={() => setQuery("")}>
              <X size={15} />
            </IconButton>
          )}
        </label>
        <select className="kd-input" aria-label="Filtrar por categoria" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">Categoria: todas</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className="kd-input" aria-label="Filtrar por situação" value={mediaFilter} onChange={(e) => setMediaFilter(e.target.value)}>
          <option value="">Situação: todas</option>
          <option value="video">Com vídeo</option>
          <option value="sem-foto">Sem foto</option>
          <option value="ocultos">Ocultos</option>
        </select>
      </div>

      {loaded.products && !loadErrors.products && (
        <div className="kd-results" aria-live="polite">
          <span>
            {hasFilters
              ? `${filtered.length} de ${plural(foods.length, "produto", "produtos")}`
              : plural(foods.length, "produto cadastrado", "produtos cadastrados")}
          </span>
          {hasFilters && (
            <Button variant="link" size="sm" onClick={clearFilters}>
              Limpar filtros
            </Button>
          )}
        </div>
      )}

      <Card flush>
        {loadErrors.products ? (
          <LoadError message={loadErrors.products} onRetry={onRetry} />
        ) : !loaded.products ? (
          <div className="kd-pad">
            <Skeleton rows={5} height={64} label="Carregando produtos" />
          </div>
        ) : filtered.length ? (
          <ul className="kd-rows" aria-label="Produtos">
            {filtered.map((f, i) => {
              const category = categoryInfo(f);
              return (
              <li key={f.id || f.name + i} className={`kd-product k-enter ${f.available === false ? "is-off" : ""}`} style={stagger(i)}>
                <ProductThumb product={f} />
                <span className="kd-product-main">
                  <b>{f.name}</b>
                  <small>
                    {category.name}
                    {category.hidden && (
                      <span className="kd-product-hidden-cat">
                        <EyeOff size={12} aria-hidden /> categoria oculta
                      </span>
                    )}
                    {f.videoUrl && !videoJobs.byProduct.get(f.id) && (
                      <span className="kd-product-video">
                        <Video size={12} aria-hidden /> vídeo
                      </span>
                    )}
                    <VideoJobChip job={videoJobs.byProduct.get(f.id)} />
                    {Number(f.likes) > 0 && (
                      <span className="kd-product-likes" title="Curtidas dos clientes nos Reels do cardápio">
                        <Heart size={12} aria-hidden /> {plural(Number(f.likes), "curtida", "curtidas")}
                      </span>
                    )}
                    {f.pending && <SyncBadge />}
                  </small>
                </span>
                <span className="kd-product-price kd-num">{brl(productCents(f))}</span>
                <MiniSwitch
                  checked={f.available !== false}
                  label={`${f.name} no cardápio`}
                  busy={toggling === f.id}
                  onChange={() => toggleAvailable(f)}
                />
                <span className="kd-row-actions">
                  <IconButton label={`Editar ${f.name}`} onClick={() => setEditing(f)}>
                    <Pencil size={16} />
                  </IconButton>
                  <IconButton label={`Excluir ${f.name}`} tone="danger" onClick={() => setRemoving(f)}>
                    <Trash2 size={16} />
                  </IconButton>
                </span>
              </li>
              );
            })}
          </ul>
        ) : hasFilters ? (
          <EmptyState
            icon={<Search size={22} />}
            title="Nenhum produto encontrado"
            description="Ajuste a busca ou limpe os filtros para ver todos os produtos."
            action={
              <Button variant="secondary" size="sm" onClick={clearFilters}>
                Limpar filtros
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<UtensilsCrossed size={22} />}
            title="Nenhum produto cadastrado"
            description="Cadastre pratos e bebidas com preço, descrição, foto e um vídeo curto do preparo."
            action={
              activeCategories.length > 0 && (
                <Button size="sm" icon={<Plus size={15} />} onClick={() => setEditing("new")}>
                  Cadastrar primeiro produto
                </Button>
              )
            }
          />
        )}
      </Card>

      </div>

      {editing && (
        <ProductForm
          product={editing === "new" ? null : editing}
          categories={categories}
          notify={notify}
          videoJob={editing === "new" ? undefined : videoJobs.byProduct.get(editing.id)}
          onClose={() => setEditing(null)}
        />
      )}
      {removing && (
        <ConfirmDialog
          title={`Excluir “${removing.name}”?`}
          description="O produto sai do cardápio e do painel, e não dá para desfazer. Se ele só acabou por hoje, desligue “No cardápio” em vez de excluir."
          confirmLabel="Excluir produto"
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            try {
              await deleteRestaurantProduct(removing.id);
              notify("Produto excluído");
              // Arquivos do vídeo otimizado saem junto; o que sobrar a limpeza diária do worker remove.
              discardProductVideo(removing.id, removing.video).catch(() => undefined);
              // Fotos geradas pelo sistema também saem (fotos antigas, de antes da otimização, ficam no Storage).
              deleteManagedImages([removing.image, removing.imageThumb]).catch(() => undefined);
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

function UploadBar({ value }: { value: number }) {
  return (
    <span className="kd-upload-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-label="Progresso do envio">
      <i style={{ width: `${value}%` }} />
    </span>
  );
}


/** Área de arquivo que aceita clique ou arrastar e soltar. */
function DropZone({
  kind,
  accept,
  file,
  existing,
  removed,
  error,
  progress,
  preview,
  note,
  onFile,
  onRemove,
  onUndoRemove,
}: {
  kind: "image" | "video";
  accept: string;
  file: File | null;
  existing?: string;
  removed: boolean;
  error?: string;
  progress?: number;
  preview?: string;
  /** Texto no lugar do nome do arquivo (ex.: resultado da otimização). */
  note?: string;
  onFile: (file: File | null) => void;
  onRemove: () => void;
  onUndoRemove: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const hasMedia = Boolean(file || (existing && !removed));
  const noun = kind === "image" ? "foto" : "vídeo";
  return (
    <div className="kd-drop-wrap">
      <label
        className={`kd-drop ${dragging ? "is-dragging" : ""} ${error ? "is-invalid" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onFile(e.dataTransfer.files?.[0] || null);
        }}
      >
        <input type="file" accept={accept} className="kd-sr" onChange={(e) => onFile(e.target.files?.[0] || null)} />
        {preview && !removed && (kind === "image" || !file) ? (
          <img src={preview} alt={kind === "image" ? "Prévia da foto do produto" : "Capa do vídeo atual"} />
        ) : kind === "image" ? (
          <ImagePlus size={22} aria-hidden />
        ) : (
          <Video size={22} aria-hidden />
        )}
        <b>{hasMedia ? `Trocar ${noun}` : `Adicionar ${noun}`}</b>
        <small>
          {error ||
            note ||
            file?.name ||
            (existing && !removed ? `${kind === "image" ? "Foto" : "Vídeo"} atual mantido${kind === "image" ? "a" : ""}` : kind === "image" ? IMAGE_HINT : VIDEO_HINT)}
        </small>
        <small className="kd-drop-hint">Clique ou arraste o arquivo para cá</small>
        {file && progress !== undefined && <UploadBar value={progress} />}
      </label>
      {existing && !file && (
        <Button size="sm" variant="link" onClick={removed ? onUndoRemove : onRemove}>
          {removed ? `Manter ${noun} atual` : `Remover ${noun}`}
        </Button>
      )}
    </div>
  );
}

function ProductForm({
  product,
  categories,
  notify,
  onClose,
  videoJob,
}: {
  product: any | null;
  categories: any[];
  notify: Notify;
  onClose: () => void;
  /** Envio ou otimização em andamento para este produto. */
  videoJob?: JobView;
}) {
  const start = useRef({
    name: product?.name || "",
    cents: product ? productCents(product) : 0,
    categoryId: product?.categoryId || "",
    description: product?.description || "",
  });
  const [name, setName] = useState(start.current.name);
  const [cents, setCents] = useState<number>(start.current.cents);
  const [categoryId, setCategoryId] = useState(start.current.categoryId);
  const [description, setDescription] = useState(start.current.description);
  const [image, setImage] = useState<File | null>(null);
  const [video, setVideo] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [removeVideo, setRemoveVideo] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"" | "uploading" | "saving">("");
  const [progress, setProgress] = useState<{ image?: number }>({});
  const [videoChecking, setVideoChecking] = useState(false);
  const pickedVideo = useRef<File | null>(null);
  // Id definido antes de gravar: a foto sobe com o id do produto no nome do arquivo.
  const [productId] = useState<string>(() => product?.id ?? newProductId());
  // Otimização começa quando a foto é escolhida; ao salvar, só falta enviar.
  const optimizeJob = useRef<{ file: File; promise: Promise<OptimizedImage>; abort: AbortController } | null>(null);
  const [optimized, setOptimized] = useState<OptimizedImage | null>(null);
  const [imageStage, setImageStage] = useState<"" | "processing" | "uploading">("");
  const uploadAbort = useRef<AbortController | null>(null);
  // Prévia: o arquivo escolhido na hora e, quando pronta, a própria versão que será publicada.
  const imagePreview = useMemo(
    () => (optimized ? URL.createObjectURL(optimized.main.blob) : image ? URL.createObjectURL(image) : product?.imageThumb || product?.image || ""),
    [optimized, image, product],
  );
  useEffect(
    () => () => {
      if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    },
    [imagePreview],
  );
  useEffect(
    () => () => {
      optimizeJob.current?.abort.abort();
      uploadAbort.current?.abort();
    },
    [],
  );
  const s = start.current;
  const dirty =
    name !== s.name || cents !== s.cents || categoryId !== s.categoryId || description !== s.description || Boolean(image || video) || removeImage || removeVideo;

  const pickImage = (file: File | null) => {
    optimizeJob.current?.abort.abort();
    optimizeJob.current = null;
    setOptimized(null);
    setImage(file);
    setRemoveImage(false);
    setErrors((current) => ({ ...current, image: "" }));
    if (!file) return;
    const abort = new AbortController();
    const promise = optimizeImage(file, "product", { signal: abort.signal });
    optimizeJob.current = { file, promise, abort };
    setImageStage("processing");
    promise.then(
      (result) => {
        if (optimizeJob.current?.file !== file) return;
        setOptimized(result);
        setImageStage("");
      },
      (error) => {
        if (optimizeJob.current?.file !== file || (error instanceof ImageError && error.code === "canceled")) return;
        setImageStage("");
        setErrors((current) => ({ ...current, image: error instanceof Error ? error.message : "Não foi possível usar essa imagem." }));
      },
    );
  };
  // O formato é conferido pelo conteúdo do arquivo (não pela extensão), além de tamanho e duração.
  const pickVideo = (file: File | null) => {
    pickedVideo.current = file;
    setVideo(file);
    setRemoveVideo(false);
    setErrors((current) => ({ ...current, video: "" }));
    if (!file) return;
    setVideoChecking(true);
    validateVideoFile(file)
      .then(
        () => undefined,
        (error) => {
          if (pickedVideo.current === file) setErrors((current) => ({ ...current, video: error instanceof VideoFileError ? error.message : "Não foi possível ler esse vídeo." }));
        },
      )
      .finally(() => {
        if (pickedVideo.current === file) setVideoChecking(false);
      });
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Informe o nome do produto.";
    if (!categoryId) next.category = "Escolha em qual seção do cardápio ele aparece.";
    if (cents <= 0) next.price = "Informe um preço maior que zero.";
    if (image && errors.image) next.image = errors.image;
    if (video && errors.video) next.video = errors.video;
    if (video && videoChecking) next.video = "Aguarde: o vídeo ainda está sendo verificado.";
    setErrors(next);
    return !Object.keys(next).length;
  };

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!validate()) return;
    const category = categories.find((c) => c.id === categoryId);
    let uploadedImage: UploadedImage | undefined;
    try {
      setStatus(image ? "uploading" : "saving");
      if (image) {
        const abort = new AbortController();
        uploadAbort.current = abort;
        const ready = optimizeJob.current?.file === image ? await optimizeJob.current.promise : undefined;
        uploadedImage = await uploadImage({
          file: image,
          kind: "product",
          productId,
          optimized: ready,
          signal: abort.signal,
          onStage: setImageStage,
          onProgress: (pct) => setProgress({ image: pct }),
        });
      }
      setStatus("saving");
      const data = {
        name,
        categoryId,
        category: category?.name || "",
        description,
        price: (cents / 100).toFixed(2).replace(".", ","),
        priceCents: cents,
        ...(uploadedImage
          ? { image: uploadedImage.url, imageThumb: uploadedImage.smallUrl, imageMeta: imageMeta(uploadedImage) }
          : removeImage
            ? { image: "", imageThumb: "", imageMeta: null }
            : {}),
        ...(removeVideo ? { videoUrl: "", videoPoster: "", video: null } : {}),
      };
      if (product) await updateRestaurantProduct(product.id, data);
      else await createRestaurantProduct({ ...data, available: true }, productId);
      const savedId = productId;
      // Produto gravado com a foto nova: a anterior (se gerada por este sistema) pode sair do Storage.
      if (product && (uploadedImage || removeImage)) deleteManagedImages([product.image, product.imageThumb]).catch(() => undefined);
      const saved = product ? "Produto atualizado" : "Produto adicionado ao cardápio";
      if (!video) notify(saved);
      onClose();
      if (removeVideo && product) discardProductVideo(product.id, product.video).catch(() => undefined);

      // O envio segue em segundo plano (bandeja no canto da tela); a otimização roda no servidor.
      if (video && savedId) {
        try {
          await startVideoUpload({ productId: savedId, productName: name.trim(), file: video });
          notify(`${saved}. O vídeo está sendo enviado; acompanhe no canto da tela.`);
        } catch (err) {
          reportError(err, notify, "O produto foi salvo, mas o vídeo não começou a ser enviado. Edite o produto para tentar de novo.");
        }
      }
    } catch (err) {
      if (err instanceof ImageError && err.code === "canceled") {
        notify("Envio da foto cancelado. Os dados continuam no formulário.");
      } else {
        reportError(err, notify, "Não foi possível salvar o produto. Seus dados continuam no formulário; tente de novo.");
      }
      if (isQueued(err)) return onClose();
      // A foto subiu mas o produto não foi gravado: remove os arquivos para não ficarem órfãos.
      if (uploadedImage) deleteManagedImages([uploadedImage.url, uploadedImage.smallUrl]).catch(() => undefined);
      setStatus("");
      setImageStage("");
      setProgress({});
    } finally {
      uploadAbort.current = null;
    }
  };

  const busy = Boolean(status);
  return (
    <Modal
      title={product ? "Editar produto" : "Novo produto"}
      description={product ? undefined : "Nome, preço e categoria são obrigatórios. Foto e vídeo podem ficar para depois."}
      onClose={onClose}
      dirty={dirty}
      busy={busy}
      footer={
        <>
          {status === "uploading" ? (
            <Button variant="ghost" onClick={() => uploadAbort.current?.abort()}>
              Cancelar envio
            </Button>
          ) : (
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
          )}
          <Button type="submit" form="kd-product-form" loading={busy}>
            {status === "uploading"
              ? imageStage === "processing"
                ? "Otimizando foto…"
                : `Enviando foto… ${progress.image ?? 0}%`
              : status === "saving"
                ? "Salvando…"
                : product
                  ? "Salvar alterações"
                  : "Adicionar ao cardápio"}
          </Button>
        </>
      }
    >
      <form id="kd-product-form" className="kd-form" onSubmit={save} noValidate>
        <fieldset className="kd-fieldset" disabled={busy}>
          <TextField
            label="Nome"
            placeholder="Ex.: Pizza Margherita"
            value={name}
            maxLength={80}
            error={errors.name}
            autoComplete="off"
            data-autofocus
            onChange={(e) => setName(e.target.value)}
          />
          <div className="kd-form-grid">
            <TextField
              label="Preço"
              inputMode="numeric"
              value={brl(cents)}
              error={errors.price}
              hint="Digite só os números: 4990 vira R$ 49,90."
              onChange={(e) => setCents(Math.min(Number(e.target.value.replace(/\D/g, "")) || 0, 99999999))}
            />
            <SelectField label="Categoria" value={categoryId} error={errors.category} onChange={(e) => setCategoryId(e.target.value)}>
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
            optional
            hint="Ingredientes, tamanho, acompanhamentos. Aparece abaixo do nome."
            rows={3}
            maxLength={400}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="kd-form-grid">
            <DropZone
              kind="image"
              accept={IMAGE_ACCEPT}
              file={image}
              existing={product?.image}
              removed={removeImage}
              error={errors.image}
              note={image ? (imageStage === "processing" && !optimized ? "Otimizando a foto…" : optimized ? `Otimizada: ${describeOptimization(optimized)}` : undefined) : undefined}
              progress={status === "uploading" && imageStage === "uploading" ? progress.image : undefined}
              preview={imagePreview}
              onFile={pickImage}
              onRemove={() => setRemoveImage(true)}
              onUndoRemove={() => setRemoveImage(false)}
            />
            <DropZone
              kind="video"
              accept={VIDEO_ACCEPT}
              file={video}
              existing={product?.videoUrl}
              preview={product?.videoPoster}
              removed={removeVideo}
              error={errors.video}
              onFile={pickVideo}
              onRemove={() => setRemoveVideo(true)}
              onUndoRemove={() => setRemoveVideo(false)}
            />
          </div>
          {video && videoJob && !["ready", "failed", "interrupted"].includes(videoJob.phase) ? (
            <p className="kd-vinline is-wait" role="status">
              Ao salvar, este vídeo substitui o que está em envio ou otimização.
            </p>
          ) : (
            <VideoJobInline job={videoJob} />
          )}
        </fieldset>
      </form>
    </Modal>
  );
}

/* ───────────────────────── Mesas ───────────────────────── */

function TablesPage({ notify, tables, tableTokens, loaded, loadErrors, onRetry, pendingTables, restaurantName, account }: DashboardProps) {
  const [creating, setCreating] = useState(false);
  const limit = tableLimit(usePlan(account));
  const atLimit = limit !== null && tables.length >= limit;
  const [renaming, setRenaming] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  const create = async () => {
    if (atLimit) {
      notify(`Seu plano permite até ${limit} mesas. No Pro, as mesas são ilimitadas.`, "error", {
        label: "Ver planos",
        onAction: () => (window.location.href = "/dashboard/assinatura"),
      });
      return;
    }
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
      <PageHeader
        kicker={loaded.tables ? (limit === null ? plural(tables.length, "mesa cadastrada", "mesas cadastradas") : `${tables.length} de ${limit} mesas do plano`) : undefined}
        title="Mesas"
        description="Cada mesa tem um QR Code único: os chamados chegam com o nome da mesa."
        actions={
          <>
            {tables.length > 0 && (
              <ButtonLink href="/dashboard/qrcodes" variant="secondary" icon={<Printer size={16} />}>
                Imprimir QR Codes
              </ButtonLink>
            )}
            <Button variant={atLimit ? "secondary" : "primary"} icon={<Plus size={16} />} loading={creating} onClick={create}>
              {creating ? "Criando mesa…" : "Nova mesa"}
            </Button>
          </>
        }
      />
      {loaded.tables && atLimit && (
        <Callout
          tone="info"
          title={`Você chegou ao limite de ${limit} mesas do seu plano`}
          action={
            <ButtonLink href="/dashboard/assinatura" size="sm" variant="secondary">
              Ver planos
            </ButtonLink>
          }
        >
          No Pro, as mesas são ilimitadas. Você ainda pode renomear ou excluir as mesas atuais.
        </Callout>
      )}
      {loadErrors.tables ? (
        <Card>
          <LoadError message={loadErrors.tables} onRetry={onRetry} />
        </Card>
      ) : !loaded.tables ? (
        <div className="kd-tables" role="status" aria-label="Carregando mesas">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className="kd-skel" style={{ height: 196 }} />
          ))}
        </div>
      ) : tables.length ? (
        <ul className="kd-tables" aria-label="Mesas cadastradas">
          {tables.map((t, i) => {
            const pending = pendingTables.includes(t);
            return (
              <li key={t} className="kd-table k-enter" style={stagger(i)}>
                <div className="kd-table-band">
                  <span className="kd-table-place">{restaurantName || "Seu restaurante"}</span>
                  <b className="kd-table-name">{t}</b>
                </div>
                <button type="button" className="kd-table-qr" onClick={() => setViewing(t)} aria-label={`Ampliar o QR Code da ${t}`}>
                  <QRCodeSVG value={tableLink(t, tableTokens)} size={96} level="M" bgColor="#ffffff" fgColor="#14201a" />
                </button>
                <div className="kd-table-foot">
                  {pending ? <SyncBadge /> : <span className="kd-table-status">QR Code ativo</span>}
                  <span className="kd-row-actions">
                    <IconButton label={`Renomear ${t}`} onClick={() => setRenaming(t)}>
                      <Pencil size={16} />
                    </IconButton>
                    <IconButton label={`Excluir ${t}`} tone="danger" onClick={() => setRemoving(t)}>
                      <Trash2 size={16} />
                    </IconButton>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <Card>
          <EmptyState
            icon={<Armchair size={22} />}
            title="Nenhuma mesa cadastrada"
            description="Crie as mesas do salão para gerar um QR Code por mesa. Assim você sabe exatamente de onde vem cada chamado."
            action={
              <Button size="sm" icon={<Plus size={15} />} loading={creating} onClick={create}>
                Criar primeira mesa
              </Button>
            }
          />
        </Card>
      )}

      {renaming && <RenameTable current={renaming} notify={notify} onClose={() => setRenaming(null)} />}
      {removing && (
        <ConfirmDialog
          title={`Excluir a ${removing}?`}
          description="O QR Code impresso desta mesa deixa de funcionar. Se for reutilizar a mesa com outro nome, prefira renomear."
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
          description="Aponte a câmera do celular para testar o QR Code desta mesa."
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
            <QRCodeSVG id="kd-qr-modal" value={tableLink(viewing, tableTokens)} size={232} level="M" bgColor="#ffffff" fgColor="#000000" marginSize={4} />
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
      notify("Mesa renomeada. O QR Code impresso continua valendo.");
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
      onClose={onClose}
      dirty={name !== current}
      busy={saving}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="kd-rename-form" loading={saving}>
            {saving ? "Salvando…" : "Salvar nome"}
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
          data-autofocus
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
      <PageHeader
        title="QR Codes"
        description="Imprima e cole um código em cada mesa. A impressão sai em folha A4, três por linha, com o nome da mesa abaixo de cada código."
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
        <div className="kd-qr-grid" role="status" aria-label="Carregando QR Codes">
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i} className="kd-skel" style={{ height: 300 }} />
          ))}
        </div>
      ) : tables.length ? (
        <ul className="kd-qr-grid kd-print-area" aria-label="QR Codes das mesas">
          {tables.map((t, i) => {
            const id = `kd-qr-${i}`;
            return (
              <li key={t} className="kd-qr-card k-enter" style={stagger(i)}>
                <span className="kd-qr-brand">{restaurantName || "Cardápio digital"}</span>
                <QRCodeSVG id={id} value={tableLink(t, tableTokens)} size={152} level="M" bgColor="#ffffff" fgColor="#000000" marginSize={4} />
                <b className="kd-qr-table">{t}</b>
                <span className="kd-qr-hint">Aponte a câmera do celular para ver o cardápio e chamar a equipe</span>
                <div className="kd-qr-actions kd-no-print">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Download size={14} />}
                    onClick={() => {
                      if (downloadQr(id, `QR-${t.replace(/\s+/g, "-")}.png`)) notify(`Download do QR Code da ${t} iniciado`);
                    }}
                  >
                    Baixar PNG
                  </Button>
                  <ButtonLink href={tableLink(t, tableTokens)} external size="sm" variant="ghost" icon={<ExternalLink size={14} />}>
                    Testar
                  </ButtonLink>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <Card>
          <EmptyState
            icon={<QrCode size={22} />}
            title="Nenhum QR Code para imprimir"
            description="Os QR Codes são gerados automaticamente quando você cadastra as mesas."
            action={
              <ButtonLink href="/dashboard/mesas" variant="primary" size="sm">
                Cadastrar mesas
              </ButtonLink>
            }
          />
        </Card>
      )}
    </div>
  );
}

/* ───────────────────────── Avaliações ───────────────────────── */

function ReviewsPage({ settings, setSettings, notify, onSaved }: DashboardProps) {
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
        return setError("Cole o link completo, começando com https://");
      }
    }
    setError("");
    if (value === (settings.googleReviewUrl || "")) return;
    setSettings((current) => ({ ...current, googleReviewUrl: value }));
    onSaved("settings", () => notify(value ? "Link de avaliação salvo" : "Link de avaliação removido"));
  };

  return (
    <div className="kd-stack kd-narrow">
      <PageHeader
        title="Avaliações"
        description="Depois de atendido, o cliente pode abrir sua página de avaliação do Google direto pelo cardápio. Mais avaliações ajudam o restaurante a aparecer nas buscas da região."
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
                No Perfil da Empresa no Google, toque em <b>Pedir avaliações</b> e copie o link que aparece.
              </>
            }
            onChange={(e) => {
              setUrl(e.target.value);
              setError("");
            }}
          />
          <div className="kd-row">
            <Button type="submit" disabled={saved} icon={saved && url ? <Check size={15} /> : undefined}>
              {saved && url ? "Link salvo" : "Salvar link"}
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
          label="Mostrar “Avaliar no Google” no cardápio"
          description={
            settings.googleReviewUrl ? "O botão aparece no topo do cardápio, ao lado do nome do restaurante." : "Salve o link acima para o botão aparecer no cardápio."
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

function ReportsPage({ calls, foods, categories, tables, chamadosHasMore, account }: DashboardProps) {
  const plan = usePlan(account);
  const allowed = canAccessFeature(plan, "advanced_reports");
  const byType = useMemo(() => {
    const map = new Map<string, number>();
    calls.forEach((c) => map.set(c.type, (map.get(c.type) || 0) + 1));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [calls]);
  const byTable = useMemo(() => {
    const map = new Map<string, number>();
    calls.forEach((c) => map.set(c.table, (map.get(c.table) || 0) + 1));
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [calls]);
  const done = calls.filter((c) => c.status === "concluido").length;
  const hidden = foods.filter((f) => f.available === false).length;
  const noPhoto = foods.filter((f) => !f.image).length;

  const stats: [number, string][] = [
    [calls.length, "Chamados analisados"],
    [done, "Concluídos"],
    [foods.length - hidden, "Produtos no cardápio"],
    [noPhoto, "Produtos sem foto"],
  ];

  if (!allowed)
    return (
      <div className="kd-stack kd-narrow">
        <PageHeader title="Relatórios" description="Motivos mais comuns dos chamados e as mesas que mais chamam a equipe." />
        <ProLock feature="Relatórios" plan={plan} />
      </div>
    );

  return (
    <div className="kd-stack">
      <PageHeader
        title="Relatórios"
        description={
          chamadosHasMore
            ? `Calculado com os ${calls.length} chamados mais recentes. Para incluir chamados anteriores, carregue mais na página Chamados.`
            : "Calculado com todos os chamados registrados e com o cardápio atual."
        }
      />
      <div className="kd-stats">
        {stats.map(([value, label], i) => (
          <div key={label} className="kd-stat k-enter" style={stagger(i)}>
            <span className="kd-stat-value kd-num">{value}</span>
            <span className="kd-stat-label">{label}</span>
          </div>
        ))}
      </div>
      <div className="kd-split">
        <Card className="k-enter" style={stagger(2)} aria-labelledby="kd-rep-types">
          <CardHead id="kd-rep-types" title="Motivos dos chamados" />
          {byType.length ? (
            <BarList rows={byType} />
          ) : (
            <EmptyState compact title="Sem chamados ainda" description="Quando as mesas começarem a chamar, os motivos mais comuns aparecem aqui." />
          )}
        </Card>
        <Card className="k-enter" style={stagger(3)} aria-labelledby="kd-rep-tables">
          <CardHead id="kd-rep-tables" title="Mesas que mais chamaram" />
          {byTable.length ? (
            <BarList rows={byTable} />
          ) : (
            <EmptyState
              compact
              title="Sem dados por mesa"
              description={tables.length ? "Os chamados aparecem aqui por mesa assim que forem feitos." : "Cadastre mesas para acompanhar os chamados por mesa."}
            />
          )}
        </Card>
      </div>
      {categories.length > 0 && noPhoto > 0 && (
        <Callout
          icon={<ImageOff size={18} aria-hidden />}
          title={`${plural(noPhoto, "produto está", "produtos estão")} sem foto`}
          action={
            <ButtonLink href="/dashboard/produtos?media=sem-foto" size="sm" variant="secondary">
              Ver quais são
            </ButtonLink>
          }
        >
          Pratos com foto ajudam o cliente a decidir sem precisar chamar a equipe para perguntar.
        </Callout>
      )}
    </div>
  );
}

function BarList({ rows }: { rows: [string, number][] }) {
  const max = Math.max(1, ...rows.map(([, n]) => n));
  return (
    <ul className="kd-bars">
      {rows.map(([label, n], i) => (
        <li key={label}>
          <span className="kd-bars-label">{label}</span>
          <span className="kd-bars-track" aria-hidden>
            <i style={{ width: `${(n / max) * 100}%`, ...stagger(i) }} />
          </span>
          <b className="kd-num">{n}</b>
        </li>
      ))}
    </ul>
  );
}

/* ───────────────────────── Personalização ───────────────────────── */

const brandImages = (b: Brand) => [b.logo, b.logoSmall, b.cover, b.coverSmall];

function BrandPage({ brand, setBrand, restaurantName, notify, foods, categories, settings, onSaved }: DashboardProps) {
  const [uploading, setUploading] = useState<"" | "logo" | "cover">("");
  /** Cores em edição no seletor de paleta (ainda não salvas). */
  const [draftColors, setDraftColors] = useState<PaletteColors | null>(null);
  const previewColors = draftColors ?? (isDefaultPalette(brand.palette) ? null : brand.palette!.colors);
  const previewChips = categories.filter((c: any) => c.active !== false).slice(0, 3).map((c: any) => String(c.name));
  const [pct, setPct] = useState(0);
  const [stage, setStage] = useState<UploadStage>("processing");
  const uploadAbort = useRef<AbortController | null>(null);
  // Marca mais recente, para a limpeza agendada saber se a imagem antiga voltou a ser usada (Desfazer).
  const brandRef = useRef(brand);
  useEffect(() => {
    brandRef.current = brand;
  }, [brand]);
  const smallKey = (key: "logo" | "cover") => (key === "logo" ? "logoSmall" : "coverSmall");

  const uploadFile = async (file: File, key: "logo" | "cover") => {
    const abort = new AbortController();
    uploadAbort.current = abort;
    setUploading(key);
    setPct(0);
    setStage("processing");
    const previous = [brand[key], brand[smallKey(key)]];
    try {
      const result = await uploadImage({ file, kind: key === "logo" ? "logo" : "cover", signal: abort.signal, onStage: setStage, onProgress: setPct });
      setBrand((current) => ({ ...current, [key]: result.url, [smallKey(key)]: result.smallUrl }));
      onSaved(
        "brand",
        () => {
          // Confirmado no Firestore: o cardápio aberto já mostra a imagem nova.
          notify(`${key === "logo" ? "Logo atualizada" : "Capa atualizada"} no cardápio · ${describeOptimization(result.optimization)}`);
          scheduleImageCleanup(previous, () => brandImages(brandRef.current));
        },
        // A gravação falhou e a marca voltou ao que era: a imagem recém-enviada não fica órfã.
        () => deleteManagedImages([result.url, result.smallUrl]).catch(() => undefined),
      );
    } catch (error) {
      if (error instanceof ImageError && error.code === "canceled") notify("Envio cancelado");
      else
        notify(friendlyError(error, "Não foi possível enviar a imagem. Tente de novo."), "error", {
          label: "Tentar de novo",
          onAction: () => uploadFile(file, key),
        });
    } finally {
      setUploading("");
      uploadAbort.current = null;
    }
  };
  const upload = (input: HTMLInputElement, key: "logo" | "cover") => {
    const file = input.files?.[0];
    input.value = "";
    if (file) uploadFile(file, key);
  };
  const remove = (key: "logo" | "cover") => {
    const previous = { [key]: brand[key], [smallKey(key)]: brand[smallKey(key)] };
    setBrand((current) => ({ ...current, [key]: "", [smallKey(key)]: "" }));
    onSaved("brand", () => {
      notify(key === "logo" ? "Logo removida" : "Capa removida", "success", {
        label: "Desfazer",
        onAction: () => setBrand((current) => ({ ...current, ...previous })),
      });
      // Só apaga do Storage depois do tempo do Desfazer.
      scheduleImageCleanup(Object.values(previous), () => brandImages(brandRef.current), 30_000);
    });
  };
  const sample = foods.filter((f) => f.available !== false).slice(0, 2);

  const rows: { key: "logo" | "cover"; title: string; hint: string }[] = [
    { key: "logo", title: "Logo", hint: `Quadrada. ${IMAGE_HINT}; fundo transparente é mantido.` },
    { key: "cover", title: "Foto de capa", hint: `Horizontal, do salão ou de um prato da casa. ${IMAGE_HINT}.` },
  ];

  return (
    <div className="kd-brand">
      <div className="kd-stack">
        <PageHeader
          title="Personalização"
          description="Logo, capa e cores do cardápio público. Cada alteração é salva na hora e aparece na prévia ao lado."
        />
        <Card flush>
          <ul className="kd-rows">
            {rows.map(({ key, title, hint }) => (
              <li key={key} className="kd-upload-row">
                {key === "logo" ? (
                  <span className="kd-avatar kd-avatar--lg" aria-hidden>
                    {brand.logo ? <img src={brand.logoSmall || brand.logo} alt="" /> : initial(restaurantName)}
                  </span>
                ) : (
                  <span className="kd-cover-thumb" style={brand.cover ? { backgroundImage: `url(${brand.coverSmall || brand.cover})` } : undefined} aria-hidden />
                )}
                <span className="kd-row-main">
                  <b>{title}</b>
                  <small>{hint}</small>
                </span>
                <span className="kd-upload-actions">
                  <label className={`kd-btn kd-btn--secondary kd-btn--sm ${uploading ? "is-disabled" : ""}`}>
                    <input
                      type="file"
                      accept={IMAGE_ACCEPT}
                      className="kd-sr"
                      disabled={Boolean(uploading)}
                      onChange={(e) => upload(e.currentTarget, key)}
                    />
                    {uploading === key ? <LoaderCircle size={15} className="k-spin" aria-hidden /> : <ImagePlus size={15} aria-hidden />}
                    <span aria-live="polite">{uploading === key ? (stage === "processing" ? "Otimizando…" : `Enviando… ${pct}%`) : brand[key] ? "Trocar" : "Enviar"}</span>
                  </label>
                  {uploading === key ? (
                    <IconButton label="Cancelar envio" onClick={() => uploadAbort.current?.abort()}>
                      <X size={16} />
                    </IconButton>
                  ) : brand[key] && (
                    <IconButton label={key === "logo" ? "Remover logo" : "Remover capa"} tone="danger" onClick={() => remove(key)} disabled={Boolean(uploading)}>
                      <Trash2 size={16} />
                    </IconButton>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <PalettePicker brand={brand} setBrand={setBrand} notify={notify} onPreview={setDraftColors} onSaved={onSaved} />
      </div>
      <figure className="kd-phone">
        <div className="kd-phone-screen kd-menu" aria-hidden style={previewColors ? (paletteVars(previewColors) as React.CSSProperties) : undefined}>
          <MenuHero name={restaurantName || "Seu estabelecimento"} brand={brand} table="Mesa 07" preview />
          <div className="kd-phone-chips kd-menu-chips">
            {(previewChips.length ? previewChips : ["Entradas", "Pratos", "Bebidas"]).map((name, i) => (
              <a key={name + i} className={i === 0 ? "is-active" : ""}>
                {name}
              </a>
            ))}
          </div>
          {settings.waiter && (
            <div className="kd-phone-cta">
              <span className="kd-btn kd-btn--signal kd-btn--sm kd-btn--block">
                <ConciergeBell size={15} /> Chamar garçom
              </span>
            </div>
          )}
          {sample.length > 0 && (
            <ul className="kd-dish-list">
              {sample.map((dish) => (
                <DishRow key={dish.id || dish.name} dish={dish} autoplay={false} />
              ))}
            </ul>
          )}
        </div>
        <figcaption>{draftColors ? "Prévia da paleta em edição (ainda não salva)" : "Prévia com os seus dados, como o cliente vê no celular"}</figcaption>
      </figure>
    </div>
  );
}

/* ───────────────────────── Configurações ───────────────────────── */

function SettingsPage({ settings, setSettings, notify, account, onSaved }: DashboardProps) {
  const billAllowed = canAccessFeature(usePlan(account), "bill_request");
  const options: { key: keyof RestaurantSettings; label: string; description: string }[] = [
    { key: "waiter", label: "Chamar garçom", description: "O cliente avisa a equipe pelo cardápio e o chamado chega com o nome da mesa." },
    { key: "bill", label: "Pedir a conta", description: "Mostra o botão “Pedir a conta” no cardápio. O pedido chega como chamado." },
    { key: "google", label: "Avaliar no Google", description: "Mostra o botão de avaliação no cardápio. Configure o link em Avaliações." },
    { key: "sound", label: "Som para novos chamados", description: "Toca um aviso curto neste navegador quando uma mesa chamar." },
  ];
  return (
    <div className="kd-stack kd-narrow">
      <PageHeader title="Configurações" description="Escolha o que o cliente pode fazer pelo cardápio. Cada alteração é salva na hora." />
      <Card flush>
        <ul className="kd-rows">
          {options.map((o, i) => (
            <li key={o.key} className="kd-pad-row k-enter" style={stagger(i)}>
              <Switch
                label={o.label}
                description={
                  o.key === "bill" && !billAllowed ? (
                    <>
                      Recurso do plano Pro: no seu plano atual o botão não aparece no cardápio. <Link href="/dashboard/assinatura">Ver planos</Link>
                    </>
                  ) : (
                    o.description
                  )
                }
                checked={o.key === "bill" ? settings.bill && billAllowed : Boolean(settings[o.key])}
                disabled={o.key === "bill" && !billAllowed}
                onChange={(checked) => {
                  setSettings((current) => ({ ...current, [o.key]: checked }));
                  if (o.key === "sound" && checked) playCallTone();
                  // O aviso só sai depois que o Firestore confirmou (o cardápio aberto já recebeu a mudança).
                  onSaved("settings", () => notify(`${o.label}: ${checked ? "ativado" : "desativado"}`));
                }}
              />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
