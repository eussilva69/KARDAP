/**
 * Planos do KARDAP (docs/PLANOS.md): catálogo, regras de acesso, período de consumo e origem dos pedidos.
 *
 * Módulo puro, sem Firebase, sem variáveis de ambiente e sem imports: roda igual no navegador, no servidor e nos
 * testes (`node scripts/test-billing.mjs`). As regras ficam só aqui; quem aplica a segurança é o servidor
 * (lib/billing/server.ts). Telas usam o mesmo cálculo apenas para mostrar o estado certo.
 */

// ───────────────────────── Catálogo ─────────────────────────

export type PlanId = "start" | "pro" | "business" | "enterprise";
export const PLAN_ORDER: PlanId[] = ["start", "pro", "business", "enterprise"];
/** Versão do catálogo. Assinaturas gravadas antes dela (planos Essencial/Pro antigos) são "legado". */
export const CATALOG_VERSION = 2;

export type FeatureKey =
  | "videoMenu"
  | "qrCode"
  | "waiterCall"
  | "billRequest"
  | "customBranding"
  | "pdvAccess"
  | "orderManagement"
  | "cashRegister"
  | "inventory"
  | "financialManagement"
  | "deliveryManagement"
  | "courierManagement"
  | "reports"
  | "promotions"
  | "marketplaceIntegrations"
  | "multiUnit"
  | "prioritySupport";

export const FEATURE_KEYS: FeatureKey[] = [
  "videoMenu",
  "qrCode",
  "waiterCall",
  "billRequest",
  "customBranding",
  "pdvAccess",
  "orderManagement",
  "cashRegister",
  "inventory",
  "financialManagement",
  "deliveryManagement",
  "courierManagement",
  "reports",
  "promotions",
  "marketplaceIntegrations",
  "multiUnit",
  "prioritySupport",
];

/** null = ilimitado; 0 = recurso indisponível. */
export type PlanLimits = { maxTables: number | null; maxNativeOrdersPerMonth: number | null };

export interface PlanDefinition {
  id: PlanId;
  name: string;
  tagline: string;
  description: string;
  priceInCents: number | null;
  currency: "BRL";
  billingInterval: "month";
  limits: PlanLimits;
  features: Record<FeatureKey, boolean>;
  /** Itens do cartão de preço, em ordem de importância. */
  highlights: string[];
  popular: boolean;
  /** Contratação só com o time comercial (sem checkout automático). */
  salesOnly: boolean;
  active: boolean;
  version: number;
}

const features = (on: FeatureKey[]): Record<FeatureKey, boolean> =>
  FEATURE_KEYS.reduce((all, key) => ({ ...all, [key]: on.indexOf(key) >= 0 }), {} as Record<FeatureKey, boolean>);

const MENU: FeatureKey[] = ["videoMenu", "qrCode", "waiterCall", "customBranding"];
const OPERATION: FeatureKey[] = [
  ...MENU,
  "billRequest",
  "pdvAccess",
  "orderManagement",
  "cashRegister",
  "inventory",
  "financialManagement",
  "deliveryManagement",
  "courierManagement",
  "reports",
];
const GROWTH: FeatureKey[] = [...OPERATION, "promotions", "marketplaceIntegrations", "prioritySupport"];

