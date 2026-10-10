"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { addPublicCall, createInitialTables, ensureRestaurant, fetchChamadosPage, reserveMenuSlug, saveRestaurant, updateChamadoStatus, watchChamados, watchPublicRestaurant, watchPublicRestaurantProducts, watchPublicTable, watchRestaurant, watchRestaurantCategories, watchRestaurantProducts, watchRestaurantTables, type ChamadoDoc } from "@/lib/restaurant-db";
import type { QueryDocumentSnapshot } from "firebase/firestore";
import { uploadRestaurantImage } from "@/lib/storage";
import { getFirebaseAuth } from "@/lib/auth";
import { friendlyError, isQueued, isTimeout, withTimeout } from "@/lib/async";
import Dashboard, { DashboardSkeleton, type Brand, type LoadErrors, type DataLoaded, type RestaurantSettings } from "@/components/dashboard/dashboard";
import { isFirebaseConfigured } from "@/lib/firebase";
import { createUserWithEmailAndPassword, GoogleAuthProvider, sendPasswordResetEmail, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, updateProfile } from "firebase/auth";
import {
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  LoaderCircle,
  Menu,
  Play,
  Plus,
  Search,
  Star,
  X,
  ShieldCheck,
  FileText,
  Lock,
  Printer,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";


const foods = [
  {
    name: "Pizza Margherita",
    category: "Pizzas",
    price: "49,90",
    image:
      "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=1000&q=85",
    videoUrl:
      "https://assets.mixkit.co/videos/preview/mixkit-tasty-pizza-in-the-oven-1748-small.mp4",
  },
  {
    name: "Hamburguer Artesanal",
    category: "Burgers",
    price: "32,90",
    image:
      "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1000&q=85",
    videoUrl:
      "https://assets.mixkit.co/videos/preview/mixkit-burger-with-melted-cheese-1888-small.mp4",
  },
  {
    name: "Steak na Tabua",
    category: "Pratos especiais",
    price: "79,90",
    image:
      "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1000&q=85",
    videoUrl:
      "https://assets.mixkit.co/videos/preview/mixkit-cutting-a-delicious-meat-steak-1801-small.mp4",
  },
  {
    name: "Coca-Cola",
    category: "Bebidas",
    price: "8,90",
    image:
      "https://images.unsplash.com/photo-1629203849820-fdd70d49c38e?auto=format&fit=crop&w=1000&q=85",
    video: false,
  },
  {
    name: "Tiramisu",
    category: "Sobremesas",
    price: "18,90",
    image:
      "https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?auto=format&fit=crop&w=1000&q=85",
    video: false,
  },
];
const btn =
  "inline-flex items-center justify-center gap-2 border border-[#f7ea48] bg-[#f7ea48] px-5 py-3 text-xs font-semibold tracking-[.12em] text-[#171717] transition hover:bg-[#fcf9f0]";
const lightBtn = "section-link";
const defaultBrand: Brand = { logo: "", cover: "" };
const defaultSettings: RestaurantSettings = {
  waiter: true,
  bill: true,
  google: true,
  sound: false,
  googleReviewUrl: "",
};
const normalizeCategories = (value: any[]) => value.map((category) =>
  Array.isArray(category)
    ? category
    : [String(category?.name || "Sem nome"), String(category?.productCount ?? category?.count ?? 0), String(category?.status || "Ativo")],
);
const serializeCategories = (value: any[]) => value.map((category) =>
  Array.isArray(category)
    ? { name: String(category[0] || "Sem nome"), productCount: Number(category[1]) || 0, status: String(category[2] || "Ativo") }
    : category,
);

export default function App() {
  const path = usePathname();
  const query = useSearchParams();
  // Chamados legados (array no documento restaurante, somente leitura após migração)
  const [legacyCalls, setLegacyCalls] = useState<
    { table: string; type: string; status: string; time: string }[]
  >([]);
  // Chamados vindos da subcoleção paginada
  const [subCalls, setSubCalls] = useState<ChamadoDoc[]>([]);
  const [chamadosCursor, setChamadosCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [chamadosHasMore, setChamadosHasMore] = useState(false);
  const [chamadosLoading, setChamadosLoading] = useState(false);
  const [chamadosError, setChamadosError] = useState("");
  const [session, setSession] = useState(false);
  const [authReady, setAuthReady] = useState(!isFirebaseConfigured);
  const [brand, setBrand] = useState<Brand>(defaultBrand);
  const [restaurantName, setRestaurantName] = useState("");
  const [settings, setSettings] = useState<RestaurantSettings>(defaultSettings);
  const [menuFoods, setMenuFoods] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [tables, setTables] = useState<string[]>([]);
  const [pendingTables, setPendingTables] = useState<string[]>([]);
  const [tableTokens, setTableTokens] = useState<Record<string, string>>({});
  const [publicRestaurantId, setPublicRestaurantId] = useState("");
  const [publicTableName, setPublicTableName] = useState("");
  const [storageReady, setStorageReady] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  const [restaurantLoaded, setRestaurantLoaded] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [restaurantError, setRestaurantError] = useState("");
  const [slowLoad, setSlowLoad] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [loadErrors, setLoadErrors] = useState<LoadErrors>({});
  const [publicStatus, setPublicStatus] = useState<"loading" | "ready" | "not-found" | "error">("loading");
  const [publicProductsLoaded, setPublicProductsLoaded] = useState(false);
  const lastRemoteState = useRef<Record<string, string>>({});
  // Último valor confirmado pelo servidor: usado para desfazer mudanças otimistas que falharem.
  const confirmed = useRef<{ calls?: any[]; brand?: Brand; settings?: RestaurantSettings }>({});
  const retry = () => {
    setRestaurantError("");
    setSlowLoad(false);
    setLoadErrors({});
    setLoaded({ products: false, categories: false, tables: false });
    setPublicStatus("loading");
    setRetryKey((k) => k + 1);
  };
  const [loaded, setLoaded] = useState<DataLoaded>({ products: false, categories: false, tables: false });
  const markLoaded = (key: keyof DataLoaded) => setLoaded((current) => (current[key] ? current : { ...current, [key]: true }));
  const [toast, setToast] = useState("");
  const [toastTone, setToastTone] = useState<"success" | "error">("success");
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const notify = (t: string, tone: "success" | "error" = "success") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastTone(tone);
    setToast(t);
    // Erros ficam mais tempo na tela: o usuário precisa ler o que fazer.
    toastTimer.current = setTimeout(() => setToast(""), tone === "error" ? 7000 : 3200);
  };
  const persist = <K extends "calls" | "brand" | "settings">(key: K, value: unknown, restore: (value: any) => void) => {
    saveRestaurant({ [key]: value }).catch((error) => {
      if (isTimeout(error)) {
        notify("Sem resposta do servidor. A alteração ficou guardada neste aparelho e será enviada quando a conexão voltar.", "error");
        return;
      }
      notify(friendlyError(error, "Não foi possível salvar a alteração. Ela foi desfeita; tente de novo."), "error");
      const previous = confirmed.current[key];
      if (previous !== undefined) {
        lastRemoteState.current[key] = JSON.stringify(previous);
        restore(previous);
      }
    });
  };
  useEffect(() => {
    const loadState = () => {
      const saved = localStorage.getItem("kardap-calls"),
        savedBrand = localStorage.getItem("kardap-brand"),
        savedSettings = localStorage.getItem("kardap-settings");
      // Dados operacionais não são carregados do cache: o dashboard só exibe
      // valores recebidos do Firestore para o restaurante autenticado.
    };

    loadState();
    setStorageReady(true);

    const handleStorage = (e: StorageEvent) => {
      if (e.key === "kardap-calls" && e.newValue)
        setLegacyCalls(JSON.parse(e.newValue));
      if (e.key === "kardap-brand" && e.newValue)
        setBrand({ ...defaultBrand, ...JSON.parse(e.newValue) });
      if (e.key === "kardap-settings" && e.newValue)
        setSettings({ ...defaultSettings, ...JSON.parse(e.newValue) });
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return onAuthStateChanged(getFirebaseAuth(), (user) => {
      if (user) {
        const cachedUserId = localStorage.getItem("kardap-restaurant-owner");
        if (cachedUserId && cachedUserId !== user.uid) {
          localStorage.removeItem("kardap-restaurant-id");
        }
        localStorage.setItem("kardap-restaurant-owner", user.uid);
      }
      if (!user) setRestaurantLoaded(false);
      setSession(Boolean(user));
      setAuthReady(true);
    });
  }, []);
  useEffect(() => {
    if (!session) return;
    const stop = watchRestaurant(
      (data, meta) => {
        // Sem rede, o Firestore responde "documento não existe" a partir do cache vazio:
        // isso não pode ser tratado como "restaurante sem onboarding".
        if (!data && meta.fromCache) return;
        setRestaurantError("");
        if (data) {
          if (typeof data.name === "string") setRestaurantName(data.name);
          setOnboardingDone(Boolean((data.onboarding as { completed?: boolean } | undefined)?.completed));
          if (typeof data.slug === "string") localStorage.setItem("kardap-restaurant-slug", data.slug);
          if (data.calls) {
            lastRemoteState.current.calls = JSON.stringify(data.calls);
            if (!meta.fromCache) confirmed.current.calls = data.calls as any[];
            setLegacyCalls(data.calls as typeof legacyCalls);
          }
          if (data.brand) {
            const next = { ...defaultBrand, ...(data.brand as Brand) };
            lastRemoteState.current.brand = JSON.stringify(data.brand);
            if (!meta.fromCache) confirmed.current.brand = next;
            setBrand(next);
          }
          if (data.settings) {
            const next = { ...defaultSettings, ...(data.settings as RestaurantSettings) };
            lastRemoteState.current.settings = JSON.stringify(data.settings);
            if (!meta.fromCache) confirmed.current.settings = next;
            setSettings(next);
          }
          if (data.tables) {
            lastRemoteState.current.tables = JSON.stringify(data.tables);
            setTables(data.tables as string[]);
          }
        }
        setRestaurantLoaded(true);
        setCloudReady(true);
      },
      (error) => {
        setRestaurantError(friendlyError(error, "Não foi possível carregar os dados do seu restaurante."));
      },
    );
    return stop;
  }, [session, retryKey]);
  useEffect(() => {
    setSlowLoad(false);
    if (!session || restaurantLoaded) return;
    const timer = setTimeout(() => setSlowLoad(true), 9000);
    return () => clearTimeout(timer);
  }, [session, restaurantLoaded, retryKey]);
  useEffect(() => {
    if (!path.startsWith("/r/")) return;
    const slug = path.split("/")[2];
    if (!slug) return;
    setPublicStatus("loading");
    setPublicProductsLoaded(false);
    const slowTimer = setTimeout(() => setSlowLoad(true), 9000);
    const stop = watchPublicRestaurant(
      slug,
      (data, meta) => {
        if (!data) {
          if (meta.fromCache) return;
          clearTimeout(slowTimer);
          setPublicStatus("not-found");
          return;
        }
        clearTimeout(slowTimer);
        setSlowLoad(false);
        setPublicStatus("ready");
        setPublicRestaurantId(data.id);
        if (typeof data.name === "string") setRestaurantName(data.name);
        if (data.brand) setBrand({ ...defaultBrand, ...(data.brand as Brand) });
        if (data.settings) setSettings({ ...defaultSettings, ...(data.settings as RestaurantSettings) });
      },
      () => {
        clearTimeout(slowTimer);
        setPublicStatus("error");
      },
    );
    return () => {
      clearTimeout(slowTimer);
      stop();
    };
  }, [path, retryKey]);
  useEffect(() => {
    const token = query.get("mesa");
    if (!path.startsWith("/r/") || !publicRestaurantId || !token) {
      setPublicTableName("");
      return;
    }
    return watchPublicTable(
      publicRestaurantId,
      token,
      (table) => setPublicTableName(table?.name || ""),
      () => setPublicTableName(""),
    );
  }, [path, publicRestaurantId, query]);
  useEffect(() => {
    if (!session) return;
    return watchRestaurantTables(
      (remoteTables, meta) => {
        if (meta.fromCache && !remoteTables.length) return;
        setTables(remoteTables.map((table) => table.name));
        setPendingTables(remoteTables.filter((table) => table.pending).map((table) => table.name));
        markLoaded("tables");
        setTableTokens(Object.fromEntries(remoteTables.map((table) => [table.name, table.qrToken])));
      },
      (error) => {
        setLoadErrors((current) => ({ ...current, tables: friendlyError(error, "Não foi possível carregar as mesas.") }));
        markLoaded("tables");
      },
    );
  }, [session, retryKey]);
  useEffect(() => {
    if (!session) return;
    return watchRestaurantCategories(
      (items, meta) => {
        if (meta.fromCache && !items.length) return;
        setCategories(items);
        markLoaded("categories");
      },
      (error) => {
        setLoadErrors((current) => ({ ...current, categories: friendlyError(error, "Não foi possível carregar as categorias.") }));
        markLoaded("categories");
      },
    );
  }, [session, retryKey]);
  useEffect(() => {
    if (!session) return;
    setChamadosError("");
    const CHAMADOS_PAGE_SIZE = 20;
    return watchChamados(
      CHAMADOS_PAGE_SIZE,
      (items, meta) => {
        if (meta.fromCache && !items.length) return;
        setSubCalls(items);
        setChamadosCursor(meta.lastCursor);
        setChamadosHasMore(meta.hasMore);
      },
      (error) => setChamadosError(friendlyError(error, "Não foi possível carregar os chamados.")),
    );
  }, [session, retryKey]);
  const loadMoreChamados = async () => {
    if (chamadosLoading || !chamadosHasMore) return;
    setChamadosLoading(true);
    try {
      const next = await fetchChamadosPage(chamadosCursor, 20);
      setSubCalls((prev) => {
        const seen = new Set(prev.map((item) => item.id));
        return [...prev, ...next.items.filter((item) => !seen.has(item.id))];
      });
      setChamadosCursor(next.lastCursor);
      setChamadosHasMore(next.hasMore);
    } catch (error) {
      notify(friendlyError(error, "Não foi possível carregar mais chamados."), "error");
    } finally {
      setChamadosLoading(false);
    }
  };
  const calls = useMemo(() => {
    const relative = (iso: string) => {
      const diff = Date.now() - new Date(iso).getTime();
      if (!Number.isFinite(diff) || diff < 60_000) return "agora";
      const minutes = Math.floor(diff / 60_000);
      if (minutes < 60) return `${minutes} min`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours} h`;
      const days = Math.floor(hours / 24);
      return `${days} d`;
    };
    const subs = subCalls.map((c) => ({ _key: `sub:${c.id}`, _source: "sub" as const, _id: c.id, table: c.table, type: c.type, status: c.status, time: relative(c.createdAt), createdAt: c.createdAt }));
    const legacy = legacyCalls.map((c, idx) => ({ _key: `legacy:${idx}`, _source: "legacy" as const, _id: String(idx), table: c.table, type: c.type, status: c.status, time: c.time, createdAt: "" }));
    return [...subs, ...legacy];
  }, [subCalls, legacyCalls]);
  const advanceCall = (key: string, nextStatus: "ativo" | "andamento" | "concluido") => {
    const [source, id] = key.split(":");
    if (source === "sub") {
      setSubCalls((prev) => prev.map((item) => (item.id === id ? { ...item, status: nextStatus } : item)));
      updateChamadoStatus(id, nextStatus).catch((error) => {
        notify(friendlyError(error, "Não foi possível atualizar o chamado."), "error");
      });
      return;
    }
    const idx = Number(id);
    setLegacyCalls((prev) => prev.map((item, i) => (i === idx ? { ...item, status: nextStatus } : item)));
  };
  useEffect(() => {
    if (!session) return;
    return watchRestaurantProducts(
      (items, meta) => {
        if (meta.fromCache && !items.length) return;
        setMenuFoods(items);
        markLoaded("products");
      },
      (error) => {
        setLoadErrors((current) => ({ ...current, products: friendlyError(error, "Não foi possível carregar os produtos.") }));
        markLoaded("products");
      },
    );
  }, [session, retryKey]);
  useEffect(() => {
    if (!path.startsWith("/r/") || !publicRestaurantId) return;
    return watchPublicRestaurantProducts(
      publicRestaurantId,
      (items, meta) => {
        if (meta.fromCache && !items.length) return;
        setMenuFoods(items);
        setPublicProductsLoaded(true);
      },
      () => {
        setPublicStatus("error");
      },
    );
  }, [path, publicRestaurantId, retryKey]);
  useEffect(() => {
    if (storageReady) {
      localStorage.setItem("kardap-calls", JSON.stringify(legacyCalls));
      const serialized = JSON.stringify(legacyCalls);
      if (cloudReady && lastRemoteState.current.calls !== serialized) {
        lastRemoteState.current.calls = serialized;
        persist("calls", legacyCalls, setLegacyCalls);
      }
    }
  }, [legacyCalls, storageReady]);
  useEffect(() => {
    if (storageReady) {
      localStorage.setItem("kardap-brand", JSON.stringify(brand));
      const serialized = JSON.stringify(brand);
      if (cloudReady && lastRemoteState.current.brand !== serialized) {
        lastRemoteState.current.brand = serialized;
        persist("brand", brand, setBrand);
      }
    }
  }, [brand, storageReady]);
  useEffect(() => {
    if (storageReady) {
      localStorage.setItem("kardap-settings", JSON.stringify(settings));
      const serialized = JSON.stringify(settings);
      if (cloudReady && lastRemoteState.current.settings !== serialized) {
        lastRemoteState.current.settings = serialized;
        persist("settings", settings, setSettings);
      }
    }
  }, [settings, storageReady]);
  useEffect(() => {
    if (storageReady) {
      localStorage.setItem("kardap-tables", JSON.stringify(tables));
    }
  }, [tables, storageReady, cloudReady]);
  if (!storageReady) {
    if (path.startsWith("/dashboard")) return <DashboardSkeleton />;
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#fcf9f0]">
        <LoaderCircle className="animate-spin text-[#9E8800]" size={40} />
      </div>
    );
  }

  const isPanelRoute = path.startsWith("/dashboard") || path === "/onboarding";
  // Evita mostrar login/onboarding por engano enquanto o Firebase ainda restaura a sessão no F5.
  if (isPanelRoute && (!authReady || (session && !restaurantLoaded))) {
    return path.startsWith("/dashboard") ? (
      <DashboardSkeleton error={restaurantError} slow={slowLoad} onRetry={retry} />
    ) : restaurantError || slowLoad ? (
      <LoadProblem message={restaurantError} slow={slowLoad} onRetry={retry} />
    ) : (
      <div className="flex items-center justify-center min-h-screen bg-white" aria-busy="true">
        <LoaderCircle className="animate-spin text-black" size={32} />
      </div>
    );
  }

  let page: React.ReactNode;
  if (path === "/")
    page = (
      <>
        <Landing session={session} />
        <MenuVideoShowcase notify={notify} />
        <SiteFooter />
      </>
    );
  else if (path === "/login" || path === "/criar-conta")
    page = (
      <Auth
        register={path === "/criar-conta"}
        onLogin={() => setSession(true)}
      />
    );
  else if (["/privacidade", "/termos", "/cookies"].includes(path))
    page = (
      <LegalPage type={path.slice(1) as "privacidade" | "termos" | "cookies"} />
    );
  else if (path === "/onboarding" && !session)
    page = <Auth register={false} onLogin={() => setSession(true)} />;
  else if (path === "/onboarding" || (session && !onboardingDone && path.startsWith("/dashboard")))
    page = <Onboarding onComplete={() => setOnboardingDone(true)} />;
  else if (path.startsWith("/dashboard") && !session)
    page = <Auth register={false} onLogin={() => setSession(true)} />;
  else if (path.startsWith("/r/"))
    page = (
      <PublicMenu
        status={publicStatus}
        slow={slowLoad}
        onRetry={retry}
        productsLoaded={publicProductsLoaded}
        restaurantId={publicRestaurantId}
        table={publicTableName}
        notify={notify}
        brand={brand}
        settings={settings}
        foods={menuFoods}
        restaurantName={restaurantName}
      />
    );
  else
    page = (
      <Dashboard
        path={path}
        calls={calls}
        advanceCall={advanceCall}
        chamadosHasMore={chamadosHasMore}
        chamadosLoading={chamadosLoading}
        chamadosError={chamadosError}
        loadMoreChamados={loadMoreChamados}
        notify={notify}
        brand={brand}
        setBrand={setBrand}
        restaurantName={restaurantName}
        settings={settings}
        setSettings={setSettings}
        foods={menuFoods}
        categories={categories}
        tables={tables}
        tableTokens={tableTokens}
        pendingTables={pendingTables}
        loaded={loaded}
        loadErrors={loadErrors}
        onRetry={retry}
      />
    );
  return (
    <>
      {page}
      <BackToTop />
      {toast && (
        <div className={`toast ${toastTone === "error" ? "toast--error" : ""}`} role={toastTone === "error" ? "alert" : "status"} aria-live={toastTone === "error" ? "assertive" : "polite"}>
          <span className="toast-check" aria-hidden>
            {toastTone === "error" ? <X size={16} strokeWidth={2.5} /> : <Check size={16} strokeWidth={2.5} />}
          </span>
          <span className="toast-message">{toast}</span>
          <button
            onClick={() => setToast("")}
            className="toast-close"
            aria-label="Fechar notificação"
          >
            <X size={16} />
          </button>
        </div>
      )}

    </>
  );
}

function LoadProblem({ message, slow, onRetry }: { message?: string; slow?: boolean; onRetry: () => void }) {
  return (
    <div className="load-problem" role={message ? "alert" : "status"}>
      {message ? null : <LoaderCircle className="animate-spin" size={28} aria-hidden />}
      <p className="load-problem-title">{message ? "Não foi possível carregar" : "Está demorando mais que o normal"}</p>
      <p className="load-problem-text">{message || "Ainda estamos buscando seus dados. Se sua internet estiver instável, tente de novo."}</p>
      <button type="button" className="load-problem-btn" onClick={onRetry}>
        Tentar novamente
      </button>
    </div>
  );
}

function BackToTop() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const update = () => setVisible(window.scrollY > 520);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  return (
    <button
      className={"back-to-top " + (visible ? "is-visible" : "")}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Voltar ao topo"
    >
      <ChevronRight size={19} />
    </button>
  );
}

function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="Kardap - inicio"
      className={"brand-logo " + (light ? "brand-logo-light" : "")}
    >
      <img src="/Logo%20KARDAP%20do%20Chef%20Corredor.png" alt="Kardap" />
    </Link>
  );
}
function NavBar({ session }: { session: boolean }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const handle = () => setScrolled(window.scrollY > 10);
    handle();
    window.addEventListener("scroll", handle);
    return () => window.removeEventListener("scroll", handle);
  }, []);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);
  const links = [
    ["Recursos", "#recursos"],
    ["Precos", "#precos"],
  ];

  return (
    <header
      className={
        "site-nav " + (scrolled ? "is-scrolled" : "") + (open ? " is-open" : "")
      }
    >
      <nav>
        <Logo light />
        <div className="site-links">
          {links.map(([label, href]) => (
            <a key={href} href={href}>
              {label}
            </a>
          ))}
          {session ? (
            <Link className="nav-cta" href="/dashboard">
              Acessar Painel <ChevronRight size={16} />
            </Link>
          ) : (
            <>
              <Link className="nav-login" href="/login">
                Entrar
              </Link>
              <Link href="/criar-conta" className="nav-cta">
                Comecar agora
              </Link>
            </>
          )}
        </div>
        <button
          aria-label="Abrir menu"
          className="nav-toggle"
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={21} /> : <Menu size={21} />}
        </button>
      </nav>
      {open && (
        <div className="nav-mobile">
          <div>
            {links.map(([label, href]) => (
              <a onClick={() => setOpen(false)} key={href} href={href}>
                {label}
              </a>
            ))}
          </div>
          <div>
            <Link
              onClick={() => setOpen(false)}
              className="nav-mobile-login"
              href="/login"
            >
              Entrar
            </Link>
            <Link
              onClick={() => setOpen(false)}
              href="/criar-conta"
              className="nav-cta"
            >
              Comecar agora <ChevronRight size={16} />
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
function Landing({ session }: { session: boolean }) {
  const primaryHref = session ? "/dashboard" : "/criar-conta";
  const primaryLabel = session ? "Abrir painel" : "Criar cardápio";
  return (
    <main className="bg-[#fcf9f0] text-[#1d0b0d]">
      <NavBar session={session} />
      <section className="hero">
        <div className="hero-copy relative z-10 max-w-4xl">
          <h1>
            O SABOR COMECA
            <br />
            NO <i>PRIMEIRO TOQUE.</i>
          </h1>
          <p className="hero-description">
            Substitua o cardápio de papel por uma experiência digital premium.
            Apresente seus pratos com elegância, agilize o atendimento via QR
            Code e aumente suas vendas de forma inteligente.
          </p>
          <div className="hero-actions">
            {session ? (
              <Link href="/dashboard" className="hero-primary">
                ACESSAR PAINEL <ChevronRight size={18} />
              </Link>
            ) : (
              <Link href="/criar-conta" className="hero-primary">
                CRIAR MEU CARDAPIO <ChevronRight size={18} />
              </Link>
            )}
          </div>
        </div>
        <div className="phone hero-phone">
          <PhoneScreen />
        </div>
      </section>

      <section className="qr-feature">
        <div className="qr-paper">
          <small>PIZZARIA DO JOAO</small>
          <strong>MESA 07</strong>
          <div className="fake-qr">K</div>
          <small>
            APONTE A CAMERA E ACESSE
            <br />
            NOSSO CARDAPIO.
          </small>
        </div>
        <div>
          <p className="eyebrow text-[#f7ea48]">INTELIGENCIA NA MESA</p>
          <h2>
            UM QR CODE.
            <br />
            UMA MESA.
            <br />
            <i>UMA EXPERIENCIA.</i>
          </h2>
          <p>
            Cada leitura identifica automaticamente a mesa. O cliente recebe uma
            experiencia acolhedora e sua equipe sabe de onde vem cada chamado.
          </p>
        </div>
      </section>
      <section id="recursos" className="food-section">
        <div>
          <p className="eyebrow">IMAGENS QUE ABREM O APETITE</p>
          <h2>
            SEUS PRATOS VENDEM
            <br />
            ANTES DO PEDIDO.
          </h2>
        </div>
        <div className="food-grid">
          {foods.slice(0, 3).map((f) => (
            <FoodCard key={f.name} food={f} />
          ))}
        </div>
      </section>
      <section className="split cream">
        <div className="phone">
          <PhoneScreen />
        </div>
        <div>
          <p className="eyebrow">ATENDIMENTO GENTIL</p>
          <h2>
            SEM GRITAR.
            <br />
            SEM LEVANTAR
            <br />A MAO.
          </h2>
          <p>
            Um toque chama sua equipe. Outro pede a conta. Menos espera, mais
            conversa boa na mesa.
          </p>
          <Link className={lightBtn} href="/r/pizzaria-do-joao?mesa=07">
            VER EXPERIENCIA <ChevronRight size={16} />
          </Link>
        </div>
      </section>

      {/* 15 Days Free Trial CTA */}
      {!session && (
        <section className="trial-cta" aria-labelledby="trial-title">
          <div className="trial-line" aria-hidden="true" />
          <div className="trial-content">
            <span className="trial-badge">15 DIAS GRÁTIS</span>
            <h2 id="trial-title">Seu cardápio digital começa aqui.</h2>
            <p>
              Cadastre produtos, organize suas mesas e veja seu atendimento
              ganhar ritmo desde o primeiro dia.
            </p>
          </div>
          <div className="trial-action">
            <Link href="/criar-conta" className="trial-button">
              COMEÇAR MEU TESTE GRÁTIS <ChevronRight size={18} />
            </Link>
            <small>Sem cartão de crédito.</small>
          </div>
          {/* Subtle background glow */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(247,234,72,0.06)_0%,transparent_60%)] pointer-events-none" />

          <div className="relative z-10 max-w-2xl mx-auto flex flex-col items-center">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/5 text-[10px] font-bold tracking-[0.1em] text-[#C7C5BF] mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-[#F7EA48] animate-pulse" />
              15 DIAS PARA EXPERIMENTAR
            </span>

            <h2 className="font-['Sora'] text-4xl md:text-5xl lg:text-6xl font-semibold tracking-[-0.04em] leading-[1.1] mb-6 text-[#F8F7F2]">
              Seu cardápio digital
              <br />
              começa aqui.
            </h2>

            <p className="font-['DM_Sans'] text-[#C7C5BF] text-lg md:text-xl leading-relaxed max-w-xl mb-12">
              Cadastre seus produtos, configure suas mesas e sinta na prática
              como a nossa plataforma eleva o nível do seu atendimento.
            </p>

            <Link
              href="/criar-conta"
              className="inline-flex items-center justify-center gap-2 border border-[#F7EA48] bg-[#F7EA48] px-8 py-4 rounded-[12px] text-[12px] font-bold tracking-[0.08em] text-[#171717] hover:scale-105 hover:bg-[#E2D325] hover:border-[#E2D325] transition-all duration-300 shadow-[0_0_40px_rgba(247,234,72,0.15)]"
            >
              COMEÇAR MEU TESTE GRÁTIS <ChevronRight size={18} />
            </Link>
          </div>
        </section>
      )}

      <section id="precos" className="prices">
        <p className="eyebrow text-[#f7ea48]">PLANOS PARA CRESCER</p>
        <h2>
          O COMERCO COMECA
          <br />
          NA PRIMEIRA LEITURA.
        </h2>
        <div className="price-grid">
          <Price
            name="ESSENCIAL"
            price="49"
            period="/mês"
            features={[
              "Cardápio digital",
              "Vídeos nos produtos",
              "QR Codes por mesa",
              "Fotos dos produtos",
              "Chamar garçom",
              "Avaliar no Google",
            ]}
          />
          <Price
            name="PRO"
            price="99"
            period="/mês"
            features={[
              "Tudo do Essencial",
              "Vídeos nos produtos em HD",
              "Pedir conta à mesa",
              "Analytics avançado",
              "Personalização completa de marca",
            ]}
            featured
          />

        </div>
      </section>
      <section className="final-cta">
        <h2>
          COLOQUE SEU
          <br />
          RESTAURANTE NA MESA
          <br />
          DO FUTURO.
        </h2>
        <Link href="/criar-conta" className={btn}>
          CRIAR MEU CARDAPIO <ChevronRight size={16} />
        </Link>
      </section>
    </main>
  );
}

function FoodCard({ food }: { food: (typeof foods)[number] }) {
  const videoSource =
    food.name === "Pizza Margherita"
      ? "/pizzavideo.mp4"
      : food.name === "Hamburguer Artesanal"
        ? "/hamburguer.mp4"
        : food.name === "Steak na Tabua"
          ? "/carne%20tabua.mp4"
          : null;
  return (
    <article
      className="food-card"
      style={
        videoSource ? undefined : { backgroundImage: `url(${food.image})` }
      }
    >
      {videoSource && (
        <video
          className="food-card-video"
          src={videoSource}
          autoPlay
          muted
          loop
          playsInline
        />
      )}
      <div>
        <span>{food.category}</span>
        {food.video && (
          <span>
            <Play size={12} fill="currentColor" /> VIDEO
          </span>
        )}
      </div>
      <h3>{food.name}</h3>
      <b>R$ {food.price}</b>
    </article>
  );
}
function MenuVideoShowcase({ notify }: { notify: (message: string) => void }) {
  const [video, setVideo] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const selectVideo = (file?: File) => {
    if (!file) return;
    if (video) URL.revokeObjectURL(video);
    setVideo(URL.createObjectURL(file));
    notify("Video adicionado a demonstracao");
  };
  return (
    <section className="menu-video-showcase">
      <div className="video-copy">
        <p className="eyebrow">VEJA O CARDAPIO EM ACAO</p>
        <h2>
          UMA EXPERIENCIA
          <br />
          QUE DA <i>FOME.</i>
        </h2>
        <p>
          Mostre a navegacao, os pratos e todos os pequenos detalhes que fazem
          seu cardapio digital ser inesquecivel.
        </p>
        <button
          onClick={() => fileInput.current?.click()}
          className="video-upload"
        >
          <Plus size={17} />
          {video ? "TROCAR VIDEO" : "ADICIONAR VIDEO"}
        </button>
        <input
          ref={fileInput}
          onChange={(e) => selectVideo(e.target.files?.[0])}
          type="file"
          accept="video/*"
          hidden
        />
      </div>
      <div className="video-frame">
        {video ? (
          <video src={video} controls playsInline />
        ) : (
          <>
            <div className="video-poster">
              <span>
                SEU VIDEO
                <br />
                DO CARDAPIO
              </span>
              <button
                onClick={() => fileInput.current?.click()}
                aria-label="Selecionar video"
              >
                <Play size={28} fill="currentColor" />
              </button>
            </div>
            <small>AREA DE DEMONSTRACAO</small>
          </>
        )}
      </div>
    </section>
  );
}
function SiteFooter() {
  const groups = [
    [
      "PRODUTO",
      [
        ["Recursos", "#recursos"],
        ["Precos", "#precos"],
        ["Criar cardapio", "/criar-conta"],
      ],

    ],
    [
      "RESTAURANTES",
      [
        ["Cardapio digital", "/r/pizzaria-do-joao?mesa=07"],
        ["Dashboard", "/dashboard"],
        ["QR Codes", "/dashboard/qrcodes"],
        ["Chamados", "/dashboard/chamados"],
      ],
    ],
    [
      "SUPORTE",
      [
        ["Entrar", "/login"],
        ["Central de ajuda", "/privacidade#duvidas"],
        ["Privacidade", "/privacidade"],
        ["Termos de uso", "/termos"],
      ],

    ],
  ];
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div className="footer-brand">
          <Logo />
          <p>
            Uma experiencia digital que aproxima seu restaurante de cada cliente
            a mesa.
          </p>
          <Link href="/criar-conta">
            COMECE AGORA <ChevronRight size={15} />
          </Link>
        </div>
        <div className="footer-links">
          {groups.map(([title, links]) => (
            <div key={title as string}>
              <h3>{title as string}</h3>
              <ul>
                {(links as string[][]).map(([label, href]) => (
                  <li key={label}>
                    <Link href={href}>{label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} KARDAP. CARDAPIO EM MOVIMENTO.</span>
        <span>FEITO PARA RESTAURANTES</span>
      </div>
    </footer>
  );
}
function LegalPage({ type }: { type: "privacidade" | "termos" | "cookies" }) {
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);

  const docs = {
    privacidade: {
      badge: "CONFORMIDADE LGPD · LEI Nº 13.709/2018",
      eyebrow: "PRIVACIDADE E PROTEÇÃO DE DADOS",
      title: "Política de Privacidade",
      subtitle:
        "Entenda como a plataforma Kardap coleta, utiliza, armazena e protege os dados de estabelecimentos parceiros e de clientes à mesa.",
      updated: "Versão 1.2 · Atualizada em 09 de outubro de 2026",
      summary: [
        {
          title: "Sem Venda de Dados",
          desc: "Não comercializamos dados pessoais de estabelecimentos ou clientes com terceiros.",
        },
        {
          title: "Segurança de Ponta a Ponta",
          desc: "Criptografia SSL/TLS em todas as transmissões e armazenamento seguro de dados.",
        },
        {
          title: "Direitos LGPD Garantidos",
          desc: "Acesso, correção, anonimização e exclusão garantidos a qualquer momento via DPO.",
        },
      ],
      sections: [
        {
          id: "introducao",
          num: "01",
          heading: "1. Introdução e Escopo de Aplicação",
          body: `A plataforma Kardap ("nós", "plataforma" ou "Kardap") é uma solução digital de cardápios interativos por QR Code e gestão de atendimento à mesa para restaurantes, bares, lanchonetes e cafeterias.

Esta Política de Privacidade foi estruturada em total conformidade com a Lei Geral de Proteção de Dados Pessoais (LGPD - Lei nº 13.709/2018), o Marco Civil da Internet (Lei nº 12.965/2014) e o Código de Defesa do Consumidor. Nosso objetivo é transparente: garantir a máxima segurança e privacidade tanto para os estabelecimentos comerciais quanto para os clientes finais que interagem com nossos cardápios.`,
        },
        {
          id: "dados-coletados",
          num: "02",
          heading: "2. Dados Pessoais Coletados e Formas de Coleta",
          body: `Coletamos apenas as informações estritamente necessárias para a prestação e aprimoramento dos nossos serviços:

• **Dados de Administradores do Estabelecimento**: No momento do cadastro da conta comercial, solicitamos nome completo, e-mail corporativo, número de telefone/WhatsApp, nome do estabelecimento, cidade e senha criptografada.
• **Dados dos Clientes à Mesa (Consumidores)**: Para proporcionar um atendimento ágil e descomplicado, o acesso ao cardápio digital via QR Code **não exige cadastro prévio nem fornecimento de CPF**. Coletamos temporariamente apenas o número da mesa (ex: Mesa 07) e as solicitações enviadas (como chamar garçom ou pedir a conta).
• **Dados Técnicos de Navegação**: Endereço IP, tipo de navegador, sistema operacional e registros de data/hora de acesso, coletados automaticamente para fins de segurança, prevenção a fraudes e estabilidade da infraestrutura.`,
        },
        {
          id: "bases-legais",
          num: "03",
          heading: "3. Finalidades e Bases Legais do Tratamento (Art. 7º LGPD)",
          body: `O tratamento dos seus dados pessoais é realizado mediante o enquadramento em bases legais válidas previstas no Artigo 7º da LGPD:

1. **Execução de Contrato (Art. 7º, V)**: Processamos seus dados cadastrais para permitir o acesso ao painel administrativo, gerenciar cardápios, emitir QR Codes e operacionalizar os chamados de atendimento em tempo real.
2. **Cumprimento de Obrigação Legal (Art. 7º, II)**: Guardamos os registros de acesso a aplicações de internet durante 6 (seis) meses para atender a determinações do Marco Civil da Internet.
3. **Legítimo Interesse (Art. 7º, IX)**: Utilizamos dados anonimizados e estatísticas de uso para otimizar o desempenho do sistema, identificar gargalos operacionais e prevenir falhas de segurança.
4. **Consentimento (Art. 7º, I)**: Quando necessário para comunicações de marketing, novidades de recursos ou materiais promocionais opcionais.`,
        },
        {
          id: "seguranca",
          num: "04",
          heading: "4. Armazenamento e Medidas de Segurança",
          body: `Adotamos padrões rígidos de segurança cibernética para proteger seus dados contra acessos não autorizados, perda, destruição ou vazamentos:

• **Criptografia**: Todos os dados trafegados entre seu navegador e nossos servidores utilizam protocolos seguros HTTPS com criptografia SSL/TLS de 256 bits.
• **Armazenamento Local (LocalStorage)**: Guardamos chaves técnicas de sessão no seu próprio navegador (como \`kardap-calls\` e \`kardap-settings\`) para acelerar o carregamento do painel e evitar desconexões indesejadas.
• **Proteção de Credenciais**: Senhas são armazenadas utilizando algoritmos de hash de sentido único com salting (bcrypt/argon2), sendo inacessíveis inclusive para nossa equipe interna.`,
        },
        {
          id: "compartilhamento",
          num: "05",
          heading: "5. Compartilhamento de Dados com Terceiros",
          body: `Garantimos que o Kardap **não vende, aluga ou compartilha dados pessoais com corretores de dados ou anunciantes**. O compartilhamento restringe-se exclusivamente aos seguintes parceiros operacionais:

• **Provedores de Infraestrutura de Nuvem**: Servidores de alta confiabilidade responsáveis por manter o banco de dados e a aplicação online com alta disponibilidade.
• **Processadores de Pagamento Homologados**: Instituições financeiras para o processamento de assinaturas dos planos pagos, sob estritos padrões de segurança PCI-DSS.
• **Requisição Judicial ou Regulatório**: Por determinação de autoridades policiais, judiciais ou administrativas competentes, nos estritos limites da lei.`,
        },
        {
          id: "direitos-titular",
          num: "06",
          heading: "6. Seus Direitos como Titular de Dados (Art. 18 LGPD)",
          body: `Você possui controle total sobre suas informações pessoais. Nos termos da LGPD, você pode requerer a qualquer momento:

1. **Confirmação e Acesso**: Saber se tratamos seus dados e obter uma cópia completa dos registros.
2. **Correção**: Solicitar a atualização de dados incorretos, incompletos ou desatualizados.
3. **Anonimização ou Exclusão**: Pedir a remoção de dados desnecessários ou o encerramento definitivo da sua conta com apaga de registros.
4. **Portabilidade**: Solicitar a transferência dos seus dados a outro fornecedor de serviços em formato estruturado.
5. **Revogação do Consentimento**: Retirar autorizações concedidas anteriormente de forma simples e gratuita.`,
        },
        {
          id: "retencao-exclusao",
          num: "07",
          heading: "7. Período de Retenção e Exclusão de Dados",
          body: `Os dados pessoais dos restaurantes parceiros serão mantidos durante a vigência do contrato de uso da plataforma. Caso decida encerrar sua conta, seus dados pessoais e dados de produtos serão excluídos ou anonimizados permanentemente do nosso banco de dados ativo em até 30 (trinta) dias úteis.

Dados exigidos por obrigações legais, fiscais ou regulatórias serão mantidos armazenados de forma restrita pelos prazos mínimos previstos na legislação brasileira.`,
        },
        {
          id: "dpo-contato",
          num: "08",
          heading: "8. Encarregado de Proteção de Dados (DPO) e Contato",
          body: `Para tirar dúvidas sobre esta Política, solicitar o exercício dos seus direitos da LGPD ou reportar incidentes de segurança, entre em contato direto com o nosso Encarregado de Proteção de Dados:

• **E-mail dedicado de Privacidade**: \`privacidade@kardap.com.br\`
• **Prazo de Resposta**: Respondemos a todas as solicitações formais em até 5 (cinco) dias úteis.`,
        },
      ],
    },
    termos: {
      badge: "CONTRATO DE SERVIÇO SAAS · TERMOS GERAIS",
      eyebrow: "REGRAS E CONDIÇÕES DE USO",
      title: "Termos de Uso da Plataforma",
      subtitle:
        "Condições jurídicas, direitos e obrigações para a utilização da solução de cardápio digital Kardap por estabelecimentos comerciais.",
      updated: "Versão 1.2 · Atualizada em 09 de outubro de 2026",
      summary: [
        {
          title: "15 Dias de Teste Grátis",
          desc: "Experimente a plataforma sem cartão de crédito e sem compromisso inicial.",
        },
        {
          title: "Sem Fidelidade Forçada",
          desc: "Cancele a assinatura do seu plano a qualquer momento pelo painel de controle.",
        },
        {
          title: "Seu Conteúdo é Seu",
          desc: "Fotos, marcas e vídeos dos seus pratos permanecem de sua total propriedade.",
        },
      ],
      sections: [
        {
          id: "aceitacao",
          num: "01",
          heading: "1. Aceitação dos Termos e Condições",
          body: `Bem-vindo ao Kardap. Ao criar uma conta, contratar um plano ou utilizar nossos serviços ("Serviço"), você ("Usuário", "Restaurante" ou "Cliente") concorda expressamente com estes Termos de Uso e com a nossa Política de Privacidade.

Estes termos constituem um contrato vinculante entre o Usuário e a plataforma Kardap. Se você estiver aceitando estes termos em nome de uma empresa ou estabelecimento comercial, você declara possuir autoridade jurídica para vinculá-lo a este contrato.`,
        },
        {
          id: "descricao-servico",
          num: "02",
          heading: "2. Descrição dos Serviços Kardap",
          body: `O Kardap é uma plataforma de Software como Serviço (SaaS) voltada para modernização do atendimento gastronômico. A plataforma oferece:

• **Editor de Cardápio Digital**: Criação, organização e atualização de produtos, categorias, preços, fotos e vídeos.
• **Gerador de QR Codes por Mesa**: Geração e exportação de QR Codes exclusivos para cada mesa do estabelecimento.
• **Central de Chamados em Tempo Real**: Painel interativo para receber e gerenciar chamados da mesa (solicitação de garçom ou pedido da conta).
• **Personalização de Marca & Relatórios**: Customização com logotipo e capa do estabelecimento, além de métricas operacionais.`,
        },
        {
          id: "cadastro-conta",
          num: "03",
          heading: "3. Cadastro, Credenciais e Segurança da Conta",
          body: `Para utilizar a plataforma Kardap, o Usuário concorda em:

1. **Fornecer Informações Verídicas**: Preencher os dados de cadastro com informações precisas, atualizadas e completas.
2. **Guarda de Senhas**: Manter o sigilo da sua senha de acesso. O Usuário é o único e exclusivo responsável por todas as atividades que ocorrerem em sua conta.
3. **Notificação de Uso Não Autorizado**: Informar imediatamente a equipe do Kardap caso identifique qualquer uso não autorizado de sua conta ou quebra de segurança.`,
        },
        {
          id: "planos-teste",
          num: "04",
          heading: "4. Período de Teste Grátis (15 Dias) e Assinaturas",
          body: `• **Período de Teste Gratuito (Trial)**: Novos usuários têm direito a 15 (quinze) dias de teste gratuito com acesso total às funcionalidades da plataforma. **Não é necessário cadastrar cartão de crédito para iniciar o teste.**
• **Planos de Assinatura**: Após o término do trial, para continuar utilizando o Serviço, o Usuário deverá optar por um dos planos disponíveis (Essencial ou Pro).
• **Faturamento Recorrente**: As assinaturas são renovadas automaticamente no período contratado (mensal ou anual).
• **Política de Cancelamento**: O cancelamento pode ser feito a qualquer momento diretamente pelo painel. O acesso ao sistema continuará disponível até o último dia do ciclo já pago, sem cobrança de taxas adicionais ou multas rescisórias.`,
        },
        {
          id: "propriedade-intelectual",
          num: "05",
          heading: "5. Propriedade Intelectual e Licença de Uso",
          body: `• **Propriedade da Plataforma**: O Kardap retém todos os direitos de propriedade intelectual sobre o software, marcas, logotipos, código-fonte, layout visual, algoritmos e documentação da plataforma.
• **Propriedade do Conteúdo do Restaurante**: O Usuário retém a propriedade integral de todas as marcas, fotos de pratos, descrições e vídeos enviados para a plataforma. O Usuário concede ao Kardap apenas uma licença limitada e não exclusiva para armazenar e exibir esse conteúdo no cardápio digital do estabelecimento durante a vigência da conta.`,
        },
        {
          id: "uso-aceitavel",
          num: "06",
          heading: "6. Vedações e Conduta do Usuário",
          body: `É expressamente proibido ao Usuário:

1. Publicar conteúdo ilícito, difamatório, discriminatório, obsceno ou que viole direitos de propriedade intelectual alheios.
2. Realizar engenharia reversa, descompilar ou tentar extrair o código-fonte da plataforma.
3. Utilizar scripts automatizados, robôs ou técnicas de scraping para coletar dados da plataforma.
4. Praticar qualquer ato que comprometa a estabilidade dos servidores ou cause sobrecarga não autorizada (ataques DDoS).`,
        },
        {
          id: "disponibilidade-sla",
          num: "07",
          heading: "7. Garantia de Nível de Serviço (SLA) e Responsabilidades",
          body: `Empenhamo-nos comercialmente para manter o Kardap disponível 24 horas por dia, 7 dias por semana, com uma taxa de disponibilidade (SLA) de **99,5%**. No entanto, o Kardap não será responsável por:

• Indisponibilidade provocada por falhas na conexão de internet do próprio restaurante ou dos clientes finais.
• Problemas decorrentes do mau uso do sistema, falhas de hardware nos dispositivos do estabelecimento ou caso fortuito e força maior.
• Danos indiretos, lucros cessantes ou perda de faturamento do estabelecimento.`,
        },
        {
          id: "alteracoes-foro",
          num: "08",
          heading: "8. Alterações nos Termos, Rescisão e Foro",
          body: `• **Atualizações dos Termos**: Reservamo-nos o direito de modificar estes Termos a qualquer momento. Alterações significativas serão notificadas por e-mail ou aviso no painel com pelo menos 15 dias de antecedência.
• **Rescisão por Violação**: O descumprimento destes termos poderá resultar na suspensão temporária ou no encerramento definitivo da conta do Usuário.
• **Legislação e Foro**: Este contrato é regido pelas leis da República Federativa do Brasil, ficando eleito o Foro da Comarca da sede do Kardap para dirimir eventuais disputas.`,
        },
      ],
    },
    cookies: {
      badge: "ARMAZENAMENTO LOCAL E COOKIES ESSENCIAIS",
      eyebrow: "TRANSPARÊNCIA TÉCNICA",
      title: "Política de Cookies e Armazenamento",
      subtitle:
        "Saiba como a plataforma Kardap utiliza o armazenamento no seu navegador para oferecer uma navegação rápida e segura.",
      updated: "Versão 1.2 · Atualizada em 09 de outubro de 2026",
      summary: [
        {
          title: "Apenas Itens Essenciais",
          desc: "Utilizamos armazenamento técnico estritamente necessário para manter o sistema rodando.",
        },
        {
          title: "Zero Rastreamento Comercial",
          desc: "Não utilizamos cookies de terceiros para vender anúncios ou rastrear seu comportamento.",
        },
        {
          title: "Controle Total no Navegador",
          desc: "Você pode limpar seus dados locais a qualquer momento nas configurações do seu browser.",
        },
      ],
      sections: [
        {
          id: "o-que-sao",
          num: "01",
          heading: "1. O que são Cookies e Local Storage?",
          body: `Cookies e LocalStorage são tecnologias padrão da web que permitem aos sites armazenar pequenas quantidades de dados diretamente no navegador do seu dispositivo (computador, tablet ou smartphone).

Esses recursos garantem que suas preferências de configuração permaneçam salvas entre acessos e evitam que você precise fazer login repetidamente ao alternar páginas.`,
        },
        {
          id: "chaves-utilizadas",
          num: "02",
          heading: "2. Chaves de Armazenamento Utilizadas pelo Kardap",
          body: `No Kardap, utilizamos primariamente o **LocalStorage** para manter a performance e a reatividade do painel em tempo real:

• \`kardap-session\`: Armazena o estado da sua sessão ativa no painel administrativo de forma segura.
• \`kardap-calls\`: Guarda temporariamente o histórico de chamados das mesas (como pedidos de conta ou solicitações de garçom) para que seu painel atualize instantaneamente sem perda de dados.
• \`kardap-brand\`: Registra as preferências de personalização da sua marca (logotipo e imagem de capa do restaurante).
• \`kardap-settings\`: Armazena opções de configuração rápida ativadas pelo estabelecimento (ex: sonorização de alertas).`,
        },
        {
          id: "como-gerenciar",
          num: "03",
          heading: "3. Como Gerenciar ou Excluir seus Dados Locais",
          body: `Como os dados do LocalStorage ficam gravados exclusivamente no seu dispositivo, você tem controle total para removê-los a qualquer momento:

1. **No Google Chrome**: Acesse *Configurações > Privacidade e Segurança > Remover dados de navegação*.
2. **No Mozilla Firefox**: Acesse *Configurações > Privacidade e Segurança > Cookies e dados de sites > Limpar dados*.
3. **No Apple Safari**: Acesse *Preferências > Privacidade > Gerenciar Dados de Sites*.

*Nota importante*: A remoção do LocalStorage encerrará sua sessão atual no painel e redefinirá os chamados simulados para o padrão de fábrica.`,
        },
      ],
    },
  } as const;

  const currentDoc = docs[type];

  // Filter sections by search
  const filteredSections = useMemo(() => {
    if (!search.trim()) return currentDoc.sections;
    const term = search.toLowerCase();
    return currentDoc.sections.filter(
      (s) =>
        s.heading.toLowerCase().includes(term) ||
        s.body.toLowerCase().includes(term)
    );
  }, [currentDoc, search]);

  const copyLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  return (
    <div className="legal-page-wrapper bg-[#F8F7F2] text-[#1D0B0D] min-h-screen flex flex-col justify-between">
      {/* Top sticky navigation bar */}
      <header className="legal-header sticky top-0 z-40 bg-[#F8F7F2]/90 backdrop-blur-md border-b border-[#DBE2DC] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Logo />
          <Link
            href="/"
            className="hidden sm:inline-flex items-center gap-2 text-xs font-semibold tracking-wider text-[#9E8800] hover:text-[#171717] transition-colors"
          >
            <ArrowLeft size={14} /> VOLTAR AO SITE
          </Link>
        </div>

        {/* Legal navigation tabs */}
        <div className="legal-tabs flex items-center gap-1 bg-[#E9DFD0]/60 p-1 rounded-full border border-[#DBE2DC]">
          <Link
            href="/privacidade"
            className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${
              type === "privacidade"
                ? "bg-[#F7EA48] text-[#171717] shadow-sm"
                : "text-[#1D0B0D] hover:text-[#9E8800]"
            }`}
          >
            Privacidade
          </Link>
          <Link
            href="/termos"
            className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${
              type === "termos"
                ? "bg-[#F7EA48] text-[#171717] shadow-sm"
                : "text-[#1D0B0D] hover:text-[#9E8800]"
            }`}
          >
            Termos de Uso
          </Link>
          <Link
            href="/cookies"
            className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${
              type === "cookies"
                ? "bg-[#F7EA48] text-[#171717] shadow-sm"
                : "text-[#1D0B0D] hover:text-[#9E8800]"
            }`}
          >
            Cookies
          </Link>
        </div>

        {/* Page Actions */}
        <div className="hidden lg:flex items-center gap-2">
          <button
            onClick={copyLink}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-[#DBE2DC] bg-white text-[#171717] hover:bg-[#F7EA48]/20 transition-all"
            title="Copiar link desta página"
          >
            {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
            {copied ? "Copiado!" : "Copiar Link"}
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-[#1D0B0D] bg-[#1D0B0D] text-[#F8F7F2] hover:bg-[#9E8800] transition-all"
            title="Imprimir ou salvar em PDF"
          >
            <Printer size={14} /> Imprimir PDF
          </button>
        </div>
      </header>

      {/* Main legal document container */}
      <main className="legal-main flex-1 max-w-7xl mx-auto w-full px-6 py-12">
        {/* Document Hero */}
        <div className="legal-hero mb-12 pb-8 border-b border-[#DBE2DC]">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F7EA48]/30 border border-[#9E8800]/30 text-[#9E8800] text-[11px] font-bold tracking-wider">
              <ShieldCheck size={14} /> {currentDoc.badge}
            </span>
            <span className="text-xs text-[#808988] font-medium">
              {currentDoc.updated}
            </span>
          </div>

          <h1 className="font-['Sora'] text-4xl sm:text-5xl font-semibold tracking-tight text-[#1D0B0D] mb-4">
            {currentDoc.title}
          </h1>

          <p className="text-lg text-[#515151] max-w-3xl leading-relaxed mb-8">
            {currentDoc.subtitle}
          </p>

          {/* Search bar inside legal document */}
          <div className="relative max-w-xl">
            <Search
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-[#808988]"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cláusulas ou tópicos neste documento..."
              className="w-full pl-11 pr-4 py-3 bg-white border border-[#DBE2DC] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#9E8800]/40 focus:border-[#9E8800] transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[#808988] hover:text-[#171717]"
              >
                Limpar
              </button>
            )}
          </div>
        </div>

        {/* Document Key Takeaways Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {currentDoc.summary.map((item, idx) => (
            <div
              key={idx}
              className="p-5 rounded-2xl bg-white border border-[#DBE2DC] shadow-sm flex flex-col gap-2"
            >
              <div className="flex items-center gap-2 text-[#9E8800] font-bold text-sm">
                <CheckCircle2 size={18} />
                <span>{item.title}</span>
              </div>
              <p className="text-xs text-[#515151] leading-relaxed">
                {item.desc}
              </p>
            </div>
          ))}
        </div>

        {/* Content Layout: Sticky Index + Main Document */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          {/* Table of Contents (TOC) Sidebar */}
          <aside className="lg:col-span-4 sticky top-24 space-y-6 hidden lg:block">
            <div className="p-6 rounded-2xl bg-white border border-[#DBE2DC] shadow-sm">
              <h3 className="font-['Sora'] text-xs font-bold tracking-wider text-[#9E8800] uppercase mb-4 flex items-center gap-2">
                <FileText size={16} /> Índice do Documento
              </h3>
              <nav className="space-y-2">
                {currentDoc.sections.map((sec) => (
                  <a
                    key={sec.id}
                    href={`#${sec.id}`}
                    className="block text-xs font-medium text-[#515151] hover:text-[#171717] hover:bg-[#F8F7F2] p-2 rounded-lg transition-colors truncate"
                  >
                    <span className="font-mono text-[#9E8800] mr-2">
                      {sec.num}
                    </span>
                    {sec.heading.replace(/^[0-9]+\.\s*/, "")}
                  </a>
                ))}
              </nav>
            </div>

            {/* Quick Contact Card */}
            <div className="p-6 rounded-2xl bg-[#1D0B0D] text-[#F8F7F2] shadow-sm">
              <div className="flex items-center gap-2 text-[#F7EA48] text-xs font-bold tracking-wider mb-2">
                <Lock size={16} /> CENTRAL DE PRIVACIDADE
              </div>
              <p className="text-xs text-[#C7C5BF] mb-4 leading-relaxed">
                Tem alguma dúvida específica ou precisa falar com nosso Encarregado de Proteção de Dados (DPO)?
              </p>
              <a
                href="mailto:privacidade@kardap.com.br"
                className="inline-flex items-center gap-2 text-xs font-bold text-[#171717] bg-[#F7EA48] px-4 py-2.5 rounded-xl hover:bg-[#E2D325] transition-all"
              >
                Falar com DPO <ExternalLink size={14} />
              </a>
            </div>
          </aside>

          {/* Main Document Sections */}
          <article className="lg:col-span-8 space-y-10">
            {filteredSections.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-2xl border border-[#DBE2DC]">
                <p className="text-sm text-[#808988]">
                  Nenhum tópico encontrado para a busca "{search}".
                </p>
                <button
                  onClick={() => setSearch("")}
                  className="mt-4 text-xs font-bold text-[#9E8800] underline"
                >
                  Ver todo o documento
                </button>
              </div>
            ) : (
              filteredSections.map((sec) => (
                <section
                  key={sec.id}
                  id={sec.id}
                  className="p-8 rounded-2xl bg-white border border-[#DBE2DC] shadow-sm space-y-4 scroll-mt-28 transition-all hover:border-[#9E8800]/40"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-bold text-[#9E8800] bg-[#F7EA48]/30 px-2.5 py-1 rounded-md">
                      {sec.num}
                    </span>
                    <h2 className="font-['Sora'] text-xl font-semibold text-[#1D0B0D]">
                      {sec.heading}
                    </h2>
                  </div>
                  <div className="text-sm text-[#333333] leading-relaxed whitespace-pre-line font-['DM_Sans'] space-y-3">
                    {sec.body}
                  </div>
                </section>
              ))
            )}

            {/* Document Feedback Footer */}
            <div className="p-6 rounded-2xl bg-[#E9DFD0]/50 border border-[#DBE2DC] flex flex-wrap items-center justify-between gap-4">
              <span className="text-xs font-medium text-[#515151]">
                Esta informação atendeu às suas dúvidas legais?
              </span>
              <div className="flex items-center gap-3">
                <a
                  href="mailto:suporte@kardap.com.br"
                  className="text-xs font-bold text-[#9E8800] hover:underline"
                >
                  Falar com o Suporte Jurídico
                </a>
              </div>
            </div>
          </article>
        </div>
      </main>

      {/* Footer */}
      <SiteFooter />
    </div>
  );
}

