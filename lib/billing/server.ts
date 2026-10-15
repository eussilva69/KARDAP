/**
 * Serviço central de planos (somente servidor, Admin SDK): a única fonte de verdade para o KARDAP e o PDV.
 * Toda operação limitada pelo plano passa por aqui, dentro de transação:
 *  - mesas: o limite é conferido lendo as mesas na mesma transação que cria a nova (duas criações ao mesmo tempo
 *    não passam do limite: a segunda é refeita e vê a primeira);
 *  - pedidos próprios: confirmação e contador do mês mudam juntos; o id do pedido torna a confirmação idempotente;
 *  - pedidos de marketplaces: gravados sem tocar no contador e nunca bloqueados pela franquia.
 * Estrutura de dados e fluxos: docs/PLANOS.md.
 */
import { createHash, randomUUID } from "node:crypto";
import { FieldValue, type DocumentSnapshot, type Firestore } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import {
  CATALOG_VERSION,
  PLAN_CATALOG,
  isExternalSource,
  isNativeSource,
  isPlanId,
  isSelfServiceTrialPlan,
  orderQuota,
  SELF_SERVICE_TRIAL_DAYS,
  resolveEntitlements,
  roleAllows,
  shortPlanName,
  usagePeriod,
  type Entitlements,
  type ExternalOrderSource,
  type FeatureKey,
  type MemberAccess,
  type NativeOrderSource,
  type PlanId,
  type StoredSubscription,
} from "./plans";

export class BillingError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

const restaurantRef = (db: Firestore, id: string) => db.collection("restaurantes").doc(id);
const validId = (value: unknown, max = 128): value is string => typeof value === "string" && /^[A-Za-z0-9_-]+$/.test(value) && value.length <= max;

export function entitlementsFrom(snap: DocumentSnapshot, now = Date.now()): Entitlements {
  const data = snap.data() || {};
  return resolveEntitlements(data.subscription as StoredSubscription, { createdAt: data.createdAt, restaurantStatus: data.status, now });
}

async function restaurantSnapshot(restaurantId: string) {
  if (!validId(restaurantId)) throw new BillingError("invalid_restaurant", 400, "Estabelecimento inválido.");
  const snap = await restaurantRef(adminDb(), restaurantId).get();
  if (!snap.exists) throw new BillingError("not_found", 404, "Estabelecimento não encontrado.");
  return snap;
}

export async function getSubscriptionEntitlements(restaurantId: string) {
  return entitlementsFrom(await restaurantSnapshot(restaurantId));
}

/** Dono, ou membro com papel e permissões (restaurantes/{id}/membros/{uid}). null = sem vínculo. */
export async function memberAccess(restaurantId: string, uid: string, snap?: DocumentSnapshot): Promise<MemberAccess> {
  const restaurant = snap || (await restaurantSnapshot(restaurantId));
  if (restaurant.get("ownerId") === uid) return { isOwner: true, role: "owner", active: true };
  const member = await restaurant.ref.collection("membros").doc(uid).get();
  if (!member.exists) return null;
  const data = member.data() || {};
  return { isOwner: false, role: String(data.role || "member"), permissions: Array.isArray(data.permissions) ? data.permissions : [], active: data.active !== false };
}

export type AccessDecision = { allowed: boolean; reason: "ok" | "not_member" | "role" | "subscription" | "plan"; entitlements: Entitlements; member: MemberAccess };

/**
 * Acesso efetivo = assinatura válida + recurso no plano + papel autorizado + estabelecimento certo.
 * "subscription": assinatura vencida/suspensa; "plan": o plano não inclui; "role": a pessoa não tem a permissão.
 */
