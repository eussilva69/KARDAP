import type { ToastAction } from "@/components/ui/toast";
import type { RestaurantSubscription } from "@/lib/cakto/types";
import type { BrandPalette } from "@/lib/palette";

/** Situação comercial do restaurante, lida do próprio documento (sem dados de pagamento). */
export type AccountInfo = {
  subscription: Partial<RestaurantSubscription> | null;
  createdAt: unknown;
  suspended: boolean;
  suspendedReason: string;
};

/**
 * `palette`: paleta em uso (null = cores do Kardap). `customPalette`: a paleta montada pelo
 * restaurante, guardada mesmo quando ele experimenta uma pronta. Ver lib/palette.ts.
 */
export type Brand = { logo: string; cover: string; palette: BrandPalette | null; customPalette: BrandPalette | null };
export type RestaurantSettings = {
  waiter: boolean;
  bill: boolean;
  google: boolean;
  sound: boolean;
  googleReviewUrl?: string;
};
export type CallStatus = "ativo" | "andamento" | "concluido";
export type Call = {
  _key: string;
  _source: "sub" | "legacy";
  _id: string;
  table: string;
  type: string;
  status: string;
  time: string;
  createdAt?: string;
};
export type Notify = (message: string, tone?: "success" | "error", action?: ToastAction) => void;
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
  account: AccountInfo;
};
