"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { QueryDocumentSnapshot } from "firebase/firestore";
import { RotateCw } from "lucide-react";
import {
  fetchChamadosPage,
  findRestaurantByOwner,
  saveRestaurant,
  updateChamadoStatus,
  watchChamados,
  watchPublicRestaurant,
  watchPublicRestaurantCategories,
  watchPublicRestaurantProducts,
  watchPublicTable,
  watchRestaurant,
  watchRestaurantCategories,
  watchRestaurantProducts,
  watchRestaurantTables,
  type ChamadoDoc,
} from "@/lib/restaurant-db";
import { friendlyError, isTimeout } from "@/lib/async";
import { isFirebaseConfigured } from "@/lib/firebase";
import { Button, SpeedLoader } from "@/components/ui/primitives";
import { Toaster, type ToastAction, type ToastState } from "@/components/ui/toast";
import { DashboardSkeleton } from "@/components/dashboard/skeleton";
import { MenuSkeleton } from "@/components/menu/menu-states";
import { BackToTop } from "@/components/site/back-to-top";
import type { Brand, CallStatus, DataLoaded, LoadErrors, RestaurantSettings } from "@/components/dashboard/types";
import type { PublicCategory } from "@/components/menu/public-menu";
import { canAccessFeature, effectiveSubscription } from "@/lib/cakto/access";
import { readPalette } from "@/lib/palette";
import type { AccountInfo } from "@/components/dashboard/types";

/* Cada tela carrega só o próprio código: quem abre o cardápio pelo QR não baixa o painel. */
const Dashboard = dynamic(() => import("@/components/dashboard/dashboard"), { loading: () => <DashboardSkeleton /> });
const AuthPage = dynamic(() => import("@/components/auth/auth-page"), { loading: () => <PanelLoading /> });
const PublicMenu = dynamic(() => import("@/components/menu/public-menu"), { loading: () => <MenuSkeleton /> });
const Onboarding = dynamic(() => import("@/components/site/onboarding"), { loading: () => <PanelLoading /> });
const LegalPage = dynamic(() => import("@/components/site/legal-page"), { loading: () => <PanelLoading /> });
const AdminPanel = dynamic(() => import("@/components/admin/admin-panel"), { loading: () => <PanelLoading /> });
const PlansPage = dynamic(() => import("@/components/site/plans-page"), { loading: () => <PanelLoading /> });

const defaultBrand: Brand = { logo: "", cover: "", palette: null, customPalette: null };

/** Marca vinda do Firestore ou do aparelho: só strings nas imagens e paleta validada (cores #rrggbb). */
function normalizeBrand(raw: unknown): Brand {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    logo: typeof b.logo === "string" ? b.logo : "",
    cover: typeof b.cover === "string" ? b.cover : "",
    palette: readPalette(b.palette),
    customPalette: readPalette(b.customPalette),
  };
}
const defaultSettings: RestaurantSettings = {
  waiter: true,
  bill: true,
  google: true,
  sound: false,
  googleReviewUrl: "",
};
const LEGAL_PATHS = ["/privacidade", "/termos", "/cookies"];
const isPublicPath = (path: string) => path.startsWith("/r/");
const isPanelPath = (path: string) => path.startsWith("/dashboard") || path === "/onboarding";
const isAuthPath = (path: string) => path === "/login" || path === "/criar-conta";
const isAdminPath = (path: string) => path === "/admin" || path.startsWith("/admin/");

type PublicRestaurant = { id: string; name: string; brand: Brand; settings: RestaurantSettings; billAllowed: boolean; suspended: boolean };
const emptyPublicRestaurant: PublicRestaurant = { id: "", name: "", brand: defaultBrand, settings: defaultSettings, billAllowed: false, suspended: false };
const emptyAccount: AccountInfo = { subscription: null, createdAt: null, suspended: false, suspendedReason: "" };