export async function canAccessFeature(restaurantId: string, uid: string, feature: FeatureKey): Promise<AccessDecision> {
  const snap = await restaurantSnapshot(restaurantId);
  const entitlements = entitlementsFrom(snap);
  const member = await memberAccess(restaurantId, uid, snap);
  if (!member || (!member.isOwner && member.active === false)) return { allowed: false, reason: "not_member", entitlements, member };
  if (!entitlements.valid && entitlements.contracted.features[feature]) return { allowed: false, reason: "subscription", entitlements, member };
  if (!entitlements.features[feature]) return { allowed: false, reason: "plan", entitlements, member };
  if (!roleAllows(member, feature)) return { allowed: false, reason: "role", entitlements, member };
  return { allowed: true, reason: "ok", entitlements, member };
}

const DENIED: Record<Exclude<AccessDecision["reason"], "ok">, (feature: string) => [number, string]> = {
  not_member: () => [403, "Você não faz parte da equipe deste estabelecimento."],
  role: () => [403, "Seu usuário não tem permissão para esta operação. Fale com o responsável pelo estabelecimento."],
  subscription: () => [402, "A assinatura do estabelecimento não está ativa. Regularize em Meu Plano para continuar."],
  plan: (feature) => [402, feature === "pdvAccess" ? "O PDV está disponível a partir do plano Pro." : "Este recurso não faz parte do plano atual."],
};

export async function requireFeature(restaurantId: string, uid: string, feature: FeatureKey) {
  const decision = await canAccessFeature(restaurantId, uid, feature);
  if (!decision.allowed) {
    const [status, message] = DENIED[decision.reason as Exclude<AccessDecision["reason"], "ok">](feature);
    throw new BillingError(decision.reason === "plan" ? "plan_required" : decision.reason, status, message, { feature, planId: decision.entitlements.planId });
  }
  return decision;
}

/** Só para quem administra o estabelecimento: dono ou permissão "*"/"assinatura" (cobrança) ou "configuracoes". */
export async function requireManager(restaurantId: string, uid: string, area: "billing" | "settings") {
  const snap = await restaurantSnapshot(restaurantId);
  const member = await memberAccess(restaurantId, uid, snap);
  if (!member || !roleAllows(member, area)) {
    throw new BillingError("forbidden", 403, area === "billing" ? "Apenas o responsável pelo estabelecimento gerencia a assinatura." : "Seu usuário não pode alterar as configurações deste estabelecimento.");
  }
  return { snap, member, entitlements: entitlementsFrom(snap) };
}

// ───────────────────────── Uso do mês ─────────────────────────

export type UsageSummary = { periodId: string; periodStart: string; periodEnd: string; nativeOrdersUsed: number; nativeOrdersLimit: number | null; remaining: number | null; level: string; blocked: boolean };

export async function monthlyUsage(restaurantId: string, entitlements?: Entitlements, now = Date.now()): Promise<UsageSummary> {
  const db = adminDb();
  const period = usagePeriod(now);
  const [snap, plan] = await Promise.all([restaurantRef(db, restaurantId).collection("uso").doc(period.periodId).get(), entitlements ? Promise.resolve(entitlements) : getSubscriptionEntitlements(restaurantId)]);
  const used = Number(snap.get("nativeOrdersUsed")) || 0;
  const quota = orderQuota(used, plan.limits.maxNativeOrdersPerMonth);
  return { periodId: period.periodId, periodStart: period.start, periodEnd: period.end, nativeOrdersUsed: used, nativeOrdersLimit: quota.limit, remaining: quota.remaining, level: quota.level, blocked: quota.blocked };
}

/** Limite de um recurso agora (sem reservar nada; a reserva acontece na transação de cada operação). */
export async function checkPlanLimit(restaurantId: string, resource: "tables" | "nativeOrders", requestedAmount = 1) {
  const snap = await restaurantSnapshot(restaurantId);
  const entitlements = entitlementsFrom(snap);
  if (resource === "tables") {
    const used = (await snap.ref.collection("mesas").count().get()).data().count;
    const limit = entitlements.limits.maxTables;
    return { allowed: limit === null || used + requestedAmount <= limit, limit, used, remaining: limit === null ? null : Math.max(0, limit - used) };
  }
  const usage = await monthlyUsage(restaurantId, entitlements);
  const limit = usage.nativeOrdersLimit;
  return { allowed: limit === null || usage.nativeOrdersUsed + requestedAmount <= limit, limit, used: usage.nativeOrdersUsed, remaining: usage.remaining };
}

