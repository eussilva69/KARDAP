/**
 * Grava (ou restaura) a conta demonstrativa no Firestore com o Admin SDK (docs/DEMO.md).
 * Usado pelo script `scripts/demo/seed-demo.mjs` e pela rota POST /api/demo/reset.
 *
 * Segurança: só escreve em restaurantes/{DEMO_RESTAURANT_ID} (e nos registros financeiros com restaurant_id igual a
 * ele). Se esse documento existir sem a marca `isDemo` ou com outro dono, para tudo antes de gravar qualquer coisa.
 * Coleções de outros restaurantes nunca são lidas nem alteradas.
 */
import type { Firestore } from "firebase-admin/firestore";
import type { FinancialSettings } from "../financial/types.ts";
import type { ImageMeta } from "../restaurant-db.ts";
import { DEMO_OWNER_EMAIL, DEMO_RESTAURANT_ID, DEMO_SLUG } from "./ids.ts";
import {
  DEMO_CATEGORIES,
  DEMO_CITY,
  DEMO_PRODUCTS,
  callDocs,
  deliveryAreaDoc,
  financialDocs,
  generateOrders,
  priceText,
  restaurantDoc,
  tableDocs,
  usageByPeriod,
  type BrandMedia,
} from "./dataset.ts";

export type PublishedVideoMeta = { id: string; width: number; height: number; duration: number; optimizedPath: string; thumbnailPath: string; optimizedSize: number; originalSize: number };

export type MediaCredit = { source: string; id: string; url: string; author: string; authorUrl: string; license: string };

export type ProductMedia = {
  image: string;
  imageThumb: string;
  imageMeta: ImageMeta;
  videoUrl?: string;
  videoPoster?: string;
  video?: PublishedVideoMeta;
  credit: MediaCredit;
};

/** Mídia publicada (documento demoConfig/{id}): URLs usadas nos produtos e cópias mestras para restaurar arquivos. */
export type DemoMediaManifest = {
  brand: BrandMedia;
  brandCredit?: MediaCredit;
  products: Record<string, ProductMedia>;
  /** Arquivo publicado ← cópia mestra (fora de restaurantes/, protegida de exclusão pelo painel). */
  files: { path: string; master: string }[];
};

export type DemoConfig = { ownerId: string; ownerEmail: string; media: DemoMediaManifest | null; seededAt?: string; restoredAt?: string };

const OPERATIONAL_SUBCOLLECTIONS = ["pedidos", "chamados", "mesas", "categorias", "produtos", "videos", "curtidas", "uso", "eventosUso", "delivery_areas", "membros"];
const FINANCIAL_COLLECTIONS = ["financial_transactions", "withdrawal_requests", "financial_ledger", "payouts", "financial_audit_logs", "financial_notifications"];

export class DemoGuardError extends Error {}

/** Confere que gravar no restaurante demo não atinge um restaurante real. */
export async function assertDemoTarget(db: Firestore, ownerId: string) {
  const [restaurant, slug] = await Promise.all([db.collection("restaurantes").doc(DEMO_RESTAURANT_ID).get(), db.collection("menuSlugs").doc(DEMO_SLUG).get()]);
  if (restaurant.exists && (restaurant.get("isDemo") !== true || restaurant.get("ownerId") !== ownerId)) {
    throw new DemoGuardError(`restaurantes/${DEMO_RESTAURANT_ID} existe e não é a demonstração deste dono — nada foi alterado.`);
  }
  if (slug.exists && slug.get("restaurantId") !== DEMO_RESTAURANT_ID) {
    throw new DemoGuardError(`O endereço /r/${DEMO_SLUG} já pertence a outro restaurante — nada foi alterado.`);
  }
}

type Log = (message: string) => void;

/** Lê demoConfig/{id} (dono e mídia publicada). */
export async function readDemoConfig(db: Firestore): Promise<DemoConfig | null> {
  const snap = await db.collection("demoConfig").doc(DEMO_RESTAURANT_ID).get();
  return snap.exists ? (snap.data() as DemoConfig) : null;
}