export const PLAN_CATALOG: Record<PlanId, PlanDefinition> = {
  start: {
    id: "start",
    name: "KARDAP Start",
    tagline: "Para apresentar seus pratos num cardápio digital moderno",
    description: "Cardápio digital em vídeo estilo Reels, QR Code nas mesas e atualização em tempo real.",
    priceInCents: 4990,
    currency: "BRL",
    billingInterval: "month",
    limits: { maxTables: 8, maxNativeOrdersPerMonth: 0 },
    features: features(MENU),
    highlights: [
      "Cardápio digital em vídeo estilo Reels",
      "Até 8 mesas com QR Code",
      "Produtos e categorias ilimitados",
      "Fotos, vídeos, preços e descrições",
      "Cores e logotipo do restaurante",
      "Atualizações em tempo real",
    ],
    popular: false,
    salesOnly: false,
    active: true,
    version: CATALOG_VERSION,
  },
  pro: {
    id: "pro",
    name: "KARDAP Pro",
    tagline: "Para restaurantes que precisam de gestão operacional",
    description: "Tudo do Start com PDV completo: pedidos, comandas, caixa, estoque, finanças, entregas e relatórios.",
    priceInCents: 12990,
    currency: "BRL",
    billingInterval: "month",
    limits: { maxTables: null, maxNativeOrdersPerMonth: 150 },
    features: features(OPERATION),
    highlights: [
      "Tudo do Start",
      "Mesas e QR Codes ilimitados",
      "Até 150 pedidos próprios por mês",
      "PDV completo: pedidos, comandas e caixa",
      "Estoque, financeiro e entregas",
      "Relatórios de vendas",
    ],
    popular: false,
    salesOnly: false,
    active: true,
    version: CATALOG_VERSION,
  },
  business: {
    id: "business",
    name: "KARDAP Business",
    tagline: "Para estabelecimentos com maior volume de pedidos",
    description: "Tudo do Pro com 500 pedidos próprios por mês, promoções, integrações com marketplaces e suporte prioritário.",
    priceInCents: 19990,
    currency: "BRL",
    billingInterval: "month",
    limits: { maxTables: null, maxNativeOrdersPerMonth: 500 },
    features: features(GROWTH),
    highlights: [
      "Tudo do Pro",
      "Até 500 pedidos próprios por mês",
      "Promoções e campanhas",
      "Integrações com marketplaces",
      "Relatórios gerenciais",
      "Suporte prioritário",
    ],
    popular: true,
    salesOnly: false,
    active: true,
    version: CATALOG_VERSION,
  },
  enterprise: {
    id: "enterprise",
    name: "KARDAP Enterprise",
    tagline: "Para redes, franquias e operações sob medida",
    description: "Tudo do Business com limites, permissões e integrações configurados conforme o contrato.",
    priceInCents: null,
    currency: "BRL",
    billingInterval: "month",
    limits: { maxTables: null, maxNativeOrdersPerMonth: null },
    features: features(GROWTH),
    highlights: [
      "Tudo do Business",
      "Pedidos ilimitados (ou conforme contrato)",
      "Múltiplas unidades, quando contratado",
      "Integrações e relatórios personalizados",
      "Implantação assistida e treinamento",
      "Atendimento dedicado",
    ],
    popular: false,
    salesOnly: true,
    active: true,
    version: CATALOG_VERSION,
  },
};

export const isPlanId = (value: unknown): value is PlanId => typeof value === "string" && PLAN_ORDER.indexOf(value as PlanId) >= 0;
export const planRank = (id: PlanId) => PLAN_ORDER.indexOf(id);
export const shortPlanName = (id: PlanId | string | null | undefined) => (isPlanId(id) ? PLAN_CATALOG[id].name.replace("KARDAP ", "") : "Sem plano");

/**
 * Planos do catálogo anterior. O Essencial (até 30 mesas) vira Start, mantendo as 30 mesas contratadas;
 * o Pro antigo vira o Pro atual (ganha o PDV). O preço pago continua o que está gravado na assinatura.
 */
const LEGACY_PLANS: Record<string, { planId: PlanId; limits?: Partial<PlanLimits> }> = {
  essencial: { planId: "start", limits: { maxTables: 30 } },
};