// ───────────────────────── Mesas ─────────────────────────

export type CreatedTable = { id: string; number: number; name: string; qrToken: string };

const tableLimitMessage = (limit: number) =>
  limit === 8
    ? "Você atingiu o limite de oito mesas do seu plano. Faça upgrade para cadastrar mesas ilimitadas."
    : `Você atingiu o limite de ${limit} mesas do seu plano. Faça upgrade para cadastrar mais mesas.`;

/**
 * Cria mesas respeitando o limite do plano. `name`: uma mesa (próximo número); `quantity`: numeração 1..N da
 * configuração inicial (pula números que já existem). Todas ou nenhuma.
 */
export async function createTables(restaurantId: string, uid: string, input: { name?: string; quantity?: number }): Promise<CreatedTable[]> {
  await requireManager(restaurantId, uid, "settings");
  const db = adminDb();
  const ref = restaurantRef(db, restaurantId);
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 40) : "";
  const quantity = input.quantity === undefined ? null : Number(input.quantity);
  if (quantity !== null && (!Number.isInteger(quantity) || quantity < 0 || quantity > 200)) throw new BillingError("invalid_quantity", 400, "Informe entre 0 e 200 mesas.");

  return db.runTransaction(async (tx) => {
    const [restaurant, existing] = await Promise.all([tx.get(ref), tx.get(ref.collection("mesas").select("number", "name"))]);
    if (!restaurant.exists) throw new BillingError("not_found", 404, "Estabelecimento não encontrado.");
    const entitlements = entitlementsFrom(restaurant);
    const numbers = new Set(existing.docs.map((d) => Number(d.get("number")) || 0));
    const names = new Set(existing.docs.map((d) => String(d.get("name") || "").toLowerCase()));
    const planned: { number: number; name: string }[] = [];
    if (quantity !== null) {
      for (let n = 1; n <= quantity; n += 1) if (!numbers.has(n)) planned.push({ number: n, name: `Mesa ${String(n).padStart(2, "0")}` });
    } else {
      const next = Math.max(0, ...Array.from(numbers)) + 1;
      const tableName = name || `Mesa ${String(next).padStart(2, "0")}`;
      if (names.has(tableName.toLowerCase())) throw new BillingError("duplicate", 409, "Essa mesa já existe.");
      planned.push({ number: next, name: tableName });
    }
    const limit = entitlements.limits.maxTables;
    if (limit !== null && existing.size + planned.length > limit) {
      throw new BillingError("table_limit", 403, tableLimitMessage(limit), { limit, used: existing.size, requested: planned.length, planId: entitlements.planId });
    }
    const now = new Date().toISOString();
    return planned.map((table) => {
      const id = `mesa-${String(table.number).padStart(3, "0")}`;
      const qrToken = randomUUID();
      tx.create(ref.collection("mesas").doc(id), { id, restaurantId, number: table.number, name: table.name, capacity: 4, status: "livre", qrToken, createdAt: now, createdBy: uid });
      return { id, number: table.number, name: table.name, qrToken };
    });
  });
}

// ───────────────────────── Pedidos ─────────────────────────

/** Campos que só o servidor grava num pedido (origem, consumo da franquia, confirmação). */
const RESERVED_ORDER_FIELDS = ["origin", "quota", "confirmedAt", "confirmedBy", "establishmentId", "isNativeOrder", "source"];

function sanitizeOrder(order: unknown): Record<string, unknown> {
  if (!order || typeof order !== "object" || Array.isArray(order)) return {};
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(order as Record<string, unknown>)) {
    if (RESERVED_ORDER_FIELDS.indexOf(key) >= 0 || key.startsWith("__")) continue;
    clean[key] = value;
  }
  if (JSON.stringify(clean).length > 50_000) throw new BillingError("order_too_large", 413, "Pedido grande demais.");
  return clean;
}

