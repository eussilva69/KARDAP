// Migração para o catálogo de planos atual (docs/PLANOS.md, "Migração"). Idempotente: rodar de novo não muda nada
// que já foi migrado. SIMULAÇÃO por padrão; só grava com --apply.
//
// O que faz:
//  1. publica o catálogo do código em planos/{start,pro,business,enterprise} (consulta; a regra vale no servidor);
//  2. assinaturas: Essencial → Start mantendo as 30 mesas contratadas (customLimits), situações antigas
//     (trial, late, inactive, paused) → atuais, planVersion 2, com registro em eventosAssinatura;
//  3. mesas: aponta quem tem mais mesas que o novo limite (nada é apagado; só novas criações param);
//  4. pedidos do mês atual: classifica a origem só quando o campo existente é inequívoco (ex.: "ifood", "pdv");
//     origem desconhecida NUNCA vira pedido próprio: fica no relatório para classificação manual;
//  5. consumo do mês: cria uso/{AAAA-MM} só se ainda não existir, contando apenas pedidos próprios classificados.
//
// Uso:
//   node --env-file=.env.local scripts/migrate-plans.mjs              (simulação, credenciais de produção)
//   node --env-file=.env.local scripts/migrate-plans.mjs --apply      (grava)
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-kardap node scripts/migrate-plans.mjs
// Opções: --apply  --classify (grava a origem dos pedidos inequívocos)  --report=arquivo.json  --restaurant=<id>
// Requer Node 22.18+ (lê o catálogo TypeScript direto).
import fs from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { CATALOG_VERSION, PLAN_CATALOG, PLAN_ORDER, isExternalSource, isNativeSource, normalizeStatus, resolveEntitlements, usagePeriod } from "../lib/billing/plans.ts";

const args = new Map(process.argv.slice(2).map((a) => (a.includes("=") ? a.replace(/^--/, "").split(/=(.*)/s).slice(0, 2) : [a.replace(/^--/, ""), true])));
const APPLY = args.get("apply") === true;
const CLASSIFY = args.get("classify") === true;
const ONLY = typeof args.get("restaurant") === "string" ? args.get("restaurant") : null;
const REPORT = typeof args.get("report") === "string" ? args.get("report") : `migracao-planos-${new Date().toISOString().slice(0, 10)}.json`;

function app() {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    const project = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "";
    if (!project.startsWith("demo-")) throw new Error("Com o emulador, use um projeto demo-*.");
    return initializeApp({ projectId: project });
  }
  const { FIREBASE_ADMIN_PROJECT_ID: projectId, FIREBASE_ADMIN_CLIENT_EMAIL: clientEmail } = process.env;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) throw new Error("Defina FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL e FIREBASE_ADMIN_PRIVATE_KEY (ex.: --env-file=.env.local).");
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}
const db = getFirestore(app());

// Valores encontrados em campos antigos de pedidos que identificam a origem sem ambiguidade.
const ORIGIN_FIELDS = ["origem", "source", "canal", "channel", "plataforma", "platform", "marketplace", "provider"];
const ORIGIN_VALUES = {
  ifood: "ifood",
  "99food": "99food",
  "99 food": "99food",
  pdv: "kardap_pdv",
  balcao: "kardap_pdv",
  "balcão": "kardap_pdv",
  mesa: "kardap_table",
  salao: "kardap_table",
  "salão": "kardap_table",
  delivery: "kardap_delivery",
  entrega: "kardap_delivery",
  retirada: "kardap_pickup",
  pickup: "kardap_pickup",
  garcom: "kardap_staff",
  "garçom": "kardap_staff",
  equipe: "kardap_staff",
};
function classify(order) {
  const origin = order.origin;
  if (origin && (isNativeSource(origin.source) || isExternalSource(origin.source))) return { source: origin.source, how: "já classificado" };
  for (const field of ORIGIN_FIELDS) {
    const raw = order[field];
    if (typeof raw !== "string") continue;
    const value = raw.trim().toLowerCase();
    if (ORIGIN_VALUES[value]) return { source: ORIGIN_VALUES[value], how: `${field}="${raw}"` };
  }
  return null;
}
const DRAFT = new Set(["rascunho", "draft"]);
const CANCELED = new Set(["cancelado", "cancelada", "canceled", "cancelled"]);

const report = { mode: APPLY ? "apply" : "simulação", classify: CLASSIFY, startedAt: new Date().toISOString(), catalog: [], restaurants: [], totals: { restaurants: 0, subscriptionsMigrated: 0, tablesAboveLimit: 0, ordersClassified: 0, ordersUnknown: 0, usageCreated: 0 } };
const period = usagePeriod();

// 1. Catálogo
for (const id of PLAN_ORDER) {
  const plan = PLAN_CATALOG[id];
  const ref = db.collection("planos").doc(id);
  const current = await ref.get();
  const same = current.exists && current.get("version") === plan.version && current.get("priceInCents") === plan.priceInCents;
  report.catalog.push({ id, action: same ? "igual" : current.exists ? "atualizar" : "criar" });
  if (APPLY && !same) await ref.set({ ...plan, publishedAt: new Date().toISOString() });
}