/** Linhas da comparação de planos (página de preços e Meu Plano). */
export const PLAN_COMPARISON: { label: string; values: Record<PlanId, string | boolean> }[] = [
  { label: "Cardápio digital em vídeo estilo Reels", values: { start: true, pro: true, business: true, enterprise: true } },
  { label: "Produtos e categorias", values: { start: "Ilimitados", pro: "Ilimitados", business: "Ilimitados", enterprise: "Ilimitados" } },
  { label: "Mesas com QR Code", values: { start: "Até 8", pro: "Ilimitadas", business: "Ilimitadas", enterprise: "Ilimitadas" } },
  { label: "Cores e logotipo", values: { start: true, pro: true, business: true, enterprise: true } },
  { label: "Pedidos próprios por mês", values: { start: false, pro: "150", business: "500", enterprise: "Ilimitados ou conforme contrato" } },
  { label: "Pedidos de iFood e outros marketplaces", values: { start: false, pro: "Não contam no limite", business: "Não contam no limite", enterprise: "Não contam no limite" } },
  { label: "PDV: pedidos e comandas", values: { start: false, pro: true, business: true, enterprise: true } },
  { label: "Caixa, estoque e financeiro", values: { start: false, pro: true, business: true, enterprise: true } },
  { label: "Entregas e entregadores", values: { start: false, pro: true, business: true, enterprise: true } },
  { label: "Pedir a conta pelo cardápio", values: { start: false, pro: true, business: true, enterprise: true } },
  { label: "Relatórios", values: { start: false, pro: "De vendas", business: "Gerenciais", enterprise: "Personalizados" } },
  { label: "Promoções e campanhas", values: { start: false, pro: false, business: true, enterprise: true } },
  { label: "Integrações com marketplaces", values: { start: false, pro: false, business: true, enterprise: "Personalizadas" } },
  { label: "Múltiplas unidades", values: { start: false, pro: false, business: false, enterprise: "Quando contratado" } },
  { label: "Suporte", values: { start: "Padrão", pro: "Padrão", business: "Prioritário", enterprise: "Dedicado" } },
];

// ───────────────────────── Assinatura ─────────────────────────

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "expired" | "suspended";

/** Valores gravados pela versão anterior, convertidos para os atuais. */
const STATUS_ALIASES: Record<string, SubscriptionStatus> = {
  trial: "trialing",
  late: "past_due",
  paused: "canceled",
  inactive: "expired",
};

export const TRIAL_DAYS = 15;
/** O teste de 15 dias libera o plano Pro (como prometem os Termos de Uso). */
export const TRIAL_PLAN: PlanId = "pro";
export const GRACE_PERIOD_DAYS = 3;
const DAY = 24 * 60 * 60 * 1000;

/** Como a assinatura fica gravada em restaurantes/{id}.subscription (formato atual e o anterior). */
export type StoredSubscription = {
  planId?: string;
  planName?: string;
  planVersion?: number;
  status?: string;
  cycle?: string;
  priceCents?: number;
  currentPeriodStart?: unknown;
  currentPeriodEnd?: unknown;
  nextPaymentDate?: unknown;
  trialEndsAt?: unknown;
  lateSince?: unknown;
  canceledAt?: unknown;
  cancelAtPeriodEnd?: boolean;
  paymentProvider?: string;
  customLimits?: Partial<PlanLimits> | null;
  customFeatures?: Partial<Record<FeatureKey, boolean>> | null;
  scheduledChange?: { planId?: string; effectiveAt?: unknown; requestedAt?: unknown } | null;
  [key: string]: unknown;
};

export type AccessReason = "ok" | "trial_ended" | "grace_over" | "period_over" | "expired" | "suspended" | "no_subscription";

export interface Entitlements {
  planId: PlanId;
  planName: string;
  planVersion: number;
  status: SubscriptionStatus;
  /** A assinatura dá acesso agora. Falso = só o básico do cardápio (dados preservados). */
  valid: boolean;
  reason: AccessReason;
  implicitTrial: boolean;
  legacy: boolean;
  trialEndsAt: string | null;
  /** Até quando o acesso atual vale (fim do teste, do período pago ou da carência), quando há data. */
  accessUntil: string | null;
  nextPaymentDate: string | null;
  cancelAtPeriodEnd: boolean;
  scheduledChange: { planId: PlanId; effectiveAt: string | null } | null;
  /** Preço da assinatura gravada (o que o restaurante paga) ou o do catálogo. */
  priceInCents: number | null;
  /** O que vale agora. */
  limits: PlanLimits;
  features: Record<FeatureKey, boolean>;
  /** O que o plano dá quando a assinatura está em dia (para mostrar o que volta ao regularizar). */
  contracted: { limits: PlanLimits; features: Record<FeatureKey, boolean> };
}