/** Id do pedido: o informado pelo PDV ou derivado da chave de idempotência (reenvio = mesmo pedido). */
function orderDocId(orderId: unknown, idempotencyKey: unknown, prefix: string) {
  if (orderId !== undefined && orderId !== null && orderId !== "") {
    if (!validId(orderId, 64)) throw new BillingError("invalid_order_id", 400, "Identificador do pedido inválido.");
    return orderId;
  }
  if (typeof idempotencyKey !== "string" || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    throw new BillingError("idempotency_required", 400, "Informe o identificador do pedido ou uma chave de idempotência.");
  }
  return `${prefix}_${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 32)}`;
}

export const quotaMessage = (used: number, limit: number) =>
  limit === 0
    ? "Seu plano não inclui pedidos próprios pelo KARDAP. Faça upgrade para o Pro para receber pedidos pelo PDV."
    : `Você utilizou ${used} de ${limit} pedidos neste mês. Seu limite de pedidos próprios foi atingido. Faça upgrade para continuar recebendo novos pedidos diretamente pelo KARDAP.`;

export type ConfirmResult = { orderId: string; duplicate: boolean; usage: { periodId: string; used: number; limit: number | null; remaining: number | null; level: string } };

/**
 * Confirma um pedido PRÓPRIO (PDV, mesa, delivery, retirada, equipe): consome 1 da franquia do mês, na mesma
 * transação que grava a confirmação. Reenvio do mesmo pedido não consome de novo. Rascunhos não passam por aqui.
 */
export async function confirmNativeOrder(input: {
  restaurantId: string;
  uid: string;
  source: unknown;
  orderId?: unknown;
  idempotencyKey?: unknown;
  order?: unknown;
  now?: number;
}): Promise<ConfirmResult> {
  if (!isNativeSource(input.source)) throw new BillingError("invalid_source", 400, "Origem do pedido inválida para um pedido próprio.");
  const source: NativeOrderSource = input.source;
  await requireFeature(input.restaurantId, input.uid, "orderManagement").catch((error) => {
    // Plano sem pedidos próprios (Start): mensagem da franquia, que é o que a pessoa vê no PDV.
    if (error instanceof BillingError && error.code === "plan_required") throw new BillingError("quota_exceeded", 402, quotaMessage(0, 0), { used: 0, limit: 0 });
    throw error;
  });
  const id = orderDocId(input.orderId, input.idempotencyKey, "n");
  const data = sanitizeOrder(input.order);
  const db = adminDb();
  const ref = restaurantRef(db, input.restaurantId);
  const orderRef = ref.collection("pedidos").doc(id);

  return db.runTransaction(
    async (tx) => {
      const now = input.now ?? Date.now();
      const period = usagePeriod(now);
      const usageRef = ref.collection("uso").doc(period.periodId);
      const [restaurant, existing, usage] = await Promise.all([tx.get(ref), tx.get(orderRef), tx.get(usageRef)]);
      if (!restaurant.exists) throw new BillingError("not_found", 404, "Estabelecimento não encontrado.");
      const entitlements = entitlementsFrom(restaurant, now);
      const used = Number(usage.get("nativeOrdersUsed")) || 0;
      const limit = entitlements.limits.maxNativeOrdersPerMonth;

      if (existing.exists && existing.get("quota.consumed") === true) {
        const quota = orderQuota(used, limit);
        return { orderId: id, duplicate: true, usage: { periodId: period.periodId, used, limit, remaining: quota.remaining, level: quota.level } };
      }
      if (existing.exists && existing.get("origin.isNativeOrder") === false) {
        throw new BillingError("external_order", 409, "Pedido de marketplace não consome a franquia e não pode ser confirmado como pedido próprio.");
      }
      if (!entitlements.valid) throw new BillingError("subscription", 402, "A assinatura do estabelecimento não está ativa. Regularize em Meu Plano para continuar.");
      if (!entitlements.features.orderManagement) throw new BillingError("quota_exceeded", 402, quotaMessage(0, 0), { used, limit: 0 });
      const quota = orderQuota(used, limit);
      if (quota.blocked) throw new BillingError("quota_exceeded", 402, quotaMessage(used, limit ?? 0), { used, limit, periodId: period.periodId });

      const at = new Date(now).toISOString();
      const status = typeof data.status === "string" && data.status && data.status !== "rascunho" && data.status.length <= 40 ? data.status : "confirmado";
      tx.set(
        orderRef,
        {
          ...data,
          status,
          establishmentId: input.restaurantId,
          origin: { source, isNativeOrder: true },
          quota: { consumed: true, periodId: period.periodId, consumedAt: at },
          confirmedAt: at,
          confirmedBy: input.uid,
          updatedAt: at,
          ...(existing.exists ? {} : { createdAt: at }),
        },
        { merge: true },
      );
      tx.set(
        usageRef,
        { establishmentId: input.restaurantId, periodId: period.periodId, nativeOrdersUsed: used + 1, nativeOrdersLimit: limit, periodStart: period.start, periodEnd: period.end, updatedAt: at },
        { merge: true },
      );
      // Trilha de auditoria do consumo (um por pedido: o id do pedido torna o registro idempotente).
      tx.set(ref.collection("eventosUso").doc(id), { type: "native_order_confirmed", orderId: id, source, periodId: period.periodId, usedAfter: used + 1, limit, uid: input.uid, at });
      const after = orderQuota(used + 1, limit);
      return { orderId: id, duplicate: false, usage: { periodId: period.periodId, used: used + 1, limit, remaining: after.remaining, level: after.level } };
    },
    { maxAttempts: 25 },
  );
}

