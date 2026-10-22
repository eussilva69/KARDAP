"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Bookmark, Check, ConciergeBell, Receipt, Star } from "lucide-react";
import { addPublicCall } from "@/lib/restaurant-db";
import { elapsed } from "@/lib/format";
import { useNow, usePrefersReducedMotion, useRootPalette, useSaveData } from "@/lib/hooks";
import { isDefaultPalette } from "@/lib/palette";
import { Button } from "@/components/ui/primitives";
import type { Brand, RestaurantSettings } from "@/components/dashboard/types";
import { MenuHero } from "./menu-hero";
import type { Dish } from "./dish-row";
import { buildSections, MenuCatalog, type PublicCategory } from "./menu-catalog";
import { CallSheet, type CallIntent } from "./call-sheet";
import { MenuMessage, MenuSkeleton } from "./menu-states";
import { ReelsRail } from "./reels/reels-rail";
import type { ReelsMode } from "./reels/reels-viewer";
import { useEngagement } from "./reels/use-engagement";

// O feed e a lista de salvos só baixam quando são usados (ou quando o celular fica ocioso, ver abaixo):
// o primeiro carregamento do cardápio não cresce.
const loadViewer = () => import("./reels/reels-viewer");
const ReelsViewer = dynamic(() => loadViewer().then((m) => m.ReelsViewer), { ssr: false, loading: () => <div className="kd-reels" aria-busy="true" /> });
const SavedSheet = dynamic(() => import("./reels/saved-sheet").then((m) => m.SavedSheet), { ssr: false });

export type { PublicCategory };

/** Dois toques curtos no celular do cliente confirmando que o chamado saiu. */
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

