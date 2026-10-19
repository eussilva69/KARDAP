/**
 * Tipos e máquina de estados do delivery próprio do KARDAP.
 * Módulo puro (sem Firebase, sem env): roda no navegador, servidor e testes.
 *
 * Pedidos de delivery usam a mesma subcoleção `restaurantes/{id}/pedidos` e a mesma franquia mensal
 * dos demais pedidos próprios (source: "kardap_delivery"). O PDV consome estes mesmos documentos.
 */

// ───────────────────────── Status do pedido ─────────────────────────

export const ORDER_STATUSES = [
  "pendente",
  "confirmado",
  "em_preparo",
  "pronto",
  "saiu_para_entrega",
  "entregue",
  "cancelado",
  "recusado",
] as const;

export type DeliveryOrderStatus = (typeof ORDER_STATUSES)[number];

export const TERMINAL_STATUSES: readonly DeliveryOrderStatus[] = ["entregue", "cancelado", "recusado"];

const TRANSITIONS: Record<DeliveryOrderStatus, readonly DeliveryOrderStatus[]> = {
  pendente: ["confirmado", "cancelado", "recusado"],
  confirmado: ["em_preparo", "cancelado"],
  em_preparo: ["pronto", "cancelado"],
  pronto: ["saiu_para_entrega", "cancelado"],
  saiu_para_entrega: ["entregue", "cancelado"],
  entregue: [],
  cancelado: [],
  recusado: [],
};

export function canTransition(from: DeliveryOrderStatus, to: DeliveryOrderStatus): boolean {
  return TRANSITIONS[from]?.indexOf(to) >= 0;
}

export function allowedTransitions(from: DeliveryOrderStatus): readonly DeliveryOrderStatus[] {
  return TRANSITIONS[from] || [];
}

export const STATUS_LABELS: Record<DeliveryOrderStatus, string> = {
  pendente: "Pendente",
  confirmado: "Confirmado",
  em_preparo: "Em preparo",
  pronto: "Pronto",
  saiu_para_entrega: "Saiu para entrega",
  entregue: "Entregue",
  cancelado: "Cancelado",
  recusado: "Recusado",
};

export function isDeliveryStatus(value: unknown): value is DeliveryOrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).indexOf(value) >= 0;
}

// ───────────────────────── Estrutura do pedido ─────────────────────────

export type DeliveryOrderItem = {
  productId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  notes?: string;
};

export type DeliveryAddress = {
  cep: string;
  street: string;
  number: string;
  complement?: string;
  district: string;
  city: string;
  uf?: string;
  reference?: string;
};

export type DeliveryCustomer = {
  name: string;
  phone: string;
  uid?: string;
};

export type StatusHistoryEntry = {
  status: DeliveryOrderStatus;
  at: string;
  by?: string;
};

export type FeeCalculation = {
  feeMode: FeeMode;
  cityMatched: string;
  neighborhoodMatched?: string;
  feeCents: number;
};

export type DeliveryOrder = {
  id: string;
  restaurantId: string;
  orderNumber: number;
  status: DeliveryOrderStatus;
  customer: DeliveryCustomer;
  address: DeliveryAddress;
  items: DeliveryOrderItem[];
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;
  paymentMethod: string;
  paymentStatus: "pendente" | "pago";
  notes?: string;
  feeCalculation?: FeeCalculation;
  origin: {
    source: "kardap_delivery";
    channel: "web";
    isNativeOrder: true;
  };
  quota?: {
    consumed: boolean;
    periodId: string;
    consumedAt: string;
  };
  statusHistory: StatusHistoryEntry[];
  createdAt: string;
  updatedAt: string;
  confirmedAt?: string;
  confirmedBy?: string;
};

// ───────────────────────── Configuração do delivery ─────────────────────────

export type FeeMode = "taxa_fixa" | "taxa_por_bairro";

export type ServedCity = {
  ibgeCode: string;
  name: string;
  uf: string;
};

export type NeighborhoodEntry = {
  name: string;
  feeCents: number;
  enabled: boolean;
};

export type CityDeliveryArea = {
  cityName: string;
  uf: string;
  ibgeCode: string;
  neighborhoods: Record<string, NeighborhoodEntry>;
  updatedAt: string;
};

export type DeliveryFeeResult = {
  feeCents: number;
  feeMode: FeeMode;
  cityName: string;
  neighborhoodName: string | null;
  matched: boolean;
  reason?: string;
};

export function slugifyNeighborhood(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function normalizeCity(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export type DeliveryConfig = {
  enabled: boolean;
  enabledAt?: string;
  disabledAt?: string;
  deliveryFeeCents: number;
  deliveryEta: string;
  deliveryArea: string;
  minOrderCents: number;
  paymentMethods: string[];
  notes?: string;
  feeMode?: FeeMode;
  servedCities?: ServedCity[];
};

export const DEFAULT_DELIVERY_CONFIG: DeliveryConfig = {
  enabled: false,
  deliveryFeeCents: 0,
  deliveryEta: "",
  deliveryArea: "",
  minOrderCents: 0,
  paymentMethods: ["dinheiro", "pix", "cartao_credito", "cartao_debito"],
  notes: "",
  feeMode: "taxa_fixa",
  servedCities: [],
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  cartao_credito: "Cartão de crédito",
  cartao_debito: "Cartão de débito",
};

// ───────────────────────── Checkout (dados enviados pelo cliente) ─────────────────────────

export type DeliveryCheckoutItem = {
  productId: string;
  quantity: number;
  notes?: string;
};

export type DeliveryCheckoutPayload = {
  restaurantId: string;
  customer: { name: string; phone: string };
  address: DeliveryAddress;
  items: DeliveryCheckoutItem[];
  paymentMethod: string;
  notes?: string;
  idempotencyKey: string;
};