/** Converte datas gravadas como texto ISO, número, Timestamp do Firestore ou {seconds}/{_seconds}. */
export function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const maybe = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
  if (typeof maybe.toDate === "function") return maybe.toDate();
  if (typeof maybe.seconds === "number") return new Date(maybe.seconds * 1000);
  if (typeof maybe._seconds === "number") return new Date(maybe._seconds * 1000);
  return null;
}
const iso = (value: unknown) => toDate(value)?.toISOString() ?? null;

export function normalizeStatus(status: unknown): SubscriptionStatus | null {
  if (typeof status !== "string") return null;
  if (STATUS_ALIASES[status]) return STATUS_ALIASES[status];
  return ["trialing", "active", "past_due", "canceled", "expired", "suspended"].indexOf(status) >= 0 ? (status as SubscriptionStatus) : null;
}

/** Sem plano válido: o cardápio continua no ar (dados preservados), sem as operações dos planos pagos. */
const FALLBACK = { limits: PLAN_CATALOG.start.limits, features: features(MENU) };

function sanitizeLimit(value: unknown, fallback: number | null): number | null {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.floor(value);
  return fallback;
}

/**
 * Direitos efetivos do estabelecimento. Ordem: restaurante suspenso → assinatura gravada → teste automático de
 * 15 dias do Pro contado da criação (quando nunca houve assinatura).
 * Personalizações (Enterprise, condições herdadas) valem sobre o plano.
 */
export function resolveEntitlements(
  subscription: StoredSubscription | null | undefined,
  context: { createdAt?: unknown; restaurantStatus?: unknown; now?: number } = {},
): Entitlements {
  const now = context.now ?? Date.now();
  const stored = subscription && subscription.planId && normalizeStatus(subscription.status) ? subscription : null;

  let planId: PlanId;
  let legacy = false;
  let legacyLimits: Partial<PlanLimits> = {};
  if (stored) {
    const raw = String(stored.planId);
    if (isPlanId(raw)) {
      planId = raw;
      legacy = (stored.planVersion || 1) < CATALOG_VERSION;
    } else if (LEGACY_PLANS[raw]) {
      planId = LEGACY_PLANS[raw].planId;
      legacyLimits = LEGACY_PLANS[raw].limits || {};
      legacy = true;
    } else {
      planId = "start";
      legacy = true;
    }
  } else {
    planId = TRIAL_PLAN;
  }

  const plan = PLAN_CATALOG[planId];
  const custom = stored?.customLimits || {};
  const contractedLimits: PlanLimits = {
    maxTables: sanitizeLimit(custom.maxTables, sanitizeLimit(legacyLimits.maxTables, plan.limits.maxTables)),
    maxNativeOrdersPerMonth: sanitizeLimit(custom.maxNativeOrdersPerMonth, sanitizeLimit(legacyLimits.maxNativeOrdersPerMonth, plan.limits.maxNativeOrdersPerMonth)),
  };
  const contractedFeatures = { ...plan.features };
  const overrides = stored?.customFeatures || {};
  FEATURE_KEYS.forEach((key) => {
    if (typeof overrides[key] === "boolean") contractedFeatures[key] = overrides[key] as boolean;
  });

  const status: SubscriptionStatus = stored ? (normalizeStatus(stored.status) as SubscriptionStatus) : "trialing";
  const created = toDate(context.createdAt);
  const trialEnds = stored ? toDate(stored.trialEndsAt) : created ? new Date(created.getTime() + TRIAL_DAYS * DAY) : null;
  const periodEnd = toDate(stored?.currentPeriodEnd) || toDate(stored?.nextPaymentDate);

  let valid = true;
  let reason: AccessReason = "ok";
  let accessUntil: string | null = null;
  if (context.restaurantStatus === "suspended" || status === "suspended") {
    valid = false;
    reason = "suspended";
  } else if (!stored && !created) {
    valid = false;
    reason = "no_subscription";
  } else if (status === "trialing") {
    accessUntil = trialEnds ? trialEnds.toISOString() : null;
    if (trialEnds && trialEnds.getTime() < now) {
      valid = false;
      reason = "trial_ended";
    }
  } else if (status === "past_due") {
    const since = toDate(stored?.lateSince);
    const graceEnd = since ? since.getTime() + GRACE_PERIOD_DAYS * DAY : null;
    accessUntil = graceEnd ? new Date(graceEnd).toISOString() : null;
    if (graceEnd !== null && graceEnd < now) {
      valid = false;
      reason = "grace_over";
    }
  } else if (status === "canceled") {
    accessUntil = periodEnd ? periodEnd.toISOString() : null;
    if (!periodEnd || periodEnd.getTime() < now) {
      valid = false;
      reason = "period_over";
    }
  } else if (status === "expired") {
    valid = false;
    reason = "expired";
  } else if (status === "active" && stored?.cancelAtPeriodEnd) {
    accessUntil = periodEnd ? periodEnd.toISOString() : null;
    if (periodEnd && periodEnd.getTime() < now) {
      valid = false;
      reason = "period_over";
    }
  }

  const scheduledPlan = stored?.scheduledChange?.planId;
  return {
    planId,
    planName: plan.name,
    planVersion: stored?.planVersion || (stored ? 1 : CATALOG_VERSION),
    status,
    valid,
    reason,
    implicitTrial: !stored,
    legacy,
    trialEndsAt: status === "trialing" && trialEnds ? trialEnds.toISOString() : null,
    accessUntil,
    nextPaymentDate: status === "active" || status === "past_due" ? iso(stored?.nextPaymentDate || stored?.currentPeriodEnd) : null,
    cancelAtPeriodEnd: Boolean(stored?.cancelAtPeriodEnd),
    scheduledChange: isPlanId(scheduledPlan) ? { planId: scheduledPlan, effectiveAt: iso(stored?.scheduledChange?.effectiveAt) } : null,
    priceInCents: typeof stored?.priceCents === "number" && stored.priceCents > 0 ? stored.priceCents : stored ? plan.priceInCents : null,
    limits: valid ? contractedLimits : FALLBACK.limits,
    features: valid ? contractedFeatures : { ...FALLBACK.features },
    contracted: { limits: contractedLimits, features: contractedFeatures },
  };
}

