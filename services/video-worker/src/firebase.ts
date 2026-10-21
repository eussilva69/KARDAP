/**
 * Adaptadores do Firebase para o worker. No Cloud Run, a credencial é a conta de serviço
 * do próprio serviço (Application Default Credentials): nenhuma chave fica no código ou na imagem.
 */
import { randomUUID } from "node:crypto";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { videoPaths, type OriginalRef, type ProductVideoDoc, type PublishedVideo, type VideoErrorCode } from "./contract.ts";
import { decideClaim, decidePublish, NotFoundError, type BlobStore, type ClaimDecision, type ProcessedVideo, type PublishDecision, type StorageEvent, type VideoRepo } from "./pipeline.ts";

export function initFirebase(bucket: string) {
  const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), storageBucket: bucket });
  return { db: getFirestore(app), bucket: getStorage(app).bucket(bucket) };
}

type Bucket = ReturnType<ReturnType<typeof getStorage>["bucket"]>;

const status404 = (error: unknown) => (error as { code?: number })?.code === 404;

export function createBlobStore(bucket: Bucket): BlobStore {
  return {
    async download(name, generation, destination) {
      try {
        // Fixar a geração garante que processamos exatamente o arquivo do evento.
        await bucket.file(name, { generation }).download({ destination, validation: "crc32c" });
      } catch (error) {
        if (status404(error)) throw new NotFoundError(`arquivo ${name} (geração ${generation}) não existe mais`);
        throw error;
      }
    },
    async upload(localFile, destination, { contentType, cacheControl, metadata }) {
      // Token de download do Firebase: a URL funciona como as geradas pelo SDK do navegador.
      const token = randomUUID();
      await bucket.upload(localFile, {
        destination,
        resumable: false,
        validation: "crc32c",
        metadata: { contentType, cacheControl, metadata: { ...metadata, firebaseStorageDownloadTokens: token } },
      });
      return { url: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(destination)}?alt=media&token=${token}` };
    },
    async remove(name) {
      await bucket.file(name).delete({ ignoreNotFound: true });
    },
  };
}

const videoRef = (db: Firestore, ref: OriginalRef) => db.doc(`restaurantes/${ref.restaurantId}/videos/${ref.videoId}`);
const productRef = (db: Firestore, ref: OriginalRef) => db.doc(`restaurantes/${ref.restaurantId}/produtos/${ref.productId}`);

export function createVideoRepo(db: Firestore, leaseMs: number, maxAttempts: number): VideoRepo {
  return {
    claim(ref, event: StorageEvent, attemptId, now): Promise<ClaimDecision> {
      return db.runTransaction(async (tx) => {
        const [videoSnap, productSnap] = await Promise.all([tx.get(videoRef(db, ref)), tx.get(productRef(db, ref))]);
        const doc = videoSnap.exists ? (videoSnap.data() as Partial<ProductVideoDoc>) : null;
        const decision = decideClaim(doc, productSnap.exists, event.generation, now, maxAttempts);
        if (decision.action !== "process") return decision;
        const claim = {
          status: "processing",
          attempts: decision.attempts,
          attemptId,
          sourceGeneration: event.generation,
          leaseUntil: now + leaseMs,
          updatedAt: FieldValue.serverTimestamp(),
          error: FieldValue.delete(),
          errorDetail: FieldValue.delete(),
        };
        if (doc) tx.update(videoRef(db, ref), claim);
        else
          // Envio sem registro (ex.: o navegador fechou antes de gravar): o worker cria o registro a partir do evento.
          tx.set(videoRef(db, ref), {
            ...claim,
            error: null,
            errorDetail: null,
            productId: ref.productId,
            originalPath: event.name,
            originalSize: event.size,
            contentType: event.contentType,
            fileName: String(event.metadata?.fileName ?? "").slice(0, 120),
            createdBy: String(event.metadata?.uploadedBy ?? ""),
            createdAt: FieldValue.serverTimestamp(),
          });
        return decision;
      });
    },

    async countSince(restaurantId, sinceMs) {
      const snap = await db.collection(`restaurantes/${restaurantId}/videos`).where("createdAt", ">=", Timestamp.fromMillis(sinceMs)).count().get();
      return snap.data().count;
    },

    publish(ref, attemptId, r: ProcessedVideo): Promise<PublishDecision> {
      return db.runTransaction(async (tx) => {
        const [videoSnap, productSnap] = await Promise.all([tx.get(videoRef(db, ref)), tx.get(productRef(db, ref))]);
        const product = productSnap.exists ? (productSnap.data() as { video?: PublishedVideo | null }) : null;
        const decision = decidePublish(videoSnap.exists ? (videoSnap.data() as Partial<ProductVideoDoc>) : null, product, ref.videoId, attemptId);
        if (!decision.ok) return decision;
        const published: PublishedVideo = {
          id: ref.videoId,
          width: r.width,
          height: r.height,
          duration: r.duration,
          optimizedPath: r.optimizedPath,
          thumbnailPath: r.thumbnailPath,
          optimizedSize: r.optimizedSize,
          originalSize: r.originalSize,
          ...(r.variants.length ? { variants: r.variants } : {}),
        };
        // O cardápio continua lendo `videoUrl`: vídeos antigos e novos funcionam do mesmo jeito.
        tx.update(productRef(db, ref), { videoUrl: r.optimizedUrl, videoPoster: r.thumbnailUrl, video: published, updatedAt: new Date().toISOString() });
        tx.update(videoRef(db, ref), {
          status: "ready",
          optimizedPath: r.optimizedPath,
          thumbnailPath: r.thumbnailPath,
          optimizedUrl: r.optimizedUrl,
          thumbnailUrl: r.thumbnailUrl,
          optimizedSize: r.optimizedSize,
          reductionPercent: r.reductionPercent,
          width: r.width,
          height: r.height,
          duration: r.duration,
          strategy: r.strategy,
          variants: r.variants.map((v) => ({ kind: v.kind, width: v.width, height: v.height, size: v.size })),
          variantPaths: r.variants.map((v) => v.path),
          processingMs: r.processingMs,
          processedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          leaseUntil: FieldValue.delete(),
        });
        if (decision.previous) {
          tx.set(db.doc(`restaurantes/${ref.restaurantId}/videos/${decision.previous.id}`), { status: "canceled", supersededBy: ref.videoId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        }
        return decision;
      });
    },

    async markRetrying(ref, attemptId, code: VideoErrorCode, detail) {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(videoRef(db, ref));
        const doc = snap.data() as Partial<ProductVideoDoc> | undefined;
        if (!doc || doc.attemptId !== attemptId || doc.status !== "processing") return;
        tx.update(videoRef(db, ref), { status: "retrying", error: code, errorDetail: detail, leaseUntil: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
      });
    },

    async markFailed(ref, attemptId, code: VideoErrorCode, detail) {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(videoRef(db, ref));
        const doc = snap.data() as Partial<ProductVideoDoc> | undefined;
        // Não sobrescreve cancelamento nem resultado pronto, nem a posse de outra tentativa.
        if (doc && (doc.status === "canceled" || doc.status === "ready")) return;
        if (doc && attemptId && doc.attemptId && doc.attemptId !== attemptId) return;
        const identity = doc ? {} : { productId: ref.productId, originalPath: videoPaths(ref.restaurantId, ref.productId, ref.videoId, ref.ext).original, createdAt: FieldValue.serverTimestamp() };
        tx.set(videoRef(db, ref), { ...identity, status: "failed", error: code, errorDetail: detail, leaseUntil: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      });
    },
  };
}