function Price({
  name,
  price,
  period = "/mês",
  features,
  featured = false,
}: {
  name: string;
  price?: string;
  period?: string;
  features: string[];
  featured?: boolean;
}) {
  return (
    <article className={"price " + (featured ? "featured" : "")}>
      <p>{featured ? "RECOMENDADO" : ""}</p>
      <h3>{name}</h3>
      {price && (
        <div className="price-amount my-3 flex items-baseline gap-1">
          <span className="price-currency text-sm font-semibold opacity-80">R$</span>
          <strong className="price-value font-['Sora'] text-4xl font-bold">{price}</strong>
          <span className="price-period text-xs opacity-75">{period}</span>
        </div>
      )}
      <ul>
        {features.map((x) => (
          <li key={x}>
            <Check size={15} />
            {x}
          </li>
        ))}
      </ul>
      <Link
        href="/criar-conta"
        className={
          featured
            ? btn
            : "border border-[#fcf9f0] px-4 py-3 text-xs font-semibold tracking-[.1em]"
        }
      >
        TESTAR GRATIS <ChevronRight size={15} />
      </Link>
    </article>
  );
}

function PhoneScreen() {
  return (
    <div className="phone-screen">
      <div className="hero-video-slot">
        <video src="/pizzavideo.mp4" autoPlay muted loop playsInline />
        <span>
          SEU VIDEO
          <br />
          AQUI
        </span>
      </div>
      <div className="phone-head">
        <span className="logo">
          PIZZARIA
          <br />
          DO JOAO
        </span>
        <span>07</span>
      </div>
      <p>BEM-VINDO!</p>
      <small>VOCE ESTA NA</small>
      <h3>MESA 07</h3>
      <div className="phone-actions">
        <button>
          VER CARDAPIO <ChevronRight size={15} />
        </button>
        <button>
          CHAMAR GARCOM <Bell size={15} />
        </button>
        <button>
          AVALIAR NO GOOGLE <Star size={15} />
        </button>
      </div>
    </div>
  );
}