/**
 * Pedido de marketplace (iFood, 99Food, outros): grava ou atualiza sem tocar na franquia e sem depender dela.
 * O id vem do marketplace, então reenvios e atualizações caem no mesmo documento.
 */
export async function recordExternalOrder(input: { restaurantId: string; provider: unknown; externalOrderId: unknown; order?: unknown; providerName?: unknown }) {
  if (!isExternalSource(input.provider)) throw new BillingError("invalid_source", 400, "Origem de marketplace inválida.");
  const provider: ExternalOrderSource = input.provider;
  const externalId = typeof input.externalOrderId === "string" ? input.externalOrderId.trim() : "";
  if (!externalId || externalId.length > 120) throw new BillingError("invalid_order_id", 400, "Identificador do pedido no marketplace inválido.");
  await restaurantSnapshot(input.restaurantId);
  const data = sanitizeOrder(input.order);
  const db = adminDb();
  const id = `${provider}_${createHash("sha256").update(externalId).digest("hex").slice(0, 32)}`;
  const orderRef = restaurantRef(db, input.restaurantId).collection("pedidos").doc(id);
  return db.runTransaction(async (tx) => {
    const existing = await tx.get(orderRef);
    if (existing.exists && existing.get("origin.isNativeOrder") === true) throw new BillingError("conflict", 409, "Conflito de identificador de pedido.");
    const at = new Date().toISOString();
    const providerName = typeof input.providerName === "string" ? input.providerName.slice(0, 60) : undefined;
    tx.set(
      orderRef,
      {
        ...data,
        status: typeof data.status === "string" && data.status ? data.status.slice(0, 40) : existing.get("status") || "recebido",
        establishmentId: input.restaurantId,
        origin: { source: provider, isNativeOrder: false, externalOrderId: externalId, ...(providerName ? { provider: providerName } : {}) },
        updatedAt: at,
        ...(existing.exists ? {} : { createdAt: at }),
      },
      { merge: true },
    );
    return { orderId: id, created: !existing.exists };
  });
}

