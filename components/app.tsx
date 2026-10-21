"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { QueryDocumentSnapshot } from "firebase/firestore";
import { RotateCw } from "lucide-react";
import {
  fetchChamadosPage,
  findRestaurantByOwner,
  getRestaurantId,
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
import { isDemoRestaurant } from "@/lib/demo/ids";
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
import { readReturnTo, readSsoState, safeRedirect } from "@/lib/sso/config";
import { clearAccountStorage, linkedUid, readSsoSession, watchSsoState } from "@/lib/sso/client";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/auth";

/* Cada tela carrega só o próprio código: quem abre o cardápio pelo QR não baixa o painel. */
const loadDashboard = () => import("@/components/dashboard/dashboard");
const loadAdminPanel = () => import("@/components/admin/admin-panel");
const Dashboard = dynamic(loadDashboard, { ssr: false, loading: () => <DashboardSkeleton /> });
const AuthPage = dynamic(() => import("@/components/auth/auth-page"), { ssr: false, loading: () => <PanelLoading /> });
const PublicMenu = dynamic(() => import("@/components/menu/public-menu"), { ssr: false, loading: () => <MenuSkeleton /> });
const DeliveryMenu = dynamic(() => import("@/components/delivery/delivery-menu"), { ssr: false, loading: () => <MenuSkeleton /> });
const Onboarding = dynamic(() => import("@/components/site/onboarding"), { ssr: false, loading: () => <PanelLoading /> });
const LegalPage = dynamic(() => import("@/components/site/legal-page"), { ssr: false, loading: () => <PanelLoading /> });
const AdminPanel = dynamic(loadAdminPanel, { ssr: false, loading: () => <DashboardSkeleton /> });
const PlansPage = dynamic(() => import("@/components/site/plans-page"), { ssr: false, loading: () => <PanelLoading /> });
const LogoutPage = dynamic(() => import("@/components/auth/logout-page"), { ssr: false, loading: () => <PanelLoading /> });

const defaultBrand: Brand = {
  logo: "", cover: "", logoSmall: "", coverSmall: "",
  palette: null, customPalette: null, panelPalette: null, panelCustomPalette: null,
};

/** Marca vinda do Firestore ou do aparelho: só strings nas imagens e paleta validada (cores #rrggbb). */
function normalizeBrand(raw: unknown): Brand {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const menuPalette = readPalette(b.palette);
  const legacyPanelPalette = menuPalette?.panel ? { ...menuPalette, panel: false } : null;
  return {
    logo: typeof b.logo === "string" ? b.logo : "",
    cover: typeof b.cover === "string" ? b.cover : "",
    logoSmall: typeof b.logoSmall === "string" ? b.logoSmall : "",
    coverSmall: typeof b.coverSmall === "string" ? b.coverSmall : "",
    palette: menuPalette,
    customPalette: readPalette(b.customPalette),
    panelPalette: readPalette(b.panelPalette) ?? legacyPanelPalette,
    panelCustomPalette: readPalette(b.panelCustomPalette),
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
/** Login pedido por outro aplicativo (ex.: o PDV) com destino válido: a tela de login decide para onde voltar. */
const hasSsoRedirect = () => Boolean(safeRedirect(readReturnTo(new URLSearchParams(window.location.search))));

const SESSION_HINT_KEY = "kardap-session-hint";

/** Encerra só a sessão deste site (a compartilhada já acabou em outro lugar). */
async function signOutHere() {
  clearAccountStorage();
  if (typeof window !== "undefined") localStorage.removeItem(SESSION_HINT_KEY);
  await signOut(getFirebaseAuth()).catch(() => undefined);
}

type PublicRestaurant = { id: string; name: string; brand: Brand; settings: RestaurantSettings; billAllowed: boolean; suspended: boolean; isDemo: boolean };
const emptyPublicRestaurant: PublicRestaurant = { id: "", name: "", brand: defaultBrand, settings: defaultSettings, billAllowed: false, suspended: false, isDemo: false };
const emptyAccount: AccountInfo = { subscription: null, createdAt: null, suspended: false, suspendedReason: "", onboardingSelectedPlanId: null, isDemo: false };

export default function App() {
  const path = usePathname();
  const query = useSearchParams();
  const router = useRouter();
  const inPanel = isPanelPath(path);
  useEffect(() => {
    if (inPanel) void loadDashboard();
    if (isAdminPath(path)) void loadAdminPanel();
  }, [inPanel, path]);
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
  // Se há hint de sessão prévia no localStorage, inicia authReady=true para evitar skeleton em branco
  // enquanto o Firebase Auth confirma a sessão em background. Se a sessão estiver expirada,
  // o onAuthStateChanged corrige o estado logo após (mostrando login sem flash visível).
  const hasSessionHint = typeof window !== "undefined" && Boolean(localStorage.getItem(SESSION_HINT_KEY)) && inPanel && isFirebaseConfigured;
  const [authReady, setAuthReady] = useState(!isFirebaseConfigured || hasSessionHint);
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

  // Avisos que só devem aparecer depois que o Firestore confirmar a próxima gravação daquele campo.
  type SaveWaiter = { done: () => void; failed?: () => void };
  const saveWaiters = useRef<Partial<Record<"brand" | "settings", SaveWaiter[]>>>({});
  const onSaved = useCallback((key: "brand" | "settings", done: () => void, failed?: () => void) => {
    (saveWaiters.current[key] ||= []).push({ done, failed });
  }, []);

  const persist = <K extends "calls" | "brand" | "settings">(key: K, value: unknown, restore: (value: any) => void) => {
    const waitKey = key === "calls" ? null : (key as "brand" | "settings");
    const waiting: SaveWaiter[] = waitKey ? saveWaiters.current[waitKey] || [] : [];
    if (waitKey) saveWaiters.current[waitKey] = [];
    saveRestaurant({ [key]: value })
      .then(() => waiting.forEach((w) => w.done()))
      .catch((error) => {
      if (isTimeout(error)) {
        notify("Sem resposta do servidor. A alteração ficou guardada neste aparelho e será enviada quando a conexão voltar.", "error");
        return;
      }
      waiting.forEach((w) => w.failed?.());
      const reason = friendlyError(error, "");
      notify(reason ? `${reason} A alteração foi desfeita.` : "Não foi possível salvar a alteração. Ela foi desfeita; tente de novo.", "error");
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
      // Marca e configurações não passam pelo armazenamento local: o Firestore em tempo real
      // já sincroniza abas e aparelhos (evita gravações duplicadas e dados da conta no navegador).
      // Chamados legados idem: com o Firebase, a cópia local de outra aba (que pode estar vazia, de uma aba
      // recém-aberta) não pode substituir a lista nem ser gravada de volta no restaurante.
      if (!isFirebaseConfigured && e.key === "kardap-calls" && e.newValue) setLegacyCalls(JSON.parse(e.newValue));
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  // Sincronização e persistência contínua da sessão do usuário com Firebase Auth
  useEffect(() => {
    if (!isFirebaseConfigured || !needsAuth) return;
    let alive = true;
    // onAuthStateChanged agora é static import — sem round-trip de dynamic import antes do listener iniciar.
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), async (authUser) => {
      if (!alive) return;
      // Identidade anônima criada ao curtir um prato no cardápio público não é login no painel.
      const user = authUser?.isAnonymous ? null : authUser;
      // A sessão compartilhada deste navegador acabou enquanto o site estava fechado (logout no PDV,
      // expiração dos 5 dias): o login guardado aqui também não vale mais.
      if (user && firstAuthEvent.current && linkedUid() === user.uid && !readSsoState()) {
        firstAuthEvent.current = false;
        await signOutHere();
        return;
      }
      if (user) {
        localStorage.setItem(SESSION_HINT_KEY, "1");
        const fromApp = hasSsoRedirect();
        const cachedUserId = localStorage.getItem("kardap-restaurant-owner");
        if (cachedUserId && cachedUserId !== user.uid) localStorage.removeItem("kardap-restaurant-id");
        localStorage.setItem("kardap-restaurant-owner", user.uid);

        if (!localStorage.getItem("kardap-restaurant-id")) {
          // Redireciona otimisticamente para o dashboard sem bloquear em findRestaurantByOwner.
          // O dashboard lida com restaurantLoaded=false mostrando o skeleton enquanto o Firestore responde.
          if (isAuthPath(window.location.pathname) && !fromApp) {
            router.replace("/dashboard");
          }
          // Busca o id do restaurante em background para popular o localStorage para próximas visitas.
          findRestaurantByOwner(user.uid).then((found) => {
            if (!alive) return;
            if (found && !found.onboardingCompleted && window.location.pathname === "/dashboard") {
              router.replace("/onboarding");
            }
          });
        } else if (firstAuthEvent.current && isAuthPath(window.location.pathname) && !fromApp) {
          firstAuthEvent.current = false;
          router.replace("/dashboard");
        }
      } else {
        localStorage.removeItem(SESSION_HINT_KEY);
        setRestaurantLoaded(false);
        // Sem sessão, nada é gravado (o estado da tela anterior não volta para o Firestore).
        setCloudReady(false);
      }
      firstAuthEvent.current = false;
      setSession(Boolean(user));
      setAuthReady(true);
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [needsAuth, router]);

  // Logout feito no PDV ou em outra aba, sessão expirada ou revogada: esta aba também sai, sem recarregar.
  useEffect(() => {
    if (!session || !needsAuth) return;
    let alive = true;
    // Não depende da marca kardap-sso-uid: outra aba (o login aberto pelo PDV, por exemplo) pode já tê-la apagado.
    const end = () => {
      if (!alive) return;
      alive = false;
      signOutHere().then(() => notify("Sua sessão foi encerrada. Entre de novo para continuar.", "error"));
    };
    const stop = watchSsoState({
      onEnded: end,
      // Outro login neste navegador: se for outra conta, esta aba não pode continuar com a anterior.
      onReplaced: () =>
        Promise.all([readSsoSession(), import("@/lib/auth")]).then(([status, { getFirebaseAuth }]) => {
          const uid = getFirebaseAuth().currentUser?.uid;
          if (status.authenticated && uid && status.uid !== uid) end();
        }),
    });
    // Revogada em outro aparelho ("sair de todos"): confere uma vez ao abrir. Sem rede não desloga.
    if (linkedUid() && readSsoState()) readSsoSession().then((status) => status.authenticated === false && end());
    return () => {
      alive = false;
      stop();
    };
  }, [session, needsAuth, notify]);

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
            // Compara com o valor já completado pelos padrões: senão o painel regravaria a cada carregamento.
            lastRemoteState.current.settings = JSON.stringify(next);
            if (!meta.fromCache) confirmed.current.settings = next;
            setSettings(next);
          }
          if (data.tables) {
            lastRemoteState.current.tables = JSON.stringify(data.tables);
            setTables(data.tables as string[]);
          }
          const onboardingData = data.onboarding as { selectedPlanId?: string } | undefined;
          setAccount({
            subscription: (data.subscription as AccountInfo["subscription"]) || null,
            createdAt: data.createdAt ?? null,
            suspended: data.status === "suspended",
            suspendedReason: typeof data.suspendedReason === "string" ? data.suspendedReason : "",
            onboardingSelectedPlanId: typeof onboardingData?.selectedPlanId === "string" ? onboardingData.selectedPlanId : null,
            isDemo: isDemoRestaurant(getRestaurantId(), data),
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
    const timer = setTimeout(() => setSlowLoad(true), 4000);
    return () => clearTimeout(timer);
  }, [ownerData, restaurantLoaded, retryKey]);

  useEffect(() => {
    if (!isPublicPath(path)) return;
    const slug = path.split("/")[2];
    if (!slug) return;
    setPublicStatus("loading");
    setPublicProductsLoaded(false);
    setPublicSlow(false);
    const slowTimer = setTimeout(() => setPublicSlow(true), 4000);
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
          isDemo: isDemoRestaurant(data.id, data),
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
  // Só o token da mesa importa aqui: outros parâmetros (ex.: ?reel= dos Reels) não reiniciam a leitura.
  const tableToken = query.get("mesa") || "";
  useEffect(() => {
    const token = tableToken;
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
  }, [path, publicId, tableToken]);

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
    const serialized = JSON.stringify(brand);
    if (cloudReady && lastRemoteState.current.brand !== serialized) {
      lastRemoteState.current.brand = serialized;
      persist("brand", brand, setBrand);
    }
    // Só reage à mudança do valor: incluir cloudReady/persist reenviaria o mesmo dado a cada sincronização.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand, storageReady]);
  const settingsDebounce = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!storageReady) return;
    const serialized = JSON.stringify(settings);
    if (cloudReady && lastRemoteState.current.settings !== serialized) {
      clearTimeout(settingsDebounce.current);
      settingsDebounce.current = setTimeout(() => {
        lastRemoteState.current.settings = JSON.stringify(settings);
        persist("settings", settings, setSettings);
      }, 400);
    }
    return () => clearTimeout(settingsDebounce.current);
    // Só reage à mudança do valor: incluir cloudReady/persist reenviaria o mesmo dado a cada sincronização.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, storageReady]);
  useEffect(() => {
    if (storageReady) localStorage.setItem("kardap-tables", JSON.stringify(tables));
  }, [tables, storageReady, cloudReady]);

  const onLogin = useCallback(() => setSession(true), []);

  let page: React.ReactNode;
  const isDeliveryPath = isPublicPath(path) && path.endsWith("/delivery");
  if (isDeliveryPath) {
    // Mesmos dados do cardápio (restaurante, categorias, produtos e marca): o delivery é o cardápio com carrinho.
    page = (
      <DeliveryMenu
        status={publicStatus}
        slow={publicSlow}
        onRetry={retry}
        productsLoaded={publicProductsLoaded}
        restaurantId={publicId}
        slug={path.split("/")[2] || ""}
        brand={publicRestaurant.brand}
        settings={publicRestaurant.settings}
        foods={publicFoods}
        categories={publicCategories}
        restaurantName={publicRestaurant.name}
        suspended={publicRestaurant.suspended}
        isDemo={publicRestaurant.isDemo}
        notify={notify}
      />
    );
  } else if (isPublicPath(path)) {
    page = (
      <PublicMenu
        status={publicStatus}
        slow={publicSlow}
        onRetry={retry}
        productsLoaded={publicProductsLoaded}
        restaurantId={publicId}
        slug={path.split("/")[2] || ""}
        table={publicTableName}
        brand={publicRestaurant.brand}
        settings={publicRestaurant.settings}
        foods={publicFoods}
        categories={publicCategories}
        restaurantName={publicRestaurant.name}
        billAllowed={publicRestaurant.billAllowed}
        suspended={publicRestaurant.suspended}
        isDemo={publicRestaurant.isDemo}
      />
    );
  } else if (path === "/planos") {
    page = <PlansPage session={session} />;
  } else if (path === "/logout") {
    page = <LogoutPage />;
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
          onSaved={onSaved}
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
