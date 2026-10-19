import type { NextRequest } from "next/server";
import { json, errorResponse } from "@/lib/billing/http";
import { BillingError } from "@/lib/billing/server";
import { authenticateAdmin, auditLog } from "@/lib/admin/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { rateLimit } from "@/lib/sso/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROTECTED_COLLECTIONS = new Set(["admins", "adminLog"]);

const KNOWN_COLLECTIONS = [
  "restaurantes",
  "usuarios",
  "menuSlugs",
  "catalogoPlanos",
  "propostasEnterprise",
  "falhasSincronizacao",
  "cakto_checkout_sessions",
  "cakto_webhook_events",
  "ssoSessoes",
  "ssoCodigosUsados",
  "indices",
];

const RESTAURANT_SUBCOLLECTIONS = [
  "membros",
  "produtos",
  "categorias",
  "mesas",
  "chamados",
  "pagamentos",
  "videos",
  "pedidos",
  "uso",
  "eventosUso",
  "eventosAssinatura",
  "privado",
];

function isProduction(): boolean {
  if (process.env.NODE_ENV === "production") return true;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "";
  if (projectId.startsWith("demo-")) return false;
  if (process.env.FIRESTORE_EMULATOR_HOST) return false;
  return process.env.ADMIN_ALLOW_RESET !== "true";
}

async function getProtectedUids(): Promise<Set<string>> {
  const db = adminDb();
  const snap = await db.collection("admins").get();
  return new Set(snap.docs.map((d) => d.id));
}

async function countCollection(name: string): Promise<number> {
  const db = adminDb();
  const snap = await db.collection(name).count().get();
  return snap.data().count;
}

async function countSubcollectionDocs(parentCol: string, subCol: string, limit = 100): Promise<number> {
  const db = adminDb();
  const parents = await db.collection(parentCol).select().limit(limit).get();
  let total = 0;
  for (const parent of parents.docs) {
    const sub = await parent.ref.collection(subCol).count().get();
    total += sub.data().count;
  }
  return total;
}

async function countAuthUsers(protectedUids: Set<string>): Promise<{ total: number; toDelete: number; protected: number }> {
  const auth = adminAuth();
  let total = 0;
  let pageToken: string | undefined;
  do {
    const result = await auth.listUsers(1000, pageToken);
    total += result.users.length;
    pageToken = result.pageToken;
  } while (pageToken);
  return { total, toDelete: total - protectedUids.size, protected: protectedUids.size };
}

/**
 * GET — dry-run: scan all resources and return a report without deleting anything.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await authenticateAdmin(req);
    rateLimit(req, "admin-reset-scan", 5, 60_000, caller.uid);

    const productionBlocked = isProduction();
    const protectedUids = await getProtectedUids();

    const collections: { name: string; count: number; action: "delete" | "preserve" }[] = [];

    for (const name of KNOWN_COLLECTIONS) {
      const count = await countCollection(name);
      collections.push({ name, count, action: PROTECTED_COLLECTIONS.has(name) ? "preserve" : "delete" });
    }

    // Also discover any unknown root collections
    const db = adminDb();
    const allCollections = await db.listCollections();
    for (const col of allCollections) {
      if (KNOWN_COLLECTIONS.includes(col.id) || PROTECTED_COLLECTIONS.has(col.id)) continue;
      const count = await countCollection(col.id);
      collections.push({ name: col.id, count, action: "delete" });
    }

    // Add protected collections explicitly
    for (const name of Array.from(PROTECTED_COLLECTIONS)) {
      if (!collections.find((c) => c.name === name)) {
        const count = await countCollection(name);
        collections.push({ name, count, action: "preserve" });
      }
    }

    // Count subcollections (sample)
    const subcollections: { parent: string; name: string; estimatedCount: number }[] = [];
    for (const sub of RESTAURANT_SUBCOLLECTIONS) {
      const count = await countSubcollectionDocs("restaurantes", sub, 50);
      if (count > 0) subcollections.push({ parent: "restaurantes", name: sub, estimatedCount: count });
    }

    const authUsers = await countAuthUsers(protectedUids);

    return json(req, {
      dryRun: true,
      productionBlocked,
      environment: process.env.FIRESTORE_EMULATOR_HOST ? "emulator" : process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.startsWith("demo-") ? "demo" : "production",
      protectedAdmins: Array.from(protectedUids),
      authUsers,
      collections,
      subcollections,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return errorResponse(req, "admin-reset", error);
  }
}

/**
 * POST — execute reset (or dry-run with body.dryRun=true).
 * Requires body: { confirmation: "RESETAR KARDAPP", dryRun?: boolean }
 */