// 2–5. Estabelecimentos
const restaurants = ONLY ? [await db.collection("restaurantes").doc(ONLY).get()].filter((d) => d.exists) : (await db.collection("restaurantes").get()).docs;
for (const snap of restaurants) {
  report.totals.restaurants += 1;
  const data = snap.data() || {};
  const entry = { id: snap.id, name: data.name || "", subscription: null, tables: null, orders: null, usage: null };
  const sub = data.subscription || null;

  // Assinatura
  if (sub && sub.planId) {
    const status = normalizeStatus(sub.status);
    const patch = {};
    if (sub.planId === "essencial") {
      Object.assign(patch, { planId: "start", planName: "Start", legacyPlanId: "essencial", customLimits: { maxTables: 30, ...(sub.customLimits || {}) } });
    }
    if ((sub.planVersion || 1) < CATALOG_VERSION) patch.planVersion = CATALOG_VERSION;
    if (status && status !== sub.status) patch.status = status;
    if (Object.keys(patch).length) {
      entry.subscription = { before: { planId: sub.planId, status: sub.status, planVersion: sub.planVersion ?? null }, after: patch };
      report.totals.subscriptionsMigrated += 1;
      if (APPLY) {
        const at = new Date().toISOString();
        const after = { ...sub, ...patch, updatedAt: at };
        delete after.cardBrand;
        delete after.cardLastDigits;
        await db.runTransaction(async (tx) => {
          tx.update(snap.ref, { subscription: after, updatedAt: at });
          tx.set(snap.ref.collection("eventosAssinatura").doc(`migracao-v${CATALOG_VERSION}`), {
            type: "subscription_change",
            before: Object.fromEntries(Object.entries(sub).filter(([key]) => key !== "cardBrand" && key !== "cardLastDigits")),
            after,
            actor: { kind: "migration", uid: null, email: null },
            reason: "Migração para o catálogo de planos v2 (Essencial → Start com 30 mesas mantidas)",
            at,
          }, { merge: true });
        });
      }
    }
  }

  // Mesas
  const entitlements = resolveEntitlements(entry.subscription ? { ...sub, ...entry.subscription.after } : sub, { createdAt: data.createdAt, restaurantStatus: data.status });
  const tables = (await snap.ref.collection("mesas").count().get()).data().count;
  const limit = entitlements.limits.maxTables;
  entry.tables = { count: tables, limit, aboveLimit: limit !== null && tables > limit };
  if (entry.tables.aboveLimit) report.totals.tablesAboveLimit += 1;

  // Pedidos do mês atual
  const orders = await snap.ref.collection("pedidos").get();
  const start = Date.parse(period.start);
  const end = Date.parse(period.end);
  const summary = { total: orders.size, thisMonth: 0, native: 0, external: 0, unknown: [], classifiedNow: 0 };
  let nativeConfirmed = 0;
  for (const order of orders.docs) {
    const o = order.data();
    const created = Date.parse(String(o.confirmedAt || o.createdAt || ""));
    if (!(created >= start && created < end)) continue;
    summary.thisMonth += 1;
    const status = String(o.status || "").toLowerCase();
    if (DRAFT.has(status)) continue;
    const found = classify(o);
    if (!found) {
      summary.unknown.push({ id: order.id, status: o.status || null, createdAt: o.createdAt || null });
      continue;
    }
    const native = isNativeSource(found.source);
    if (native) summary.native += 1;
    else summary.external += 1;
    // Só conta no consumo o que terá origem gravada (já classificado, ou classificado agora com --classify).
    if (native && !CANCELED.has(status) && (o.origin || CLASSIFY)) nativeConfirmed += 1;
    if (!o.origin) {
      summary.classifiedNow += 1;
      if (APPLY && CLASSIFY) {
        await order.ref.set(
          {
            origin: { source: found.source, isNativeOrder: native },
            ...(native && !o.quota ? { quota: { consumed: true, periodId: period.periodId, consumedAt: new Date(created).toISOString(), migrated: true } } : {}),
            migratedOriginFrom: found.how,
          },
          { merge: true },
        );
      }
    }
  }
  report.totals.ordersClassified += summary.classifiedNow;
  report.totals.ordersUnknown += summary.unknown.length;
  entry.orders = summary;

  // Consumo do mês: só cria (nunca sobrescreve o contador que já está em uso)
  const usageRef = snap.ref.collection("uso").doc(period.periodId);
  const usage = await usageRef.get();
  if (usage.exists) {
    entry.usage = { periodId: period.periodId, action: "mantido", nativeOrdersUsed: usage.get("nativeOrdersUsed") || 0 };
  } else {
    entry.usage = { periodId: period.periodId, action: "criar", nativeOrdersUsed: nativeConfirmed, note: summary.unknown.length ? `${summary.unknown.length} pedido(s) sem origem não foram contados` : undefined };
    report.totals.usageCreated += 1;
    if (APPLY) {
      await usageRef.create({
        establishmentId: snap.id,
        periodId: period.periodId,
        nativeOrdersUsed: nativeConfirmed,
        nativeOrdersLimit: entitlements.limits.maxNativeOrdersPerMonth,
        periodStart: period.start,
        periodEnd: period.end,
        updatedAt: new Date().toISOString(),
        migratedAt: new Date().toISOString(),
      }).catch(() => (entry.usage.action = "já existia (criado por outra execução)"));
    }
  }
  report.restaurants.push(entry);
}

report.finishedAt = new Date().toISOString();
fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
const t = report.totals;
console.log(`${APPLY ? "MIGRAÇÃO APLICADA" : "SIMULAÇÃO (nada foi gravado; use --apply)"}
Estabelecimentos: ${t.restaurants}
Assinaturas a migrar: ${t.subscriptionsMigrated}
Acima do novo limite de mesas (mantidas, só novas bloqueadas): ${t.tablesAboveLimit}
Pedidos do mês ${CLASSIFY ? "classificados agora" : "classificáveis (use --classify)"}: ${t.ordersClassified}
Pedidos do mês SEM origem identificável (não contados; classificar manualmente): ${t.ordersUnknown}
Contadores de consumo a criar: ${t.usageCreated}
Relatório: ${REPORT}`);
process.exit(0);