export default function App() {
  const path = usePathname();
  const query = useSearchParams();
  const router = useRouter();
  const inPanel = isPanelPath(path);
  // O SDK de login só carrega onde há sessão: painel, login e administração (não no cardápio público).
  const needsAuth = inPanel || isAuthPath(path) || isAdminPath(path);

  // Chamados legados (array no documento restaurante, somente leitura após migração)
  const [legacyCalls, setLegacyCalls] = useState<{ table: string; type: string; status: string; time: string }[]>([]);
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
  const [account, setAccount] = useState<AccountInfo>(emptyAccount);
  const [menuFoods, setMenuFoods] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [tables, setTables] = useState<string[]>([]);
  const [pendingTables, setPendingTables] = useState<string[]>([]);
  const [tableTokens, setTableTokens] = useState<Record<string, string>>({});
  const [storageReady, setStorageReady] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  const [restaurantLoaded, setRestaurantLoaded] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [restaurantError, setRestaurantError] = useState("");
  const [slowLoad, setSlowLoad] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [loadErrors, setLoadErrors] = useState<LoadErrors>({});
  const [loaded, setLoaded] = useState<DataLoaded>({ products: false, categories: false, tables: false });

  // Cardápio público: estado próprio, para o dono logado ver exatamente o que o cliente vê.
  const [publicRestaurant, setPublicRestaurant] = useState<PublicRestaurant>(emptyPublicRestaurant);
  const [publicFoods, setPublicFoods] = useState<any[]>([]);
  const [publicCategories, setPublicCategories] = useState<PublicCategory[] | null | undefined>(undefined);
  const [publicTableName, setPublicTableName] = useState("");
  const [publicStatus, setPublicStatus] = useState<"loading" | "ready" | "not-found" | "error">("loading");
  const [publicProductsLoaded, setPublicProductsLoaded] = useState(false);
  const [publicSlow, setPublicSlow] = useState(false);

  const lastRemoteState = useRef<Record<string, string>>({});
  // Último valor confirmado pelo servidor: usado para desfazer mudanças otimistas que falharem.
  const confirmed = useRef<{ calls?: any[]; brand?: Brand; settings?: RestaurantSettings }>({});
  const firstAuthEvent = useRef(true);

  const markLoaded = (key: keyof DataLoaded) => setLoaded((current) => (current[key] ? current : { ...current, [key]: true }));
  const retry = () => {
    setRestaurantError("");
    setSlowLoad(false);
    setLoadErrors({});
    setLoaded({ products: false, categories: false, tables: false });
    setPublicStatus("loading");
    setPublicSlow(false);
    setPublicCategories(undefined);
    setRetryKey((k) => k + 1);
  };

  const [toast, setToast] = useState<ToastState>(null);
  const toastId = useRef(0);
  const notify = useCallback((message: string, tone: "success" | "error" = "success", action?: ToastAction) => {
    toastId.current += 1;
    setToast({ id: toastId.current, message, tone, action });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);

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
    setStorageReady(true);
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "kardap-calls" && e.newValue) setLegacyCalls(JSON.parse(e.newValue));
      if (e.key === "kardap-brand" && e.newValue) setBrand(normalizeBrand(JSON.parse(e.newValue)));
      if (e.key === "kardap-settings" && e.newValue) setSettings({ ...defaultSettings, ...JSON.parse(e.newValue) });
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  // Sincronização e persistência contínua da sessão do usuário com Firebase Auth
  useEffect(() => {
    if (!isFirebaseConfigured || !needsAuth) return;
    let alive = true;
    let unsubscribe: (() => void) | undefined;
    Promise.all([import("firebase/auth"), import("@/lib/auth")])
      .then(([{ onAuthStateChanged }, { getFirebaseAuth }]) => {
        if (!alive) return;
        unsubscribe = onAuthStateChanged(getFirebaseAuth(), async (user) => {
          if (!alive) return;
          if (user) {
            const cachedUserId = localStorage.getItem("kardap-restaurant-owner");
            if (cachedUserId && cachedUserId !== user.uid) localStorage.removeItem("kardap-restaurant-id");
            localStorage.setItem("kardap-restaurant-owner", user.uid);

            if (!localStorage.getItem("kardap-restaurant-id")) {
              const found = await findRestaurantByOwner(user.uid);
              if (found && isAuthPath(window.location.pathname)) {
                if (found.onboardingCompleted) router.replace("/dashboard");
                else router.replace("/onboarding");
              }
            } else if (firstAuthEvent.current && isAuthPath(window.location.pathname)) {
              firstAuthEvent.current = false;
              router.replace("/dashboard");
            }
          } else {
            setRestaurantLoaded(false);
          }
          firstAuthEvent.current = false;
          setSession(Boolean(user));
          setAuthReady(true);
        });
      })
      .catch(() => {
        if (alive) setAuthReady(true);
      });
    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, [needsAuth, router]);

  const ownerData = session && inPanel;

  useEffect(() => {
    if (!ownerData) return;
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
            const next = normalizeBrand(data.brand);
            lastRemoteState.current.brand = JSON.stringify(next);
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
          setAccount({
            subscription: (data.subscription as AccountInfo["subscription"]) || null,
            createdAt: data.createdAt ?? null,
            suspended: data.status === "suspended",
            suspendedReason: typeof data.suspendedReason === "string" ? data.suspendedReason : "",
          });
        }
        setRestaurantLoaded(true);
        setCloudReady(true);
      },
      (error) => setRestaurantError(friendlyError(error, "Não foi possível carregar os dados do seu restaurante.")),
    );
    return stop;
  }, [ownerData, retryKey]);

  useEffect(() => {
    setSlowLoad(false);
    if (!ownerData || restaurantLoaded) return;
    const timer = setTimeout(() => setSlowLoad(true), 9000);
    return () => clearTimeout(timer);
  }, [ownerData, restaurantLoaded, retryKey]);

  useEffect(() => {
    if (!isPublicPath(path)) return;
    const slug = path.split("/")[2];
    if (!slug) return;
    setPublicStatus("loading");
    setPublicProductsLoaded(false);
    setPublicSlow(false);
    const slowTimer = setTimeout(() => setPublicSlow(true), 9000);
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
        setPublicSlow(false);
        setPublicStatus("ready");
        setPublicRestaurant({
          id: data.id,
          name: typeof data.name === "string" ? data.name : "",
          brand: normalizeBrand(data.brand),
          settings: { ...defaultSettings, ...((data.settings as RestaurantSettings | undefined) || {}) },
          // "Pedir a conta" é recurso do Pro (e do período de teste), conforme lib/cakto/plans.ts.
          billAllowed: canAccessFeature(effectiveSubscription(data.subscription as any, data.createdAt), "bill_request"),
          suspended: data.status === "suspended",
        });
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

  const publicId = publicRestaurant.id;
  useEffect(() => {
    const token = query.get("mesa");
    if (!isPublicPath(path) || !publicId || !token) {
      setPublicTableName("");
      return;
    }
    return watchPublicTable(
      publicId,
      token,
      (table) => setPublicTableName(table?.name || ""),
      () => setPublicTableName(""),
    );
  }, [path, publicId, query]);

  useEffect(() => {
    if (!isPublicPath(path) || !publicId) return;
    return watchPublicRestaurantProducts(
      publicId,
      (items, meta) => {
        if (meta.fromCache && !items.length) return;
        setPublicFoods(items);
        setPublicProductsLoaded(true);
      },
      () => setPublicStatus("error"),
    );
  }, [path, publicId, retryKey]);

  useEffect(() => {
    if (!isPublicPath(path) || !publicId) return;
    setPublicCategories(undefined);
    // Se as regras do Firestore não liberarem a leitura, o cardápio volta a agrupar pelo nome salvo no produto.
    return watchPublicRestaurantCategories(
      publicId,
      (items) => setPublicCategories(items),
      () => setPublicCategories(null),
    );
  }, [path, publicId, retryKey]);

  useEffect(() => {
    if (!ownerData) return;
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
  }, [ownerData, retryKey]);

  useEffect(() => {
    if (!ownerData) return;
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
  }, [ownerData, retryKey]);

  useEffect(() => {
    if (!ownerData) return;
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
  }, [ownerData, retryKey]);

  useEffect(() => {
    if (!ownerData) return;
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
  }, [ownerData, retryKey]);

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
    const subs = subCalls.map((c) => ({ _key: `sub:${c.id}`, _source: "sub" as const, _id: c.id, table: c.table, type: c.type, status: c.status, time: "", createdAt: c.createdAt }));
    const legacy = legacyCalls.map((c, idx) => ({ _key: `legacy:${idx}`, _source: "legacy" as const, _id: String(idx), table: c.table, type: c.type, status: c.status, time: c.time, createdAt: "" }));
    return [...subs, ...legacy];
  }, [subCalls, legacyCalls]);

  const advanceCall = useCallback(
    (key: string, nextStatus: CallStatus) => {
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
    },
    [notify],
  );

  useEffect(() => {
    if (!storageReady) return;
    localStorage.setItem("kardap-calls", JSON.stringify(legacyCalls));
    const serialized = JSON.stringify(legacyCalls);
    if (cloudReady && lastRemoteState.current.calls !== serialized) {
      lastRemoteState.current.calls = serialized;
      persist("calls", legacyCalls, setLegacyCalls);
    }
    // Só reage à mudança do valor: incluir cloudReady/persist reenviaria o mesmo dado a cada sincronização.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legacyCalls, storageReady]);
  useEffect(() => {
    if (!storageReady) return;
    localStorage.setItem("kardap-brand", JSON.stringify(brand));
    const serialized = JSON.stringify(brand);
    if (cloudReady && lastRemoteState.current.brand !== serialized) {
      lastRemoteState.current.brand = serialized;
      persist("brand", brand, setBrand);
    }
    // Só reage à mudança do valor: incluir cloudReady/persist reenviaria o mesmo dado a cada sincronização.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand, storageReady]);
  useEffect(() => {
    if (!storageReady) return;
    localStorage.setItem("kardap-settings", JSON.stringify(settings));
    const serialized = JSON.stringify(settings);
    if (cloudReady && lastRemoteState.current.settings !== serialized) {
      lastRemoteState.current.settings = serialized;
      persist("settings", settings, setSettings);
    }
    // Só reage à mudança do valor: incluir cloudReady/persist reenviaria o mesmo dado a cada sincronização.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, storageReady]);
  useEffect(() => {
    if (storageReady) localStorage.setItem("kardap-tables", JSON.stringify(tables));
  }, [tables, storageReady, cloudReady]);

  const onLogin = useCallback(() => setSession(true), []);

  let page: React.ReactNode;
  if (isPublicPath(path)) {
    page = (
      <PublicMenu
        status={publicStatus}
        slow={publicSlow}
        onRetry={retry}
        productsLoaded={publicProductsLoaded}
        restaurantId={publicId}
        table={publicTableName}
        brand={publicRestaurant.brand}
        settings={publicRestaurant.settings}
        foods={publicFoods}
        categories={publicCategories}
        restaurantName={publicRestaurant.name}
        billAllowed={publicRestaurant.billAllowed}
        suspended={publicRestaurant.suspended}
      />
    );
  } else if (path === "/planos") {
    page = <PlansPage session={session} />;
  } else if (isAdminPath(path)) {
    page = !authReady ? <PanelLoading /> : session ? <AdminPanel path={path} notify={notify} /> : <AuthPage register={false} onLogin={onLogin} />;
  } else if (isAuthPath(path)) {
    page = <AuthPage register={path === "/criar-conta"} onLogin={onLogin} />;
  } else if (LEGAL_PATHS.includes(path)) {
    page = <LegalPage type={path.slice(1) as "privacidade" | "termos" | "cookies"} />;
  } else if (inPanel) {
    // Evita mostrar login/onboarding por engano enquanto o Firebase ainda restaura a sessão no F5.
    if (!storageReady || !authReady || (session && !restaurantLoaded)) {
      page = path.startsWith("/dashboard") ? (
        <DashboardSkeleton error={restaurantError} slow={slowLoad} onRetry={retry} />
      ) : restaurantError || slowLoad ? (
        <LoadProblem message={restaurantError} onRetry={retry} />
      ) : (
        <PanelLoading />
      );
    } else if (!session) {
      page = <AuthPage register={false} onLogin={onLogin} />;
    } else if (path === "/onboarding" || !onboardingDone) {
      page = <Onboarding onComplete={() => setOnboardingDone(true)} />;
    } else {
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
          account={account}
        />
      );
    }
  } else {
    page = <NotFound />;
  }

  return (
    <>
      {page}
      {LEGAL_PATHS.includes(path) && <BackToTop />}
      <Toaster toast={toast} onDismiss={dismissToast} />
    </>
  );
}

function PanelLoading() {
  return (
    <div className="kd-state" aria-busy="true">
      <SpeedLoader large label="Carregando" />
    </div>
  );
}

function LoadProblem({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div className="kd-state" role={message ? "alert" : "status"}>
      {!message && <SpeedLoader large label="Ainda carregando" />}
      <h1 className="kd-state-title">{message ? "Não foi possível carregar" : "Está demorando mais que o normal"}</h1>
      <p className="kd-state-text">{message || "Ainda estamos buscando seus dados. Se a internet estiver instável, tente de novo."}</p>
      <Button onClick={onRetry} icon={<RotateCw size={16} />}>
        Tentar de novo
      </Button>
    </div>
  );
}

function NotFound() {
  return (
    <main className="kd-state">
      <h1 className="kd-state-title">Página não encontrada</h1>
      <p className="kd-state-text">O endereço pode ter mudado ou foi digitado com algum erro.</p>
      <div className="kd-row" style={{ justifyContent: "center" }}>
        <a className="kd-btn kd-btn--primary" href="/">
          Ir para o site
        </a>
        <a className="kd-btn kd-btn--secondary" href="/dashboard">
          Abrir o painel
        </a>
      </div>
    </main>
  );
}
