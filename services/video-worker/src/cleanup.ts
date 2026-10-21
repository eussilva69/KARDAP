/**
 * Limpeza periódica (POST /tasks/cleanup, chamada pelo Cloud Scheduler uma vez por dia).
 *
 * 1. Envios que nunca terminaram (pending/uploading há mais de 24 h) → failed "stale".
 * 2. Processamentos sem posse válida há mais de 1 h (instância caiu) → failed.
 * 3. Vídeos com falha, cancelados ou substituídos (status canceled) há mais de N dias → apaga arquivos e registro.
 * 4. Arquivos de vídeo sem registro, ou originais de vídeos prontos → apagados (com 24 h de folga).
 * Nunca toca no vídeo publicado de um produto nem em vídeos antigos fora da estrutura nova.
 */
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { parseManagedPath, type ProductVideoDoc, type PublishedVideo } from "./contract.ts";
import type { Config } from "./config.ts";
import type { Logger } from "./log.ts";

type Bucket = { getFiles(query: Record<string, unknown>): Promise<[Array<{ name: string; metadata: { timeCreated?: string } }>, Record<string, unknown> | null, unknown]>; file(name: string): { delete(o: { ignoreNotFound: boolean }): Promise<unknown> } };

const HOUR = 3600 * 1000;

export async function runCleanup(db: Firestore, bucket: Bucket, config: Config, log: Logger, now = Date.now()) {
  const summary = { staleUploads: 0, stuckProcessing: 0, purgedVideos: 0, orphanFiles: 0, originalsRemoved: 0, scannedFiles: 0 };
  const remove = (path?: string) => (path ? bucket.file(path).delete({ ignoreNotFound: true }).catch((error) => log.warn("falha ao apagar", { path, error })) : Promise.resolve());

  // 1. Envios abandonados.
  const stale = await db.collectionGroup("videos").where("status", "in", ["pending", "uploading"]).where("createdAt", "<", Timestamp.fromMillis(now - 24 * HOUR)).limit(500).get();
  for (const d of stale.docs) {
    await d.ref.update({ status: "failed", error: "stale", errorDetail: "envio não concluído em 24 h", updatedAt: FieldValue.serverTimestamp() });
    summary.staleUploads++;
  }

  // 2. Processamentos travados.
  const stuck = await db.collectionGroup("videos").where("status", "in", ["processing", "retrying"]).where("leaseUntil", "<", now - HOUR).limit(500).get();
  for (const d of stuck.docs) {
    await d.ref.update({ status: "failed", error: "processing_failed", errorDetail: "processamento interrompido", leaseUntil: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
    summary.stuckProcessing++;
  }

  // 3. Registros encerrados há mais de N dias (arquivos + documento).
  const cutoff = Timestamp.fromMillis(now - config.retentionDays * 24 * HOUR);
  // Substituídos viram "canceled" (com supersededBy) na publicação do novo vídeo.
  const finished = await db.collectionGroup("videos").where("status", "in", ["failed", "canceled"]).where("updatedAt", "<", cutoff).limit(500).get();
  for (const d of finished.docs) {
    const v = d.data() as Partial<ProductVideoDoc>;
    const restaurantRef = d.ref.parent.parent;
    if (!restaurantRef || !v.productId) continue;
    const product = await restaurantRef.collection("produtos").doc(v.productId).get();
    const current = (product.data()?.video as PublishedVideo | undefined)?.id;
    if (current === d.id) continue; // segurança extra: nunca apaga o que está no ar
    await Promise.all([remove(v.originalPath), remove(v.optimizedPath), remove(v.thumbnailPath), ...(v.variantPaths ?? []).map(remove)]);
    await d.ref.delete();
    summary.purgedVideos++;
  }

  // 4. Arquivos órfãos na estrutura de vídeos.
  let pageToken: string | undefined;
  do {
    const [files, next] = await bucket.getFiles({ prefix: "restaurantes/", matchGlob: "restaurantes/*/produtos/*/{videos/original,videos/optimized,thumbnails}/*", maxResults: 500, autoPaginate: false, pageToken });
    for (const f of files) {
      summary.scannedFiles++;
      const created = Date.parse(f.metadata.timeCreated ?? "");
      if (!created || now - created < 24 * HOUR) continue;
      const parsed = parseManagedPath(f.name);
      if (!parsed) continue;
      const snap = await db.doc(`restaurantes/${parsed.restaurantId}/videos/${parsed.videoId}`).get();
      if (!snap.exists) {
        const product = await db.doc(`restaurantes/${parsed.restaurantId}/produtos/${parsed.productId}`).get();
        if ((product.data()?.video as PublishedVideo | undefined)?.id === parsed.videoId) continue;
        await remove(f.name);
        summary.orphanFiles++;
        continue;
      }
      const v = snap.data() as Partial<ProductVideoDoc>;
      if (parsed.kind === "original" && v.status === "ready" && config.deleteOriginalAfterSuccess) {
        await remove(f.name);
        summary.originalsRemoved++;
      }
    }
    pageToken = (next?.pageToken as string | undefined) ?? undefined;
  } while (pageToken && summary.scannedFiles < config.cleanupMaxFiles);

  log.info("limpeza concluída", summary);
  return summary;
}