// ───────────────────────── Limites ─────────────────────────

/** Mesa nova cabe no plano? `existing` = mesas já cadastradas. */
export function tablesAllowed(entitlements: Pick<Entitlements, "limits">, existing: number, requested = 1) {
  const limit = entitlements.limits.maxTables;
  return limit === null || existing + requested <= limit;
}

export type QuotaLevel = "ok" | "warn70" | "warn90" | "full" | "unavailable";

/** Situação da franquia de pedidos próprios: avisos aos 70%, 90% e 100%. */
export function orderQuota(used: number, limit: number | null) {
  const safeUsed = Math.max(0, Math.floor(Number(used) || 0));
  if (limit === null) return { used: safeUsed, limit, remaining: null as number | null, percent: 0, level: "ok" as QuotaLevel, blocked: false };
  if (limit === 0) return { used: safeUsed, limit, remaining: 0, percent: 100, level: "unavailable" as QuotaLevel, blocked: true };
  const ratio = safeUsed / limit;
  const level: QuotaLevel = ratio >= 1 ? "full" : ratio >= 0.9 ? "warn90" : ratio >= 0.7 ? "warn70" : "ok";
  return { used: safeUsed, limit, remaining: Math.max(0, limit - safeUsed), percent: Math.min(100, Math.round(ratio * 100)), level, blocked: ratio >= 1 };
}

// ───────────────────────── Período mensal (America/Sao_Paulo) ─────────────────────────

export const BILLING_TIME_ZONE = "America/Sao_Paulo";

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") % 24, minute: get("minute"), second: get("second") };
}