async function deleteDemoData(db: Firestore, log: Log) {
  const restaurant = db.collection("restaurantes").doc(DEMO_RESTAURANT_ID);
  const writer = db.bulkWriter();
  let count = 0;
  for (const name of OPERATIONAL_SUBCOLLECTIONS) {
    const refs = await restaurant.collection(name).listDocuments();
    refs.forEach((ref) => {
      writer.delete(ref);
      count++;
    });
  }
  for (const id of ["delivery_counter"]) writer.delete(restaurant.collection("privado").doc(id));
  for (const name of FINANCIAL_COLLECTIONS) {
    const snap = await db.collection(name).where("restaurant_id", "==", DEMO_RESTAURANT_ID).get();
    snap.docs.forEach((d) => {
      writer.delete(d.ref);
      count++;
    });
  }
  await writer.close();
  log(`removidos ${count} registros anteriores da demonstração`);
}

/**
 * Apaga as movimentações da demonstração e grava o estado inicial, com datas relativas a `now`.
 * Idempotente: rodar de novo produz o mesmo conjunto (mesmos ids), sem duplicar nada.
 */
export async function applyDemo(
  db: Firestore,
  opts: { ownerId: string; ownerEmail?: string; now?: number; media: DemoMediaManifest | null; settings: FinancialSettings; log?: Log },
) {
  const log = opts.log || (() => undefined);
  const now = opts.now ?? Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  await assertDemoTarget(db, opts.ownerId);
  await deleteDemoData(db, log);

  const restaurant = db.collection("restaurantes").doc(DEMO_RESTAURANT_ID);
  const media = opts.media;
  const brand: BrandMedia = media?.brand || { logo: "", logoSmall: "", cover: "", coverSmall: "" };
  const orders = generateOrders(now);
  const writer = db.bulkWriter();
  const counts: Record<string, number> = {};
  const set = (ref: FirebaseFirestore.DocumentReference, data: Record<string, unknown>, label: string) => {
    writer.set(ref, data);
    counts[label] = (counts[label] || 0) + 1;
  };

  set(restaurant, restaurantDoc(opts.ownerId, now, brand), "restaurante");
  set(restaurant.collection("membros").doc(opts.ownerId), { uid: opts.ownerId, name: "Equipe Brasa & Sabor (demonstração)", role: "owner", permissions: ["*"], active: true, createdAt: iso(now - 160 * 86400000) }, "membros");
  writer.set(db.collection("usuarios").doc(opts.ownerId), { email: opts.ownerEmail || DEMO_OWNER_EMAIL, displayName: "Conta demonstrativa", restaurantIds: [DEMO_RESTAURANT_ID], isDemo: true, updatedAt: iso(now) }, { merge: true });
  writer.set(db.collection("menuSlugs").doc(DEMO_SLUG), { restaurantId: DEMO_RESTAURANT_ID, createdAt: iso(now - 160 * 86400000) });

  DEMO_CATEGORIES.forEach((c) => set(restaurant.collection("categorias").doc(c.id), { name: c.name, description: c.description, order: c.order, active: true, createdAt: iso(now - 150 * 86400000), updatedAt: iso(now - 150 * 86400000) }, "categorias"));

  const categoryName = new Map(DEMO_CATEGORIES.map((c) => [c.id, c.name]));
  // Mesma ordem do catálogo dentro de cada categoria (o cardápio lista do mais recente para o mais antigo).
  DEMO_PRODUCTS.forEach((p, index) => {
    const m = media?.products[p.id];
    const createdAt = iso(now - 140 * 86400000 - index * 60000);
    const likes = Math.round(p.popularity * 14 + ((index * 37) % 23));
    set(
      restaurant.collection("produtos").doc(p.id),
      {
        name: p.name,
        categoryId: p.categoryId,
        category: categoryName.get(p.categoryId) || "",
        description: p.description,
        price: priceText(p.priceCents),
        priceCents: p.priceCents,
        costCents: p.costCents,
        available: p.available !== false,
        likes,
        ...(m ? { image: m.image, imageThumb: m.imageThumb, imageMeta: m.imageMeta } : {}),
        ...(m?.video ? { videoUrl: m.videoUrl, videoPoster: m.videoPoster, video: m.video } : {}),
        createdAt,
        updatedAt: createdAt,
      },
      "produtos",
    );
    if (m?.video) {
      // Registro do vídeo como o worker deixaria depois de publicar (o painel e a limpeza do worker leem estes campos).
      const processedAt = new Date(now - 139 * 86400000);
      set(
        restaurant.collection("videos").doc(m.video.id),
        {
          productId: p.id,
          status: "ready",
          originalPath: m.video.optimizedPath,
          originalSize: m.video.originalSize,
          contentType: "video/mp4",
          fileName: `${p.id}.mp4`,
          createdBy: opts.ownerId,
          createdAt: processedAt,
          updatedAt: processedAt,
          processedAt,
          optimizedPath: m.video.optimizedPath,
          thumbnailPath: m.video.thumbnailPath,
          optimizedUrl: m.videoUrl,
          thumbnailUrl: m.videoPoster,
          optimizedSize: m.video.optimizedSize,
          reductionPercent: Math.round((1 - m.video.optimizedSize / Math.max(1, m.video.originalSize)) * 1000) / 10,
          width: m.video.width,
          height: m.video.height,
          duration: m.video.duration,
          strategy: "transcode",
        },
        "videos",
      );
    }
  });

  tableDocs(now, orders).forEach(({ id, ...t }) => set(restaurant.collection("mesas").doc(id), t, "mesas"));
  callDocs(now).forEach(({ id, ...c }) => set(restaurant.collection("chamados").doc(id), c, "chamados"));

  let lastOrderNumber = 0;
  for (const order of orders) {
    const { id, createdAtMs: _createdAtMs, channel: _channel, ...data } = order;
    set(restaurant.collection("pedidos").doc(id), data, "pedidos");
    lastOrderNumber = Math.max(lastOrderNumber, Number(order.orderNumber) || 0);
    const quota = order.quota as { periodId: string; consumedAt: string } | undefined;
    if (quota) set(restaurant.collection("eventosUso").doc(id), { type: "native_order_confirmed", orderId: id, source: (order.origin as { source: string }).source, periodId: quota.periodId, uid: "demo", at: quota.consumedAt, simulated: true }, "eventosUso");
  }
  set(restaurant.collection("privado").doc("delivery_counter"), { lastOrderNumber, updatedAt: iso(now) }, "privado");

  usageByPeriod(orders).forEach((used, periodId) => {
    const [y, m] = periodId.split("-").map(Number);
    set(
      restaurant.collection("uso").doc(periodId),
      { establishmentId: DEMO_RESTAURANT_ID, periodId, nativeOrdersUsed: used, nativeOrdersLimit: 500, periodStart: new Date(Date.UTC(y, m - 1, 1, 3)).toISOString(), periodEnd: new Date(Date.UTC(y, m, 1, 3)).toISOString(), updatedAt: iso(now) },
      "uso",
    );
  });

  set(restaurant.collection("delivery_areas").doc(DEMO_CITY.ibgeCode), deliveryAreaDoc(now), "delivery_areas");

  const finance = financialDocs(now, orders, opts.settings);
  finance.transactions.forEach(({ id, ...t }) => set(db.collection("financial_transactions").doc(id), t, "financial_transactions"));
  finance.withdrawals.forEach(({ id, ...w }) => set(db.collection("withdrawal_requests").doc(id), w, "withdrawal_requests"));
  finance.ledger.forEach(({ id, ...l }) => set(db.collection("financial_ledger").doc(id), l, "financial_ledger"));
  set(db.collection("restaurant_balances").doc(DEMO_RESTAURANT_ID), finance.balance, "restaurant_balances");

  writer.set(db.collection("demoConfig").doc(DEMO_RESTAURANT_ID), { ownerId: opts.ownerId, ownerEmail: opts.ownerEmail || DEMO_OWNER_EMAIL, media, restoredAt: iso(now) }, { merge: true });

  await writer.close();
  log(`gravados: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  return { counts, orders: orders.length, balance: finance.balance };
}

type BucketLike = { file(path: string): { exists(): Promise<[boolean]>; copy(dest: unknown): Promise<unknown> } };

/**
 * Recoloca arquivos de mídia apagados durante uma apresentação (ex.: alguém removeu o vídeo de um produto) a partir
 * das cópias mestras. Devolve quantos foram restaurados.
 */
export async function restoreMediaFiles(bucket: BucketLike, media: DemoMediaManifest | null) {
  if (!media) return 0;
  let restored = 0;
  const queue = media.files.slice();
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const [exists] = await bucket.file(item.path).exists();
      if (exists) continue;
      await bucket.file(item.master).copy(bucket.file(item.path));
      restored++;
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return restored;
}