function Auth({
  register,
  onLogin,
}: {
  register: boolean;
  onLogin: () => void;
}) {
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState("");
  const [resetState, setResetState] = useState<"" | "sending" | "sent">("");
  const formRef = useRef<HTMLFormElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [googleLoading, setGoogleLoading] = useState(false);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    const data = new FormData(e.currentTarget);
    if (register && data.get("senha") !== data.get("confirmarSenha")) {
      setError("As senhas precisam ser iguais.");
      return;
    }
    setLoading(true);
    setStage(register ? "CRIANDO SUA CONTA" : "ENTRANDO");
    try {
      if (register) {
        localStorage.removeItem("kardap-restaurant-id");
        localStorage.removeItem("kardap-restaurant-owner");
      }
      const email = String(data.get("email") || "").trim();
      const password = String(data.get("senha") || "");
      if (!isFirebaseConfigured) throw new Error("O login ainda não foi configurado neste ambiente.");
      const firebaseAuth = getFirebaseAuth();
      const credential = await withTimeout(
        register
          ? createUserWithEmailAndPassword(firebaseAuth, email, password)
          : signInWithEmailAndPassword(firebaseAuth, email, password),
        20000,
      );
      if (register) {
        const fullName = `${String(data.get("nome") || "").trim()} ${String(data.get("sobrenome") || "").trim()}`.trim();
        setStage("PREPARANDO SEU RESTAURANTE");
        if (fullName) await updateProfile(credential.user, { displayName: fullName }).catch(() => undefined);
        const token = await credential.user.getIdToken();
        // O acesso já foi criado no Auth. O provisionamento do restaurante
        // depende apenas das credenciais Admin do servidor; não pode bloquear
        // a tela de cadastro caso esse ambiente ainda não esteja configurado.
        try {
          const controller = new AbortController();
          const abort = setTimeout(() => controller.abort(), 15000);
          const response = await fetch("/api/restaurants", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ name: fullName ? `Restaurante de ${fullName}` : "Meu Restaurante" }),
            signal: controller.signal,
          }).finally(() => clearTimeout(abort));
          if (response.ok) {
            const { restaurantId } = await response.json();
            localStorage.setItem("kardap-restaurant-id", restaurantId);
            localStorage.setItem("kardap-restaurant-owner", credential.user.uid);
          } else {
            await ensureRestaurant(credential.user.uid, fullName);
          }
        } catch {
          // A conta já existe no Auth: se o provisionamento falhar aqui, o onboarding tenta de novo.
          await ensureRestaurant(credential.user.uid, fullName).catch(() => undefined);
        }
      }
      onLogin();
      if (register || !localStorage.getItem("kardap-restaurant-id")) {
        window.location.href = "/onboarding";
        return;
      }
      setLoading(false);
      setDone(true);
    } catch (authError) {
      setLoading(false);
      setStage("");
      setError(friendlyError(authError, "Não foi possível concluir o acesso. Tente de novo."));
    }
  };
  const resetPassword = async () => {
    const email = String(new FormData(formRef.current || undefined).get("email") || "").trim();
    setError("");
    if (!email) {
      setError("Digite seu e-mail acima e toque em “Esqueci minha senha” de novo.");
      formRef.current?.querySelector<HTMLInputElement>('input[name="email"]')?.focus();
      return;
    }
    setResetState("sending");
    try {
      await withTimeout(sendPasswordResetEmail(getFirebaseAuth(), email), 15000);
      setResetState("sent");
    } catch (err) {
      setResetState("");
      setError(friendlyError(err, "Não foi possível enviar o e-mail de recuperação. Tente de novo."));
    }
  };
  const signInWithGoogle = async () => {
    setError("");
    if (!isFirebaseConfigured) {
      setError("O login ainda não foi configurado neste ambiente.");
      return;
    }
    setGoogleLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(getFirebaseAuth(), provider);
      onLogin();
      if (!localStorage.getItem("kardap-restaurant-id")) {
        window.location.href = "/onboarding";
        return;
      }
      setDone(true);
    } catch (authError) {
      setError(friendlyError(authError, "Não foi possível entrar com Google. Tente de novo."));
    } finally {
      setGoogleLoading(false);
    }
  };
  return (
    <main className="auth auth-premium">
      <aside className="auth-photo">
        <div>
          <p className="eyebrow">KARDAP PARA RESTAURANTES</p>
          <h1>
            SEU RESTAURANTE,
            <br />
            <i>MAIS PERTO</i>
            <br />
            DO CLIENTE.
          </h1>
          <p>O atendimento que acontece antes, durante e depois do pedido.</p>
        </div>
      </aside>
      <section className="auth-form">
        <header>
          <Logo />
          <Link href="/" className="auth-back">
            VOLTAR AO SITE
          </Link>
        </header>
        <div className="form-wrap">
          <p className="eyebrow">
            {register ? "COMECE SEM CUSTO" : "ACESSO A PLATAFORMA"}
          </p>
          <h2>{register ? "Crie sua conta" : "Boas-vindas de volta"}</h2>
          <p className="auth-lead">
            {register
              ? "15 dias para descobrir uma nova forma de receber seus clientes."
              : "Entre para gerenciar seu cardapio, mesas e atendimento."}
          </p>
          {done ? (
            <div className="success">
              <div className="success-icon">
                <Check size={23} />
              </div>
              <h3>
                {register ? "Sua conta esta pronta." : "Acesso confirmado."}
              </h3>
              <p>
                {register
                  ? "Agora vamos preparar o seu restaurante."
                  : "Seu painel esta esperando por voce."}
              </p>
              <Link
                href={register ? "/onboarding" : "/dashboard"}
                className="auth-submit"
              >
                CONTINUAR <ChevronRight size={16} />
              </Link>
            </div>
          ) : (
            <form ref={formRef} onSubmit={submit} noValidate aria-busy={loading || undefined}>
              <fieldset disabled={loading || googleLoading} className="contents">
              {register && (
                <div className="form-row">
                  <AuthInput
                    label="Nome"
                    name="nome"
                    autoComplete="given-name"
                  />
                  <AuthInput
                    label="Sobrenome"
                    name="sobrenome"
                    autoComplete="family-name"
                  />
                </div>
              )}
              <AuthInput
                label="E-mail"
                name="email"
                type="email"
                autoComplete="email"
              />
              {register && (
                <AuthInput
                  label="Telefone"
                  name="telefone"
                  type="tel"
                  autoComplete="tel"
                />
              )}
              <label className="auth-field">
                Senha
                <div className="password-wrap">
                  <input
                    name="senha"
                    type={showPassword ? "text" : "password"}
                    minLength={8}
                    required
                    autoComplete={
                      register ? "new-password" : "current-password"
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={
                      showPassword ? "Ocultar senha" : "Mostrar senha"
                    }
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </label>
              {register && (
                <AuthInput
                  label="Confirmar senha"
                  name="confirmarSenha"
                  type={showPassword ? "text" : "password"}
                  minLength={8}
                  autoComplete="new-password"
                />
              )}
              {register && (
                <p className="password-help">Use pelo menos 8 caracteres.</p>
              )}
              {error && <p className="auth-error" role="alert">{error}</p>}
              {resetState === "sent" && (
                <p className="auth-info" role="status">Se houver uma conta com este e-mail, enviamos um link para criar uma nova senha. Confira também o spam.</p>
              )}
              <div className="form-options">
                <label>
                  <input required type="checkbox" />{" "}
                  {register
                    ? "Aceito os Termos de Uso e Politica de Privacidade."
                    : "Manter meu acesso nesta sessao"}
                </label>
                {!register && (
                  <button type="button" className="auth-link" onClick={resetPassword} disabled={resetState === "sending"}>
                    {resetState === "sending" ? "Enviando…" : "Esqueci minha senha"}
                  </button>
                )}
              </div>
              <button className="auth-submit" disabled={loading} type="submit">
                {loading ? (
                  <>
                    <LoaderCircle className="spin" size={16} aria-hidden /> {stage || "AGUARDE"}…
                  </>
                ) : (
                  <>
                    {register ? "CRIAR MINHA CONTA" : "ENTRAR"}{" "}
                    <ChevronRight size={16} />
                  </>
                )}
              </button>
              <div className="divider">OU</div>
              <button type="button" className="google" onClick={signInWithGoogle} disabled={googleLoading || loading}>
                {googleLoading ? <><LoaderCircle className="spin" size={16} aria-hidden /> AGUARDANDO O GOOGLE…</> : "CONTINUAR COM GOOGLE"}
              </button>
              </fieldset>
            </form>
          )}
          <p className="auth-switch">
            {register ? "Ja possui uma conta?" : "Ainda nao possui conta?"}{" "}
            <Link href={register ? "/login" : "/criar-conta"}>
              {register ? "Entrar" : "Criar conta"}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
function AuthInput({
  label,
  name,
  type = "text",
  autoComplete,
  minLength,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  minLength?: number;
}) {
  return (
    <label className="auth-field">
      {label}
      <input
        name={name}
        type={type}
        required
        autoComplete={autoComplete}
        minLength={minLength}
      />
    </label>
  );
}
function Field({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  isCurrency,
}: {
  label: string;
  type?: string;
  value?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  placeholder?: string;
  isCurrency?: boolean;
}) {
  const [internalVal, setInternalVal] = useState("R$ 0,00");

  const handleCurrencyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "");
    const num = Number(digits) / 100;
    const formatted = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(num);
    setInternalVal(formatted);
    if (onChange) {
      e.target.value = formatted;
      onChange(e);
    }
  };
  return (
    <label className="flex flex-col gap-1.5 w-full">
      <span className="text-[12px] font-bold tracking-[0.02em] text-[#515151] ml-1">
        {label}
      </span>
      <input
        type={isCurrency ? "tel" : type}
        required
        value={isCurrency ? (value !== undefined ? value : internalVal) : value}
        onChange={isCurrency ? handleCurrencyChange : onChange}
        placeholder={placeholder}
        className="w-full px-4 py-3 bg-[#fcf9f0] border border-[#d1c9bf] rounded-xl text-[#2a2b2f] text-[15px] outline-none focus:bg-white focus:border-[#2a2b2f] focus:ring-1 focus:ring-[#2a2b2f] transition-all shadow-sm placeholder:text-stone-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
    </label>
  );
}
function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("Restaurante");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [menuSlug, setMenuSlug] = useState("");
  const [logo, setLogo] = useState("");
  const [cover, setCover] = useState("");
  const [tableCount, setTableCount] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const suggestedSlug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 54);
  const draftCookieName = `kardap-onboarding-draft-${typeof window === "undefined" ? "new" : localStorage.getItem("kardap-restaurant-owner") || "new"}`;
  useEffect(() => {
    const value = document.cookie.split("; ").find((item) => item.startsWith(`${draftCookieName}=`))?.split("=")[1];
    if (value) {
      try {
        const draft = JSON.parse(decodeURIComponent(value));
        setStep(Number(draft.step) || 1);
        setName(draft.name || "");
        setKind(draft.kind || "Restaurante");
        setPhone(draft.phone || "");
        setEmail(draft.email || "");
        setMenuSlug(draft.menuSlug || "");
        setLogo(draft.logo || "");
        setCover(draft.cover || "");
        setTableCount(draft.tableCount || "");
      } catch {
        document.cookie = `${draftCookieName}=; Max-Age=0; Path=/; SameSite=Lax`;
      }
    }
    setDraftReady(true);
  }, [draftCookieName]);
  useEffect(() => {
    if (!draftReady) return;
    const draft = encodeURIComponent(JSON.stringify({ step, name, kind, phone, email, menuSlug, logo, cover, tableCount }));
    document.cookie = `${draftCookieName}=${draft}; Max-Age=${60 * 60 * 24 * 30}; Path=/; SameSite=Lax`;
  }, [draftReady, draftCookieName, step, name, kind, phone, email, menuSlug, logo, cover, tableCount]);
  const [provisionError, setProvisionError] = useState("");
  const [stage, setStage] = useState("");
  const [uploadingKind, setUploadingKind] = useState<"" | "logos" | "capas">("");
  const [uploadPct, setUploadPct] = useState(0);
  const provision = () => {
    const user = isFirebaseConfigured ? getFirebaseAuth().currentUser : null;
    if (!user || localStorage.getItem("kardap-restaurant-id")) return;
    setProvisioning(true);
    setProvisionError("");
    ensureRestaurant(user.uid, user.displayName)
      .catch((err) => setProvisionError(friendlyError(err, "Não foi possível preparar seu restaurante.")))
      .finally(() => setProvisioning(false));
  };
  useEffect(provision, []);
  const saveStep = async (nextStep: number, completed = false) => {
    if (step === 1 && name.trim().length < 2) {
      setError("Informe o nome do estabelecimento.");
      return;
    }
    if (step === 4 && (tableCount.trim() === "" || !Number.isInteger(Number(tableCount)) || Number(tableCount) < 0 || Number(tableCount) > 200)) {
      setError("Informe entre 0 e 200 mesas. Use 0 para delivery sem salão.");
      return;
    }
    setSaving(true);
    setError("");
    setStage("SALVANDO");
    try {
      const payload = {
        name: name.trim(),
        establishmentType: kind,
        businessPhone: phone,
        businessEmail: email,
        brand: { logo, cover },
        setup: { tableCount: Number(tableCount) || 0 },
        onboarding: { completed: false, currentStep: nextStep, updatedAt: new Date().toISOString() },
      };
      try {
        await saveRestaurant(payload);
      } catch (err) {
        // Etapas intermediárias ficam na fila local do Firestore; só a conclusão exige servidor.
        if (!(isQueued(err) && !completed)) throw err;
        setError("Internet instável: suas respostas foram guardadas neste aparelho e serão enviadas quando a conexão voltar.");
      }
      if (completed) {
        setStage("RESERVANDO SEU LINK");
        const slug = await reserveMenuSlug(menuSlug || name.trim());
        setStage("CRIANDO AS MESAS");
        await createInitialTables(Number(tableCount) || 0);
        setStage("FINALIZANDO");
        await saveRestaurant({ slug, onboarding: { ...payload.onboarding, completed: true, completedAt: new Date().toISOString() } });
        localStorage.setItem("kardap-restaurant-slug", slug);
        document.cookie = `${draftCookieName}=; Max-Age=0; Path=/; SameSite=Lax`;
        onComplete();
        location.href = "/dashboard";
        setStage("ABRINDO O PAINEL");
        return;
      } else setStep(nextStep);
    } catch (err) {
      setError(friendlyError(err, "Não foi possível salvar agora. Suas respostas continuam aqui; tente de novo."));
    }
    setSaving(false);
    setStage("");
  };
  const uploadImage = async (input: HTMLInputElement, kind: "logos" | "capas") => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    setSaving(true);
    setUploadingKind(kind);
    setUploadPct(0);
    setError("");
    try {
      const url = await uploadRestaurantImage(file, kind, setUploadPct);
      if (kind === "logos") setLogo(url);
      else setCover(url);
    } catch (uploadError) {
      setError(friendlyError(uploadError, "Não foi possível enviar a imagem. Tente de novo."));
    } finally {
      setSaving(false);
      setUploadingKind("");
    }
  };
  return (
    <main className="onboard">
      <header>
        <Logo />
        <span>ETAPA {step} DE 5</span>
      </header>
      <div className="progress">
        <i style={{ width: `${step * 20}%` }} />
      </div>
      <section className="onboard-body">
        {step === 1 && (
          <>
            <p className="eyebrow text-[#f7ea48]">BEM-VINDO AO KARDAP</p>
            <h1>VAMOS COMEÇAR.</h1>
            <p className="lead">Configure seu estabelecimento para começar a vender e atender melhor.</p>
            <Field
              label="Nome do estabelecimento"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Field
              label="Link do cardápio"
              value={menuSlug || suggestedSlug}
              onChange={(e) => setMenuSlug(e.target.value)}
              placeholder="meu-estabelecimento"
            />
            <p className="muted">Seu link será <b>/r/{menuSlug || suggestedSlug || "seu-estabelecimento"}</b>. Se já estiver em uso, criaremos uma variação disponível.</p>
            <label className="field">
              Tipo
              <select value={kind} onChange={(event) => setKind(event.target.value)}>
                <option>Restaurante</option>
                <option>Hamburgueria</option>
                <option>Pizzaria</option>
                <option>Bar</option>
              <option>Cafeteria</option>
              <option>Lanchonete</option>
              <option>Delivery</option>
              <option>Outro</option>
            </select>
          </label>
          <Field label="WhatsApp comercial" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(00) 00000-0000" />
          <Field label="E-mail comercial" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="contato@estabelecimento.com" />
          </>
        )}
        {step === 2 && (
          <>
            <h1>DEIXE COM A SUA CARA.</h1>
            <p className="lead onboard-intro">Adicione sua marca agora ou personalize depois no painel. Seus clientes verão isso no cardápio digital.</p>
            <div className="onboard-brand-grid">
              <label className="onboard-logo-upload">
                <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => uploadImage(event.currentTarget, "logos")} disabled={saving} />
                <span className="onboard-logo-preview">
                  {logo ? <img src={logo} alt="Prévia da logo" /> : <span>{name.trim().slice(0, 1).toUpperCase() || "K"}</span>}
                </span>
                <span aria-live="polite"><b>{uploadingKind === "logos" ? `Enviando… ${uploadPct}%` : logo ? "Trocar logo" : "Adicionar logo"}</b><small>PNG, JPG ou WebP · até 10 MB</small></span>
              </label>
              <label className="onboard-cover-upload" style={cover ? { backgroundImage: `linear-gradient(120deg, rgba(29,11,13,.15), rgba(29,11,13,.62)), url(${cover})` } : undefined}>
                <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => uploadImage(event.currentTarget, "capas")} disabled={saving} />
                <span className="onboard-cover-content" aria-live="polite"><b>{uploadingKind === "capas" ? `Enviando… ${uploadPct}%` : cover ? "Trocar imagem de capa" : "Adicionar imagem de capa"}</b><small>Opcional · aparece no topo do cardápio</small></span>
              </label>
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <p className="eyebrow text-[#f7ea48]">REPUTACAO</p>
            <h1>GOOGLE.</h1>
            <Field label="Link para avaliacao Google" />
            <p className="muted">Voce pode configurar isso depois.</p>
          </>
        )}
        {step === 4 && (
          <>
            <p className="eyebrow text-[#f7ea48]">O SALAO</p>
            <h1>SUAS MESAS.</h1>
            <Field label="Quantidade de mesas (0 a 200)" type="number" value={tableCount} onChange={(event) => setTableCount(event.target.value)} placeholder="Ex: 12" />
            <p className="muted">Você poderá gerar QR Codes e configurar as mesas no painel.</p>
          </>
        )}
        {step === 5 && (
          <>
            <p className="eyebrow text-[#f7ea48]">TUDO PRONTO</p>
            <h1>
              SEU RESTAURANTE
              <br />
              ESTA PRONTO.
            </h1>
            <p className="lead">
              Sua experiencia digital ja pode receber clientes.
            </p>
          </>
        )}
        <div className="onboard-actions">
          {provisionError && (
            <p className="auth-error" role="alert">
              {provisionError}{" "}
              <button type="button" className="auth-link" onClick={provision}>
                Tentar de novo
              </button>
            </p>
          )}
          {error && <p className="auth-error" role="alert">{error}</p>}
          {step > 1 && <button onClick={() => setStep((current) => current - 1)} className="skip" disabled={saving}>VOLTAR</button>}
          {step === 3 && (
            <button onClick={() => saveStep(4)} className="skip" disabled={saving}>
              PULAR POR AGORA
            </button>
          )}
          <button
            onClick={() => saveStep(Math.min(5, step + 1), step === 5)}
            className={btn}
            disabled={saving || provisioning || Boolean(provisionError)}
            aria-busy={saving || provisioning || undefined}
          >
            {provisioning ? "PREPARANDO SEU RESTAURANTE…" : uploadingKind ? `ENVIANDO IMAGEM… ${uploadPct}%` : saving ? `${stage || "SALVANDO"}…` : step === 5 ? "ACESSAR DASHBOARD" : "CONTINUAR"}{" "}
            <ChevronRight size={16} />
          </button>
        </div>
      </section>
    </main>
  );
}

