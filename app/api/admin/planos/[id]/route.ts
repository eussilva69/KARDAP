import type { NextRequest } from "next/server";
import { errorResponse, json, preflight, readJson } from "@/lib/billing/http";
import { authenticateAdmin, auditLog } from "@/lib/admin/server";
import { BillingError } from "@/lib/billing/server";
import { adminDb } from "@/lib/firebase-admin";
import { PLAN_ORDER, type PlanId } from "@/lib/billing/plans";
import { sanitizeOverride, type PlanOverride } from "@/lib/billing/catalog-db";
import { invalidateCatalogCache } from "@/lib/billing/catalog-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

const validId = (id: unknown): id is PlanId => typeof id === "string" && PLAN_ORDER.indexOf(id as PlanId) >= 0;

/**
 * Atualiza o override de um plano. Transacional: lê o estado atual, aplica a mudança, e se `popular: true` foi
 * marcado, desmarca o `popular` dos outros planos no mesmo lote (garante um único "mais popular" por vez).
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = await authenticateAdmin(req);
    if (!validId(params.id)) throw new BillingError("invalid_plan", 400, "Plano desconhecido.");
    const body = await readJson(req);
    const override = sanitizeOverride(body);
    const db = adminDb();
    const col = db.collection("catalogoPlanos");
    const ref = col.doc(params.id);

    const result = await db.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      const before = (current.exists ? current.data() : null) as PlanOverride | null;
      const next: PlanOverride = {
        ...override,
        updatedAt: new Date().toISOString(),
        updatedBy: caller.uid,
      };
      tx.set(ref, next, { merge: false });
      if (override.popular === true) {
        for (const otherId of PLAN_ORDER) {
          if (otherId === params.id) continue;
          const otherRef = col.doc(otherId);
          const other = await tx.get(otherRef);
          if (other.exists && other.get("popular") === true) {
            tx.update(otherRef, { popular: false, updatedAt: next.updatedAt, updatedBy: caller.uid });
          }
        }
      }
      return { before, after: next };
    });

    invalidateCatalogCache();
    await auditLog(caller, "catalog_update", {
      targetKind: "plan",
      targetId: params.id,
      before: result.before,
      after: result.after,
    });

    return json(req, { ok: true, override: result.after });
  } catch (error) {
    return errorResponse(req, "admin.planos.update", error);
  }
}

/** Remove o override, voltando o plano ao catálogo padrão do código. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = await authenticateAdmin(req);
    if (!validId(params.id)) throw new BillingError("invalid_plan", 400, "Plano desconhecido.");
    const ref = adminDb().collection("catalogoPlanos").doc(params.id);
    const current = await ref.get();
    if (!current.exists) return json(req, { ok: true, removed: false });
    const before = current.data();
    await ref.delete();
    invalidateCatalogCache();
    await auditLog(caller, "catalog_update", {
      targetKind: "plan",
      targetId: params.id,
      before,
      after: null,
      reason: "override removido (voltou ao padrão)",
    });
    return json(req, { ok: true, removed: true });
  } catch (error) {
    return errorResponse(req, "admin.planos.delete", error);
  }
}
