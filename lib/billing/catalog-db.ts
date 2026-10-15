/**
 * Overrides do catálogo guardados no Firestore (coleção `catalogoPlanos/{id}`). O código em `plans.ts` continua
 * sendo a fonte dos defaults: se um plano não tem override, cai no `PLAN_CATALOG`. Esta separação deixa o painel
 * administrativo mexer em preço, nome, descrição e visibilidade sem precisar de deploy, mantendo intactos os
 * limites e features que o servidor usa para controle de acesso real (mudança nesses dois exige revisão técnica).
 *
 * Campos aceitos como override: `priceInCents`, `name`, `tagline`, `description`, `highlights`, `popular`,
 * `active`, `isPublic`, `salesOnly`, `trialDays`, `sortOrder`, `ctaLabel`.
 */
import { PLAN_CATALOG, PLAN_ORDER, type PlanDefinition, type PlanId, isPlanId, SELF_SERVICE_TRIAL_DAYS } from "./plans";

export type PlanOverride = {
  priceInCents?: number | null;
  name?: string;
  tagline?: string;
  description?: string;
  highlights?: string[];
  popular?: boolean;
  active?: boolean;
  /** Visível na página pública de preços. */
  isPublic?: boolean;
  salesOnly?: boolean;
  /** Dias do teste grátis específico deste plano (padrão: SELF_SERVICE_TRIAL_DAYS). */
  trialDays?: number;
  sortOrder?: number;
  ctaLabel?: string;
  updatedAt?: string;
  updatedBy?: string;
};

export type ResolvedPlan = PlanDefinition & {
  isPublic: boolean;
  trialDays: number;
  sortOrder: number;
  ctaLabel: string;
};

export type ResolvedCatalog = Record<PlanId, ResolvedPlan>;

/** Garante o shape de um override vindo do Firestore, descartando campos desconhecidos ou com tipo inválido. */
export function sanitizeOverride(value: unknown): PlanOverride {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const out: PlanOverride = {};
  if (raw.priceInCents === null) out.priceInCents = null;
  else if (typeof raw.priceInCents === "number" && Number.isInteger(raw.priceInCents) && raw.priceInCents >= 0) out.priceInCents = raw.priceInCents;
  if (typeof raw.name === "string" && raw.name.trim().length > 0 && raw.name.length <= 80) out.name = raw.name.trim();
  if (typeof raw.tagline === "string" && raw.tagline.length <= 200) out.tagline = raw.tagline.trim();
  if (typeof raw.description === "string" && raw.description.length <= 500) out.description = raw.description.trim();
  if (Array.isArray(raw.highlights)) {
    const items = raw.highlights.filter((item): item is string => typeof item === "string" && item.length > 0 && item.length <= 200).slice(0, 20);
    if (items.length > 0) out.highlights = items;
  }
  if (typeof raw.popular === "boolean") out.popular = raw.popular;
  if (typeof raw.active === "boolean") out.active = raw.active;
  if (typeof raw.isPublic === "boolean") out.isPublic = raw.isPublic;
  if (typeof raw.salesOnly === "boolean") out.salesOnly = raw.salesOnly;
  if (typeof raw.trialDays === "number" && Number.isInteger(raw.trialDays) && raw.trialDays >= 0 && raw.trialDays <= 90) out.trialDays = raw.trialDays;
  if (typeof raw.sortOrder === "number" && Number.isInteger(raw.sortOrder) && raw.sortOrder >= 0 && raw.sortOrder < 1000) out.sortOrder = raw.sortOrder;
  if (typeof raw.ctaLabel === "string" && raw.ctaLabel.length <= 60) out.ctaLabel = raw.ctaLabel.trim();
  if (typeof raw.updatedAt === "string" && raw.updatedAt.length <= 64) out.updatedAt = raw.updatedAt;
  if (typeof raw.updatedBy === "string" && raw.updatedBy.length <= 128) out.updatedBy = raw.updatedBy;
  return out;
}

/** Aplica um override ao plano base. Normaliza "mais popular" quem chama (um por vez; ver resolveCatalog). */
export function mergePlan(base: PlanDefinition, override: PlanOverride | undefined): ResolvedPlan {
  const o = override || {};
  const price = o.priceInCents === null ? null : typeof o.priceInCents === "number" ? o.priceInCents : base.priceInCents;
  return {
    ...base,
    priceInCents: price,
    name: o.name || base.name,
    tagline: o.tagline || base.tagline,
    description: o.description || base.description,
    highlights: Array.isArray(o.highlights) && o.highlights.length > 0 ? o.highlights : base.highlights,
    popular: typeof o.popular === "boolean" ? o.popular : base.popular,
    active: typeof o.active === "boolean" ? o.active : base.active,
    salesOnly: typeof o.salesOnly === "boolean" ? o.salesOnly : base.salesOnly,
    isPublic: typeof o.isPublic === "boolean" ? o.isPublic : true,
    trialDays: typeof o.trialDays === "number" ? o.trialDays : SELF_SERVICE_TRIAL_DAYS,
    sortOrder: typeof o.sortOrder === "number" ? o.sortOrder : PLAN_ORDER.indexOf(base.id),
    ctaLabel: o.ctaLabel || (base.salesOnly ? "Falar com vendas" : "Começar teste grátis"),
  };
}

/**
 * Monta o catálogo final a partir dos overrides. Garante que no máximo um plano fique como "popular" — se mais de
 * um override tentar marcar, o de menor `sortOrder` ganha (prevenção à prova de corrida; o endpoint PUT também
 * tenta deixar transacional, mas aqui há uma rede de segurança para quem lê).
 */
export function resolveCatalog(overrides: Partial<Record<PlanId, PlanOverride>>): ResolvedCatalog {
  const resolved = PLAN_ORDER.reduce((acc, id) => {
    acc[id] = mergePlan(PLAN_CATALOG[id], overrides[id]);
    return acc;
  }, {} as ResolvedCatalog);
  const populars = PLAN_ORDER.filter((id) => resolved[id].popular).sort((a, b) => resolved[a].sortOrder - resolved[b].sortOrder);
  if (populars.length > 1) {
    for (let i = 1; i < populars.length; i++) resolved[populars[i]].popular = false;
  }
  return resolved;
}

/** Catálogo público: só planos ativos e visíveis, ordenados por `sortOrder` depois `PLAN_ORDER`. */
export function publicCatalog(resolved: ResolvedCatalog): ResolvedPlan[] {
  return PLAN_ORDER
    .map((id) => resolved[id])
    .filter((plan) => plan.active && plan.isPublic)
    .sort((a, b) => a.sortOrder - b.sortOrder || PLAN_ORDER.indexOf(a.id) - PLAN_ORDER.indexOf(b.id));
}

export function isValidPlanId(value: unknown): value is PlanId {
  return isPlanId(value);
}