/** Confere o contador do mês com os pedidos confirmados (auditoria). `apply` corrige, com registro. */
export async function reconcileUsage(restaurantId: string, periodId: string, actor: { uid: string; email?: string } | null, apply = false) {
  const db = adminDb();
  const ref = restaurantRef(db, restaurantId);
  const [counted, usage] = await Promise.all([
    ref.collection("pedidos").where("quota.periodId", "==", periodId).where("quota.consumed", "==", true).count().get(),
    ref.collection("uso").doc(periodId).get(),
  ]);
  const confirmed = counted.data().count;
  const recorded = Number(usage.get("nativeOrdersUsed")) || 0;
  if (apply && confirmed !== recorded) {
    const at = new Date().toISOString();
    await db.runTransaction(async (tx) => {
      tx.set(ref.collection("uso").doc(periodId), { establishmentId: restaurantId, periodId, nativeOrdersUsed: confirmed, updatedAt: at, reconciledAt: at }, { merge: true });
      tx.set(ref.collection("eventosUso").doc(`reconciliacao-${periodId}-${Date.now()}`), { type: "reconciliation", periodId, before: recorded, after: confirmed, uid: actor?.uid || null, email: actor?.email || null, at });
    });
  }
  return { periodId, recorded, confirmed, consistent: confirmed === recorded, applied: apply && confirmed !== recorded };
}

// ───────────────────────── Assinatura (somente servidor) ─────────────────────────

export type Actor = { kind: "webhook" | "admin" | "owner" | "migration" | "system"; uid?: string | null; email?: string | null };

/**
 * Altera a assinatura gravada em restaurantes/{id}.subscription, com registro em eventosAssinatura (antes, depois,
 * quem, quando, motivo). Campos ausentes no patch ficam como estão; null apaga.
 */