export default function PublicMenu({
  status,
  slow,
  onRetry,
  productsLoaded,
  restaurantId,
  slug,
  table,
  brand,
  settings,
  foods,
  categories,
  restaurantName,
  billAllowed,
  suspended,
  isDemo = false,
}: {
  status: "loading" | "ready" | "not-found" | "error";
  slow: boolean;
  onRetry: () => void;
  productsLoaded: boolean;
  restaurantId: string;
  /** Endereço do cardápio (/r/:slug), usado nos links de compartilhamento dos Reels. */
  slug: string;
  table: string;
  brand: Brand;
  settings: RestaurantSettings;
  foods: Dish[];
  /** undefined: carregando · null: indisponível (usa o agrupamento antigo). */
  categories: PublicCategory[] | null | undefined;
  restaurantName: string;
  /** "Pedir a conta" depende do plano do restaurante (Pro ou período de teste). */
  billAllowed: boolean;
  /** Restaurante suspenso pela administração do Kardap. */
  suspended: boolean;
  /** Conta demonstrativa: aviso discreto de dados simulados no rodapé. */
  isDemo?: boolean;
}) {
  useRootPalette(brand.palette, true, `kardap-theme-menu:${slug}:v1`);
  const customColors = !isDefaultPalette(brand.palette);
  const reducedMotion = usePrefersReducedMotion();
  const saveData = useSaveData();
  const autoplay = !reducedMotion && !saveData;
  const now = useNow(30_000);

  const [sheet, setSheet] = useState<CallIntent | null>(null);
  const [viewer, setViewer] = useState<{ mode: ReelsMode; list: Dish[]; index: number; key: number } | null>(null);
  const [savedOpen, setSavedOpen] = useState(false);
  const [lastCall, setLastCall] = useState<{ reason: string; at: number } | null>(null);

  const ready = status === "ready" && productsLoaded && categories !== undefined;
  const sections = useMemo(() => buildSections(foods, categories ?? null), [foods, categories]);
  const allDishes = useMemo(() => sections.flatMap((s) => s.dishes), [sections]);
  const videoDishes = useMemo(() => allDishes.filter((d) => d.videoUrl), [allDishes]);
  const liveDishes = useMemo(() => new Map(allDishes.filter((d) => d.id).map((d) => [d.id as string, d])), [allDishes]);
  // A lista do feed é fixada ao abrir (a ordem não muda enquanto a pessoa assiste), mas cada prato vem
  // atualizado do Firestore (curtidas, preço); um prato retirado do cardápio no meio fica como estava.
  const viewerDishes = useMemo(() => (viewer ? viewer.list.map((d) => (d.id && liveDishes.get(d.id)) || d) : []), [viewer, liveDishes]);
  const restaurant = useMemo(
    () => ({ id: restaurantId, slug, name: restaurantName, logo: brand.logoSmall || brand.logo }),
    [restaurantId, slug, restaurantName, brand.logoSmall, brand.logo],
  );
  const engagement = useEngagement(restaurant);
  const viewerOpen = useRef(false);
  viewerOpen.current = Boolean(viewer);

  /** Abre o feed. Cria uma entrada no histórico: o "voltar" do celular fecha o feed, não sai do cardápio. */
  const openViewer = useCallback((mode: ReelsMode, list: Dish[], index: number) => {
    if (!list.length) return;
    if (!viewerOpen.current) {
      try {
        window.history.pushState({ kdReel: true }, "");
      } catch {}
    }
    setViewer({ mode, list, index: Math.max(0, Math.min(list.length - 1, index)), key: Date.now() });
  }, []);

  const closeViewer = useCallback(() => {
    if ((window.history.state as { kdReel?: boolean } | null)?.kdReel) window.history.back();
    else setViewer(null);
  }, []);

  useEffect(() => {
    if (!viewer) return;
    const onPop = () => {
      if (!(window.history.state as { kdReel?: boolean } | null)?.kdReel) setViewer(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [viewer]);

  /** Prato da lista: abre o feed com todos os pratos do cardápio, começando nele. */
  const openDish = useCallback((list: Dish[], index: number) => openViewer("menu", list, index), [openViewer]);
  // Callbacks fixos: abrir o feed ou curtir não renderiza de novo o trilho nem a lista de pratos.
  const openReelsAt = useCallback((index: number) => openViewer("reels", videoDishes, index), [openViewer, videoDishes]);
  const openReels = useCallback(() => openViewer("reels", videoDishes, 0), [openViewer, videoDishes]);

  // Com o cardápio na tela e o celular ocioso, adianta o download do feed: o primeiro toque abre na hora.
  // Com economia de dados, espera o toque.
  useEffect(() => {
    if (!ready || saveData) return;
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    const run = () => void loadViewer().catch(() => undefined);
    if (idle) idle(run);
    else setTimeout(run, 2000);
  }, [ready, saveData]);

  // Link compartilhado (/r/:slug?reel=<prato>): abre direto no vídeo do prato, uma vez.
  const deepLinked = useRef(false);
  useEffect(() => {
    if (!ready || deepLinked.current) return;
    deepLinked.current = true;
    const params = new URLSearchParams(window.location.search);
    const target = params.get("reel");
    if (!target) return;
    params.delete("reel");
    // Tira o ?reel do endereço (recarregar a página volta ao cardápio); a mesa (?mesa=) continua.
    const clean = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
    try {
      window.history.replaceState(null, "", clean);
    } catch {}
    const inReels = videoDishes.findIndex((d) => d.id === target);
    const inMenu = allDishes.findIndex((d) => d.id === target);
    if (inReels >= 0) openViewer("reels", videoDishes, inReels);
    else if (inMenu >= 0) openViewer("menu", allDishes, inMenu);
  }, [ready, videoDishes, allDishes, openViewer]);

  useEffect(() => {
    if (restaurantName) document.title = `${restaurantName} · Cardápio`;
  }, [restaurantName]);

  useEffect(() => {
    if (lastCall && now - lastCall.at > 15 * 60_000) setLastCall(null);
  }, [now, lastCall]);

  const sendCall = useCallback(
    async (reason: string, tableLabel: string) => {
      if (!restaurantId) throw new Error("O cardápio ainda está conectando. Tente de novo em instantes.");
      await addPublicCall(restaurantId, { table: tableLabel, type: reason });
      playCallTone();
      setLastCall({ reason, at: Date.now() });
    },
    [restaurantId],
  );

  if (status === "not-found" || status === "error") return <MenuMessage status={status} onRetry={onRetry} />;
  if (status === "ready" && suspended) return <MenuMessage status="unavailable" onRetry={onRetry} />;
  if (!ready) return slow ? <MenuMessage status="slow" onRetry={onRetry} /> : <MenuSkeleton />;

  const billOn = settings.bill && billAllowed;
  const canCall = settings.waiter || billOn;

  return (
    <div className={`kd-menu kd-menu-page ${canCall ? "has-bar" : ""} ${customColors ? "has-palette" : ""}`}>
      <div className="kd-menu-column">
        <MenuHero name={restaurantName} brand={brand} table={table}>
          {((settings.google && settings.googleReviewUrl) || engagement.saved.length > 0 || engagement.account) && (
            <div className="kd-menu-pills">
              {settings.google && settings.googleReviewUrl && (
                <a className="kd-menu-review" href={settings.googleReviewUrl} target="_blank" rel="noopener noreferrer">
                  <Star size={15} aria-hidden />
                  Avaliar no Google
                  <span className="kd-sr"> (abre em nova aba)</span>
                </a>
              )}
              {(engagement.saved.length > 0 || engagement.account) && (
                <button type="button" className="kd-menu-review kd-menu-saved" onClick={() => setSavedOpen(true)}>
                  <Bookmark size={15} aria-hidden />
                  Salvos
                  {engagement.saved.length > 0 && <span className="kd-menu-pill-count kd-num">{engagement.saved.length}</span>}
                </button>
              )}
            </div>
          )}
        </MenuHero>

        <ReelsRail dishes={videoDishes} onOpen={openReelsAt} />

        <MenuCatalog
          sections={sections}
          allDishes={allDishes}
          autoplay={autoplay}
          reducedMotion={reducedMotion}
          emptyText={`A equipe ainda está cadastrando os pratos. ${settings.waiter ? "Se quiser, chame alguém para ver as opções do dia." : ""}`}
          onOpenDish={openDish}
          onOpenReels={videoDishes.length > 0 ? openReels : undefined}
          photoOnly
        />
        {isDemo && <p className="kd-menu-demo-note">Cardápio de demonstração do KARDAP · dados e pedidos simulados</p>}
      </div>

      {canCall && (
        <div className="kd-menu-bar">
          {lastCall && (
            <p className="kd-menu-bar-status" role="status">
              <Check size={15} strokeWidth={2.8} aria-hidden />
              Equipe avisada {elapsed(new Date(lastCall.at).toISOString(), now)}
            </p>
          )}
          <div className="kd-menu-bar-actions">
            {settings.waiter && (
              <Button variant="signal" size="lg" icon={<ConciergeBell size={19} aria-hidden />} onClick={() => setSheet("waiter")}>
                Chamar garçom
              </Button>
            )}
            {billOn && (
              <Button variant={settings.waiter ? "secondary" : "signal"} size="lg" icon={<Receipt size={18} aria-hidden />} onClick={() => setSheet("bill")}>
                Pedir a conta
              </Button>
            )}
          </div>
        </div>
      )}

      {viewer && (
        <ReelsViewer
          key={viewer.key}
          dishes={viewerDishes}
          startIndex={viewer.index}
          mode={viewer.mode}
          autoplay={autoplay}
          restaurant={restaurant}
          engagement={engagement}
          canCall={settings.waiter}
          onCall={() => setSheet("order")}
          onClose={closeViewer}
          onShowSaved={() => setSavedOpen(true)}
        />
      )}
      {savedOpen && (
        <SavedSheet
          restaurant={restaurant}
          engagement={engagement}
          dishes={liveDishes}
          onOpen={(productId) => {
            setSavedOpen(false);
            const index = allDishes.findIndex((d) => d.id === productId);
            if (index >= 0) openViewer("menu", allDishes, index);
          }}
          onClose={() => setSavedOpen(false)}
        />
      )}
      {sheet && (
        <CallSheet
          table={table}
          intent={sheet}
          allowWaiter={settings.waiter}
          allowBill={billOn}
          onSend={sendCall}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}

export { MenuSkeleton };