export async function POST(req: NextRequest) {
  try {
    const caller = await authenticateAdmin(req);
    rateLimit(req, "admin-reset-exec", 2, 300_000, caller.uid);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw new BillingError("invalid_request", 400, "Corpo da requisição inválido.");
    }

    if (body.confirmation !== "RESETAR KARDAPP") {
      throw new BillingError("confirmation_required", 400, "Digite exatamente: RESETAR KARDAPP");
    }

    if (isProduction()) {
      throw new BillingError("production_blocked", 403, "Reset bloqueado em produção. Configure ADMIN_ALLOW_RESET=true para habilitar.");
    }

    const protectedUids = await getProtectedUids();
    if (protectedUids.size === 0) {
      throw new BillingError("no_admins", 500, "Nenhum admin protegido encontrado. Abortando por segurança.");
    }

    // Verify caller is in protected list
    if (!protectedUids.has(caller.uid)) {
      throw new BillingError("not_protected", 403, "Seu UID não está na lista de admins protegidos.");
    }

    await auditLog(caller, "system_reset" as any, {
      targetId: "system",
      targetKind: "system",
      reason: "Reset completo do sistema solicitado",
      detail: `Admins protegidos: ${Array.from(protectedUids).join(", ")}`,
    });

    const log: string[] = [];
    const errors: string[] = [];

    // 1. Delete Auth users (except admins)
    log.push("Iniciando exclusão de contas de autenticação...");
    let deletedUsers = 0;
    try {
      const auth = adminAuth();
      let pageToken: string | undefined;
      do {
        const result = await auth.listUsers(1000, pageToken);
        const toDelete = result.users.filter((u) => !protectedUids.has(u.uid));
        if (toDelete.length > 0) {
          const deleteResult = await auth.deleteUsers(toDelete.map((u) => u.uid));
          deletedUsers += deleteResult.successCount;
          if (deleteResult.failureCount > 0) {
            errors.push(`${deleteResult.failureCount} contas não puderam ser excluídas`);
          }
        }
        pageToken = result.pageToken;
      } while (pageToken);
      log.push(`${deletedUsers} contas excluídas do Authentication.`);
    } catch (err: any) {
      errors.push(`Auth: ${err.message || "erro desconhecido"}`);
    }

    // 2. Delete Firestore collections
    const db = adminDb();
    let deletedDocs = 0;
    const processedCollections: string[] = [];

    const deleteCollection = async (ref: FirebaseFirestore.CollectionReference, name: string) => {
      let batch = db.batch();
      let batchCount = 0;
      let collectionDeleted = 0;

      const processQuery = async (query: FirebaseFirestore.Query) => {
        const snap = await query.get();
        if (snap.empty) return false;

        for (const doc of snap.docs) {
          // Delete known subcollections first
          if (name === "restaurantes") {
            for (const sub of RESTAURANT_SUBCOLLECTIONS) {
              await deleteSubcollection(doc.ref.collection(sub));
            }
          }
          if (name === "usuarios") {
            // Delete user subcollections
            const subs = await doc.ref.listCollections();
            for (const sub of subs) {
              await deleteSubcollection(sub);
            }
          }

          batch.delete(doc.ref);
          batchCount++;
          collectionDeleted++;

          if (batchCount >= 400) {
            await batch.commit();
            batch = db.batch();
            batchCount = 0;
          }
        }
        return snap.docs.length === 500;
      };

      let hasMore = true;
      while (hasMore) {
        hasMore = await processQuery(ref.limit(500));
      }

      if (batchCount > 0) await batch.commit();
      deletedDocs += collectionDeleted;
      if (collectionDeleted > 0) log.push(`${name}: ${collectionDeleted} documentos excluídos.`);
      processedCollections.push(name);
    };

    const deleteSubcollection = async (ref: FirebaseFirestore.CollectionReference) => {
      let batch = db.batch();
      let batchCount = 0;
      let hasMore = true;

      while (hasMore) {
        const snap = await ref.limit(500).get();
        if (snap.empty) break;
        hasMore = snap.docs.length === 500;

        // Check for nested subcollections
        for (const doc of snap.docs) {
          const nested = await doc.ref.listCollections();
          for (const sub of nested) {
            await deleteSubcollection(sub);
          }
          batch.delete(doc.ref);
          batchCount++;
          deletedDocs++;

          if (batchCount >= 400) {
            await batch.commit();
            batch = db.batch();
            batchCount = 0;
          }
        }
      }

      if (batchCount > 0) await batch.commit();
    };

    // Process all known collections
    const allCols = await db.listCollections();
    for (const col of allCols) {
      if (PROTECTED_COLLECTIONS.has(col.id)) {
        log.push(`${col.id}: PRESERVADO (${(await col.count().get()).data().count} docs)`);
        continue;
      }
      try {
        await deleteCollection(col, col.id);
      } catch (err: any) {
        errors.push(`${col.id}: ${err.message || "erro"}`);
      }
    }

    // Final audit
    await auditLog(caller, "system_reset_complete" as any, {
      targetId: "system",
      targetKind: "system",
      reason: "Reset concluído",
      detail: JSON.stringify({ deletedUsers, deletedDocs, processedCollections, errors }),
    });

    return json(req, {
      success: true,
      deletedUsers,
      deletedDocs,
      processedCollections,
      protectedAdmins: Array.from(protectedUids),
      log,
      errors,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return errorResponse(req, "admin-reset", error);
  }
}