export async function applySubscriptionChange(restaurantId: string, patch: Partial<StoredSubscription>, actor: Actor, reason: string, eventId?: string) {
  const db = adminDb();
  const ref = restaurantRef(db, restaurantId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new BillingError("not_found", 404, "Estabelecimento não encontrado.");
    const before = (snap.get("subscription") as StoredSubscription | undefined) || null;
    const at = new Date().toISOString();
    const after: StoredSubscription = { ...(before || {}), ...patch, updatedAt: at };
    if (!before?.createdAt) after.createdAt = at;
    // Dados de cartão nunca ficam no documento público (versões antigas gravavam ali).
    delete after.cardBrand;
    delete after.cardLastDigits;
    Object.keys(after).forEach((key) => after[key] === undefined && delete after[key]);
    if (after.planId && !patch.planName) after.planName = shortPlanName(after.planId);
    tx.update(ref, { subscription: after, updatedAt: at });
    tx.set(ref.collection("eventosAssinatura").doc(eventId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`), {
      type: "subscription_change",
      before: before ? withoutCard(before) : null,
      after,
      actor: { kind: actor.kind, uid: actor.uid || null, email: actor.email || null },
      reason: String(reason || "").slice(0, 500),
      at,
    });
    return { before, after };
  });
}

function withoutCard(subscription: StoredSubscription): StoredSubscription {
  const copy = { ...subscription };
  delete copy.cardBrand;
  delete copy.cardLastDigits;
  return copy;
}

// ───────────────────────── Teste grátis de 30 dias (escolha de plano no cadastro) ─────────────────────────

export type TrialResult = { activated: boolean; planId: PlanId; trialEndsAt: string };

/**
 * Ativa o teste grátis de 30 dias do plano escolhido no cadastro, só depois que o onboarding termina com sucesso
 * (quem chama decide isso: esta função não sabe se o onboarding acabou, só grava a assinatura).
 *
 * Elegibilidade e segurança, tudo conferido aqui dentro da mesma transação:
 *  - só o dono do estabelecimento aciona;
 *  - cada estabelecimento tem direito a um teste só (marcado em `trialActivatedAt`, que nunca é apagado, mesmo
 *    depois que a assinatura muda de plano, vence ou é cancelada — por isso não basta olhar `subscription`);
 *  - cada CONTA (uid) também tem direito a um teste só, mesmo criando outro estabelecimento (`usuarios/{uid}`);
 *  - idempotente: chamar de novo para o mesmo estabelecimento não estende nem reinicia o prazo, só confirma o que
 *    já está valendo (protege contra duplo clique e contra a mesma chamada repetida depois de uma falha de rede);
 *  - a data de início e término são calculadas aqui, no servidor; o navegador nunca manda uma data.
 */
export async function activateSelfServiceTrial(restaurantId: string, uid: string, planId: unknown): Promise<TrialResult> {
  if (!isSelfServiceTrialPlan(planId)) throw new BillingError("invalid_plan", 400, "Escolha um dos planos para testar (o Enterprise é por proposta comercial).");
  const db = adminDb();
  const ref = restaurantRef(db, restaurantId);
  const userRef = db.collection("usuarios").doc(uid);

  return db.runTransaction(async (tx) => {
    const [restaurant, userDoc] = await Promise.all([tx.get(ref), tx.get(userRef)]);
    if (!restaurant.exists) throw new BillingError("not_found", 404, "Estabelecimento não encontrado.");
    if (restaurant.get("ownerId") !== uid) throw new BillingError("forbidden", 403, "Só o responsável pelo estabelecimento pode ativar o teste grátis.");

    const alreadyOnThisRestaurant = restaurant.get("trialActivatedAt");
    const existing = restaurant.get("subscription") as StoredSubscription | undefined;
    if (alreadyOnThisRestaurant || existing?.planId) {
      // Idempotente: já tem (ou já teve) uma assinatura. Não é erro — é o retorno normal de um duplo clique ou
      // de uma repetição depois de a resposta anterior não ter chegado ao navegador.
      const current = existing?.status === "trialing" && isPlanId(existing.planId) ? existing.planId : planId;
      return { activated: false, planId: current, trialEndsAt: typeof existing?.trialEndsAt === "string" ? existing.trialEndsAt : new Date().toISOString() };
    }
    if (userDoc.exists && userDoc.get("trialActivatedAt")) {
      throw new BillingError("trial_already_used", 409, "Esta conta já utilizou o teste grátis em outro estabelecimento.");
    }

    const at = new Date().toISOString();
    const trialEndsAt = new Date(Date.now() + SELF_SERVICE_TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const subscription: StoredSubscription = {
      planId,
      planName: shortPlanName(planId),
      planVersion: CATALOG_VERSION,
      status: "trialing",
      cycle: "monthly",
      priceCents: PLAN_CATALOG[planId].priceInCents ?? 0,
      trialEndsAt,
      createdAt: at,
      updatedAt: at,
    };
    tx.update(ref, { subscription, trialActivatedAt: at, trialPlanId: planId, updatedAt: at });
    tx.set(ref.collection("eventosAssinatura").doc(`trial-${at}`), {
      type: "trial_activated",
      before: null,
      after: subscription,
      actor: { kind: "owner", uid, email: null },
      reason: `Teste grátis de ${SELF_SERVICE_TRIAL_DAYS} dias ativado no cadastro (plano ${planId})`,
      at,
    });
    tx.set(userRef, { trialActivatedAt: at, trialRestaurantId: restaurantId }, { merge: true });
    return { activated: true, planId, trialEndsAt };
  });
}

/** Falha que precisa de atenção da administração (ex.: assinatura antiga que não foi cancelada no gateway). */
export async function recordSyncFailure(kind: string, details: Record<string, unknown>) {
  await adminDb()
    .collection("falhasSincronizacao")
    .add({ kind, ...details, resolved: false, createdAt: new Date().toISOString() })
    .catch((error) => console.error("[billing] não foi possível registrar falha de sincronização", error?.code || error?.message));
}

export const serverTimestamp = () => FieldValue.serverTimestamp();