function playCallTone() {
  try {
    const AudioContext =
      window.AudioContext ||
      (
        window as typeof window & {
          webkitAudioContext?: typeof window.AudioContext;
        }
      ).webkitAudioContext;
    const context = new AudioContext();
    [0, 0.18].forEach((delay) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = delay ? 880 : 660;
      gain.gain.setValueAtTime(0.0001, context.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(
        0.12,
        context.currentTime + delay + 0.01,
      );
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        context.currentTime + delay + 0.14,
      );
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(context.currentTime + delay);
      oscillator.stop(context.currentTime + delay + 0.15);
    });
    setTimeout(() => context.close(), 500);
  } catch {}
}

function WaiterPage({
  table,
  close,
  onConfirm,
}: {
  table: string;
  close: () => void;
  onConfirm: (type: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("Preciso de ajuda na mesa");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const options = [
    "Preciso de ajuda na mesa",
    "Quero fazer um pedido",
    "Tenho uma dúvida sobre o cardápio",
  ];

  const handleConfirm = async () => {
    setLoading(true);
    setError("");
    try {
      await onConfirm(reason);
      setSent(true);
    } catch (err) {
      setError(
        isTimeout(err)
          ? "O chamado não foi confirmado: a internet está muito lenta. Tente de novo ou chame alguém da equipe pessoalmente."
          : friendlyError(err, "Não conseguimos avisar a equipe. Tente de novo ou chame alguém pessoalmente."),
      );
    } finally {
      setLoading(false);
    }
  };

  if (sent)
    return (
      <div className="fixed inset-0 z-50 bg-[#fef9ef] flex flex-col items-center justify-center p-8 text-center" role="status">
        <div className="w-16 h-16 rounded-full bg-[#1f6b4a] text-white flex items-center justify-center mb-6">
          <Check size={30} strokeWidth={2.5} />
        </div>
        <h1 className="text-[2rem] leading-tight font-serif text-[#2a2b2f] mb-3">A equipe foi avisada.</h1>
        <p className="text-[#515151] max-w-xs mb-10">
          {table ? `Alguém vai até a mesa ${table} em instantes.` : "Alguém da equipe vai até você em instantes."}
        </p>
        <button onClick={close} className="w-full max-w-xs bg-[#2a2b2f] text-white py-4 rounded-full font-semibold text-[13px] tracking-[0.05em] active:scale-[0.98] transition">
          VOLTAR AO CARDÁPIO
        </button>
      </div>
    );

  return (
    <div className="fixed inset-0 z-50 bg-[#fef9ef] flex flex-col transition-all duration-300">
      <header className="flex justify-between items-center p-6 border-b border-stone-200">
        <span className="text-xs font-semibold tracking-[0.15em] text-stone-500">
          MESA {table}
        </span>
        <button
          onClick={close}
          className="p-2 rounded-full hover:bg-stone-200 transition-colors"
          aria-label="Fechar"
        >
          <X size={20} className="text-stone-700" />
        </button>
      </header>

      <main className="flex-1 p-6 flex flex-col max-w-lg mx-auto w-full">
        <div className="w-14 h-14 bg-orange-100 text-[#9E8800] rounded-full flex items-center justify-center mb-6">
          <Bell size={26} />
        </div>

        <h1 className="text-[2.5rem] leading-[1.05] font-serif text-[#2a2b2f] mb-4">
          Como podemos ajudar?
        </h1>
        <p className="text-[#515151] mb-10 leading-relaxed text-lg">
          Avise a equipe em poucos segundos. O chamado chega direto para o
          garçom com o número da sua mesa.
        </p>

        <div className="space-y-3 mb-8">
          {options.map((option) => (
            <button
              key={option}
              disabled={loading}
              onClick={() => setReason(option)}
              className={`w-full text-left flex justify-between items-center p-5 rounded-2xl border transition-all duration-200 ${
                reason === option
                  ? "border-[#2a2b2f] bg-white shadow-sm ring-1 ring-[#2a2b2f]"
                  : "border-stone-200 bg-transparent hover:border-stone-300"
              }`}
            >
              <span
                className={`text-[15px] ${reason === option ? "font-semibold text-[#2a2b2f]" : "text-[#515151]"}`}
              >
                {option}
              </span>
              <div
                className={`w-6 h-6 rounded-full border flex items-center justify-center transition-colors ${
                  reason === option
                    ? "border-[#2a2b2f] bg-[#2a2b2f] text-white"
                    : "border-stone-300"
                }`}
              >
                {reason === option && <Check size={14} strokeWidth={3} />}
              </div>
            </button>
          ))}
        </div>

        <div className="mt-auto pt-6 pb-4">
          {error && (
            <p role="alert" className="mb-4 rounded-2xl bg-[#fbe5e2] text-[#8a1c12] px-4 py-3 text-[14px] leading-snug">
              {error}
            </p>
          )}
          <button
            onClick={handleConfirm}
            disabled={loading}
            aria-busy={loading || undefined}
            className="w-full bg-[#2a2b2f] text-white py-4 rounded-full font-semibold text-[13px] tracking-[0.05em] flex justify-center items-center gap-2 hover:bg-black transition-colors disabled:opacity-70 active:scale-[0.98]"
          >
            {loading ? (
              <>
                <LoaderCircle size={18} className="animate-spin" /> AVISANDO A EQUIPE…
              </>
            ) : (
              <>
                <Bell size={18} /> {error ? "TENTAR DE NOVO" : "CHAMAR GARÇOM"}
              </>
            )}
          </button>
        </div>
      </main>
    </div>
  );
}

function PublicMenuState({ status, slow, onRetry }: { status: "loading" | "not-found" | "error"; slow: boolean; onRetry: () => void }) {
  if (status === "loading" && !slow)
    return (
      <div className="min-h-screen bg-[#fef9ef] px-6 pt-6" aria-busy="true" aria-label="Carregando cardápio">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3.5 mb-14">
            <span className="pm-skeleton w-11 h-11 rounded-full" />
            <span className="flex flex-col gap-2">
              <span className="pm-skeleton h-3.5 w-36 rounded" />
              <span className="pm-skeleton h-2.5 w-20 rounded" />
            </span>
          </div>
          <span className="pm-skeleton block h-14 w-3/4 rounded-xl mb-3" />
          <span className="pm-skeleton block h-14 w-1/2 rounded-xl mb-14" />
          <span className="pm-skeleton block h-16 w-full rounded-[20px] mb-3.5" />
          <div className="grid grid-cols-2 gap-3.5">
            <span className="pm-skeleton block h-24 rounded-[20px]" />
            <span className="pm-skeleton block h-24 rounded-[20px]" />
          </div>
        </div>
      </div>
    );
  const copy =
    status === "not-found"
      ? { title: "Cardápio não encontrado", text: "Este link não corresponde a nenhum restaurante ativo. Confira o QR Code ou peça ajuda à equipe." }
      : status === "error"
        ? { title: "Não foi possível abrir o cardápio", text: "Verifique sua conexão e tente de novo. Se continuar, peça o cardápio à equipe." }
        : { title: "A conexão está lenta", text: "Ainda estamos carregando o cardápio. Você pode esperar mais um pouco ou tentar de novo." };
  return (
    <div className="min-h-screen bg-[#fef9ef] flex flex-col items-center justify-center p-8 text-center text-[#2a2b2f]" role={status === "error" ? "alert" : "status"}>
      {status === "loading" && <LoaderCircle className="animate-spin text-[#808988] mb-6" size={28} aria-hidden />}
      <h1 className="text-[1.9rem] leading-tight font-serif mb-3">{copy.title}</h1>
      <p className="text-[#515151] max-w-sm mb-8">{copy.text}</p>
      {status !== "not-found" && (
        <button onClick={onRetry} className="bg-[#2a2b2f] text-white px-8 py-4 rounded-full font-semibold text-[13px] tracking-[0.05em] active:scale-[0.98] transition">
          TENTAR DE NOVO
        </button>
      )}
    </div>
  );
}

function PublicMenu({
  status,
  slow,
  onRetry,
  productsLoaded,
  restaurantId,
  table,
  brand,
  settings,
  foods: menuFoods,
  restaurantName,
}: {
  status: "loading" | "ready" | "not-found" | "error";
  slow: boolean;
  onRetry: () => void;
  productsLoaded: boolean;
  restaurantId: string;
  table: string;
  notify: (x: string, tone?: "success" | "error") => void;
  brand: Brand;
  settings: RestaurantSettings;
  foods: any[];
  restaurantName: string;
}) {
  const [menu, setMenu] = useState(false);
  const [waiter, setWaiter] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [category, setCategory] = useState("TODOS");
  const [search, setSearch] = useState("");
  const reelRef = useRef<HTMLDivElement>(null);

  const action = async (type: string) => {
    if (!restaurantId) throw new Error("Este cardápio ainda não terminou de carregar. Tente de novo em instantes.");
    await addPublicCall(restaurantId, { table: table || "Sem mesa identificada", type });
    playCallTone();
  };
  const categoryChips = ["TODOS", ...Array.from(new Set(menuFoods.map((f) => String(f.category || "").toUpperCase()).filter(Boolean)))];

  const filteredFoods = menuFoods.filter((f) => {
    const isCategoryMatch =
      category === "TODOS" || String(f.category || "").toUpperCase() === category;
    const isSearchMatch =
      !search || f.name.toLowerCase().includes(search.toLowerCase());
    return isCategoryMatch && isSearchMatch;
  });

  useEffect(() => {
    if (selected && reelRef.current) {
      const idx = filteredFoods.findIndex((f) => f.name === selected.name);
      if (idx !== -1 && reelRef.current.children[idx]) {
        reelRef.current.children[idx].scrollIntoView({ behavior: "instant" });
      }
    }
  }, [selected, filteredFoods]);

  if (status !== "ready")
    return <PublicMenuState status={status} slow={slow} onRetry={onRetry} />;

  return (
    <div className="min-h-screen bg-[#fef9ef] font-sans text-[#2a2b2f] selection:bg-orange-200 pb-20">
      <header className="sticky top-0 z-40 bg-[#fef9ef]/85 backdrop-blur-md border-b border-[#d1c9bf]/60 transition-all">
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 bg-white rounded-full border border-[#d1c9bf] overflow-hidden flex items-center justify-center shadow-sm">
              {brand.logo ? (
                <img
                  src={brand.logo}
                  alt="Logo"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="font-serif text-[15px] text-[#2a2b2f]">
                  {(restaurantName.trim()[0] || "K").toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex flex-col">
              <span className="text-[14px] font-bold tracking-tight">
                {restaurantName || "SEU ESTABELECIMENTO"}
              </span>
              <span className="text-[10px] uppercase tracking-[0.1em] text-[#808988]">
                {table ? `Mesa ${table}` : "Cardápio digital"}
              </span>
            </div>
          </div>
          {menu && settings.waiter && (
            <button
              onClick={() => setWaiter(true)}
              className="w-11 h-11 flex items-center justify-center rounded-full bg-white border border-[#d1c9bf] hover:bg-[#f5eee1] transition-colors text-[#9E8800] shadow-sm"
              aria-label="Chamar garçom"
            >
              <Bell size={19} />
            </button>
          )}
        </div>
      </header>

      {waiter && (
        <WaiterPage
          table={table}
          close={() => setWaiter(false)}
          onConfirm={action}
        />
      )}

      <main className="max-w-3xl mx-auto w-full">
        {!menu && !waiter ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {brand.cover && (
              <div className="w-full h-72 md:h-80 bg-[#d1c9bf] relative overflow-hidden">
                <img
                  src={brand.cover}
                  alt="Cover"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#fef9ef] from-5% via-[#fef9ef]/60 to-transparent"></div>
                <div className="absolute bottom-0 left-0 right-0 h-4 bg-[#fef9ef]"></div>
              </div>
            )}
            <div
              className={`px-6 ${brand.cover ? "-mt-16 relative z-10" : "pt-14"}`}
            >
              <span className="text-[10px] font-bold tracking-[0.18em] text-[#9E8800] mb-5 block">
                BEM-VINDO À CASA
              </span>
              <h1 className="text-[3.4rem] md:text-7xl font-serif text-[#2a2b2f] leading-[0.98] mb-10">
                Que bom
                <br />
                ter <i className="italic font-light text-[#515151]">você</i>
                <br />
                aqui.
              </h1>

              <div className="flex flex-col gap-3.5 mt-12">
                <button
                  onClick={() => setMenu(true)}
                  className="w-full group flex justify-between items-center p-5 bg-[#F7EA48] text-[#171717] rounded-[20px] transition-all hover:bg-[#E2D325] shadow-md shadow-[#F7EA48]/20"
                >
                  <span className="font-semibold text-[13px] tracking-[0.05em]">
                    VER CARDÁPIO
                  </span>
                  <ChevronRight
                    size={18}
                    className="group-hover:translate-x-1 transition-transform"
                  />
                </button>

                {(settings.waiter || (settings.google && settings.googleReviewUrl)) && (
                  <div className="grid grid-cols-2 gap-3.5">
                    {settings.waiter && (
                      <button
                        onClick={() => setWaiter(true)}
                        className={`group flex flex-col justify-center items-center gap-2.5 p-4 bg-white border border-[#d1c9bf] text-[#2a2b2f] rounded-[20px] transition-all hover:border-[#808988] hover:bg-[#f5eee1] ${!(settings.google && settings.googleReviewUrl) ? "col-span-2 flex-row justify-between px-5" : ""}`}
                      >
                        <Bell
                          size={22}
                          className="text-[#808988] group-hover:text-[#9E8800] transition-colors"
                        />
                        <span className="font-semibold text-[11px] tracking-[0.05em] text-center uppercase">
                          Chamar Garçom
                        </span>
                      </button>
                    )}

                    {settings.google && settings.googleReviewUrl && (
                      <a
                        target="_blank"
                        rel="noreferrer"
                        href={settings.googleReviewUrl}
                        className={`group flex flex-col justify-center items-center gap-2.5 p-4 bg-white border border-[#d1c9bf] text-[#2a2b2f] rounded-[20px] transition-all hover:border-[#808988] hover:bg-[#f5eee1] ${!settings.waiter ? "col-span-2 flex-row justify-between px-5" : ""}`}
                      >
                        <Star
                          size={22}
                          className="text-[#808988] group-hover:text-amber-500 transition-colors"
                        />
                        <span className="font-semibold text-[11px] tracking-[0.05em] text-center uppercase">
                          Avaliar
                        </span>
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : menu && !waiter ? (
          <div className="animate-in fade-in duration-500 flex flex-col min-h-screen bg-[#fef9ef]">
            <div className="px-5 pt-8 pb-4 sticky top-0 z-30 bg-[#fef9ef]/90 backdrop-blur-lg border-b border-[#d1c9bf]/40">
              <div className="flex items-center justify-between mb-6">
                <button
                  onClick={() => setMenu(false)}
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-white border border-[#d1c9bf] text-[#2a2b2f] hover:bg-stone-100 transition-colors active:scale-95"
                  aria-label="Voltar"
                >
                  <ChevronLeft size={22} />
                </button>
                <span className="text-[10px] font-bold tracking-[0.2em] text-[#9E8800] uppercase">
                  Cardápio
                </span>
                <div className="w-10" /> {/* Spacer for centering */}
              </div>

              <div className="relative">
                <Search
                  size={18}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-[#808988]"
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar no cardápio..."
                  className="w-full bg-white border border-[#d1c9bf] rounded-full py-3.5 pl-11 pr-5 text-[14px] outline-none focus:border-[#2a2b2f] focus:ring-1 focus:ring-[#2a2b2f] transition-all shadow-sm placeholder:text-[#808988]"
                />
              </div>
            </div>

            <div className="flex-1 px-5 pt-4 pb-12">
              <h1 className="text-[2.6rem] font-serif text-[#2a2b2f] leading-[1.05] mb-8">
                O que vai ser
                <br />
                <i className="italic text-[#515151] font-light">hoje?</i>
              </h1>

              <div
                className="flex gap-2.5 overflow-x-auto pb-5 mb-2 -mx-5 px-5 snap-x snap-mandatory scrollbar-hide"
                style={{ scrollbarWidth: "none" }}
              >
                {categoryChips.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={`snap-start whitespace-nowrap px-5 py-2.5 rounded-full text-[11px] font-bold tracking-[0.05em] transition-all active:scale-95 ${
                      category === cat
                        ? "bg-[#2a2b2f] text-white shadow-md shadow-[#2a2b2f]/20"
                        : "bg-white border border-[#d1c9bf] text-[#515151] hover:bg-[#f5eee1]"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="space-y-4">
                {filteredFoods.map((f, i) => (
                  <button
                    key={f.name}
                    onClick={() => setSelected(f)}
                    className="w-full flex gap-4 p-3 bg-white border border-[#d1c9bf] rounded-[24px] shadow-sm hover:shadow-md hover:border-[#808988] transition-all text-left group active:scale-[0.98] animate-in fade-in slide-in-from-bottom-4"
                    style={{
                      animationDelay: `${i * 75}ms`,
                      animationFillMode: "both",
                    }}
                  >
                    <div className="w-[104px] h-[104px] shrink-0 rounded-[18px] overflow-hidden relative bg-[#f5eee1]">
                      {"videoUrl" in f && f.videoUrl ? (
                        <video
                          src={f.videoUrl}
                          autoPlay
                          loop
                          muted
                          playsInline
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out"
                        />
                      ) : (
                        <img
                          src={f.image}
                          alt={f.name}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out"
                          loading="lazy"
                        />
                      )}
                    </div>
                    <div className="flex flex-col justify-center py-1 flex-1 pr-1">
                      {"videoUrl" in f && f.videoUrl && (
                        <span className="flex items-center gap-1.5 text-[9px] font-bold tracking-[0.1em] text-[#9E8800] bg-[#F7EA48]/10 w-fit px-2 py-0.5 rounded-md mb-2">
                          <Play size={10} className="fill-[#F7EA48]" /> VÍDEO
                        </span>
                      )}
                      <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#808988] mb-1">
                        {f.category}
                      </span>
                      <h3 className="text-[16px] font-bold text-[#2a2b2f] leading-snug mb-1.5 line-clamp-2">
                        {f.name}
                      </h3>
                      <span className="text-[14px] font-bold text-[#9E8800] mt-auto">
                        R$ {f.price}
                      </span>
                    </div>
                    <div className="shrink-0 flex items-center justify-center pr-2">
                      <div className="w-8 h-8 rounded-full bg-[#fef9ef] flex items-center justify-center text-[#808988] group-hover:bg-[#2a2b2f] group-hover:text-white transition-colors">
                        <ChevronRight size={16} strokeWidth={2.5} />
                      </div>
                    </div>
                  </button>
                ))}

                {!productsLoaded &&
                  Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex gap-4 p-3 bg-white border border-[#d1c9bf] rounded-[24px]" aria-hidden>
                      <span className="pm-skeleton w-[104px] h-[104px] rounded-[18px] shrink-0" />
                      <span className="flex-1 flex flex-col gap-2 justify-center">
                        <span className="pm-skeleton h-3 w-16 rounded" />
                        <span className="pm-skeleton h-4 w-3/4 rounded" />
                        <span className="pm-skeleton h-4 w-20 rounded" />
                      </span>
                    </div>
                  ))}
                {productsLoaded && menuFoods.length === 0 && (
                  <div className="text-center py-20">
                    <h3 className="text-[17px] font-bold text-[#2a2b2f] mb-1">O cardápio está sendo preparado</h3>
                    <p className="text-[#808988] text-[14px]">Ainda não há pratos publicados. Peça o cardápio à equipe.</p>
                  </div>
                )}
                {productsLoaded && menuFoods.length > 0 && filteredFoods.length === 0 && (
                  <div className="text-center py-20 animate-in fade-in">
                    <div className="w-16 h-16 bg-[#d1c9bf]/30 rounded-full flex items-center justify-center mx-auto mb-4 text-[#808988]">
                      <Search size={24} />
                    </div>
                    <h3 className="text-[17px] font-bold text-[#2a2b2f] mb-1">
                      Nada encontrado
                    </h3>
                    <p className="text-[#808988] text-[14px]">
                      Tente buscar por outro termo.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </main>

      {selected && (
        <div className="fixed inset-0 z-50 bg-black animate-in fade-in duration-300">
          <button
            onClick={() => setSelected(null)}
            className="absolute top-6 left-6 w-11 h-11 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-black/60 transition-colors z-[60]"
          >
            <ChevronLeft size={24} />
          </button>

          <div
            ref={reelRef}
            className="w-full h-full overflow-y-auto snap-y snap-mandatory scrollbar-hide"
            style={{ scrollbarWidth: "none" }}
          >
            {filteredFoods.map((f) => (
              <div
                key={f.name}
                className="w-full h-full snap-start relative bg-[#1d0b0d] flex flex-col justify-end"
              >
                {"videoUrl" in f && f.videoUrl ? (
                  <video
                    src={f.videoUrl}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="absolute inset-0 w-full h-full object-cover opacity-85"
                  />
                ) : (
                  <img
                    src={f.image}
                    alt={f.name}
                    className="absolute inset-0 w-full h-full object-cover opacity-85"
                  />
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-black/10 pointer-events-none"></div>

                <div className="relative z-10 p-6 pb-14 w-full max-w-2xl mx-auto flex flex-col justify-end h-full">
                  <div className="mb-4 flex items-center gap-2">
                    <span className="inline-block px-3 py-1.5 rounded-full bg-white/20 backdrop-blur-md text-white text-[10px] font-bold tracking-[0.1em] uppercase">
                      {f.category}
                    </span>
                    {"videoUrl" in f && f.videoUrl && (
                      <span className="inline-block px-3 py-1.5 rounded-full bg-[#F7EA48] text-[#171717] text-[10px] font-bold tracking-[0.1em] uppercase flex items-center gap-1">
                        <Play size={10} className="fill-[#171717]" /> VÍDEO
                      </span>
                    )}
                  </div>

                  <h2 className="text-[2.8rem] font-serif text-white leading-[1.05] mb-3">
                    {f.name}
                  </h2>
                  <p className="text-white/80 text-[16px] leading-relaxed mb-6 line-clamp-4">
                    Uma deliciosa opção de {f.category.toLowerCase()}, preparada
                    com os melhores ingredientes selecionados pelo chef para
                    proporcionar uma experiência única. Conheça nossos produtos
                    e surpreenda-se.
                  </p>

                  <div className="flex items-center justify-between">
                    <span className="text-[28px] font-bold text-white">
                      R$ {f.price}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