/** Diferença entre o relógio local do fuso e o UTC naquele instante (ms). */
function zoneOffset(instant: number, timeZone: string) {
  const p = zonedParts(new Date(instant), timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(instant / 1000) * 1000;
}

/** Instante UTC da meia-noite do dia 1 do mês, no fuso informado. */
function monthStart(year: number, month: number, timeZone: string) {
  const guess = Date.UTC(year, month - 1, 1);
  const first = guess - zoneOffset(guess, timeZone);
  return guess - zoneOffset(first, timeZone);
}

/**
 * Mês de calendário do consumo (ex.: "2026-10"), no fuso de São Paulo. Cada mês tem o próprio documento de uso:
 * a franquia "renova" sozinha na virada, sem tarefa agendada, e o histórico fica preservado.
 */
export function usagePeriod(now: Date | number = Date.now()) {
  const instant = typeof now === "number" ? now : now.getTime();
  const { year, month } = zonedParts(new Date(instant), BILLING_TIME_ZONE);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    periodId: `${year}-${String(month).padStart(2, "0")}`,
    start: new Date(monthStart(year, month, BILLING_TIME_ZONE)).toISOString(),
    end: new Date(monthStart(nextYear, nextMonth, BILLING_TIME_ZONE)).toISOString(),
  };
}

export const isPeriodId = (value: unknown): value is string => typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

// ───────────────────────── Origem dos pedidos ─────────────────────────

export const NATIVE_ORDER_SOURCES = ["kardap_pdv", "kardap_table", "kardap_delivery", "kardap_pickup", "kardap_staff"] as const;
export const EXTERNAL_ORDER_SOURCES = ["ifood", "99food", "external_marketplace"] as const;
export type NativeOrderSource = (typeof NATIVE_ORDER_SOURCES)[number];
export type ExternalOrderSource = (typeof EXTERNAL_ORDER_SOURCES)[number];
export type OrderSource = NativeOrderSource | ExternalOrderSource;

export interface OrderOrigin {
  source: OrderSource;
  provider?: string;
  externalOrderId?: string;
  isNativeOrder: boolean;
}

export const isNativeSource = (value: unknown): value is NativeOrderSource => (NATIVE_ORDER_SOURCES as readonly string[]).indexOf(String(value)) >= 0;
export const isExternalSource = (value: unknown): value is ExternalOrderSource => (EXTERNAL_ORDER_SOURCES as readonly string[]).indexOf(String(value)) >= 0;

// ───────────────────────── Papéis da equipe ─────────────────────────

/**
 * Permissões gravadas em restaurantes/{id}/membros/{uid}.permissions. "*" (ou papel owner) libera tudo.
 * "pdv" libera a operação do salão e do balcão, mas não finanças, relatórios, configurações nem assinatura.
 */
const PERMISSION_FEATURES: Record<string, FeatureKey[]> = {
  pdv: ["pdvAccess", "orderManagement", "cashRegister", "inventory", "deliveryManagement", "courierManagement"],
  pedidos: ["orderManagement"],
  caixa: ["cashRegister"],
  estoque: ["inventory"],
  entregas: ["deliveryManagement", "courierManagement"],
  financeiro: ["financialManagement"],
  relatorios: ["reports"],
  promocoes: ["promotions"],
  integracoes: ["marketplaceIntegrations"],
};

export type MemberAccess = { isOwner: boolean; role?: string; permissions?: unknown[]; active?: boolean } | null;

/** O papel da pessoa permite este recurso? (O plano é conferido à parte.) */
export function roleAllows(member: MemberAccess, feature: FeatureKey | "billing" | "settings"): boolean {
  if (!member) return false;
  if (member.isOwner) return true;
  if (member.active === false) return false;
  const permissions = Array.isArray(member.permissions) ? member.permissions.map(String) : [];
  if (member.role === "owner" || permissions.indexOf("*") >= 0) return true;
  if (feature === "billing") return permissions.indexOf("assinatura") >= 0;
  if (feature === "settings") return permissions.indexOf("configuracoes") >= 0;
  if (feature === "videoMenu" || feature === "qrCode" || feature === "waiterCall") return true;
  return permissions.some((p) => (PERMISSION_FEATURES[p] || []).indexOf(feature) >= 0);
}
