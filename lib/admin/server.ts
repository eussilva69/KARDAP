/**
 * Autenticação e auditoria da administração (admins/{uid}). Só servidor.
 *
 * O chamador precisa de token Firebase válido e documento `admins/{uid}` existente — qualquer outra conta recebe
 * 403, mesmo que consiga driblar o painel. Toda ação de escrita grava um registro em `adminLog` com antes/depois.
 */
import type { NextRequest } from "next/server";
import { authenticate } from "@/lib/billing/http";
import { BillingError } from "@/lib/billing/server";
import { adminDb } from "@/lib/firebase-admin";

export type AdminCaller = { uid: string; email: string | null };

/** Autentica Bearer e confere `admins/{uid}`. Lança 403 para quem não é admin. */
export async function authenticateAdmin(req: NextRequest): Promise<AdminCaller> {
  const caller = await authenticate(req, null);
  const snap = await adminDb().collection("admins").doc(caller.uid).get();
  if (!snap.exists) throw new BillingError("forbidden", 403, "Acesso restrito à administração do KARDAP.");
  return { uid: caller.uid, email: caller.email };
}

export type AuditAction =
  | "catalog_update"
  | "extend_trial"
  | "suspend"
  | "reactivate"
  | "set_subscription"
  | "reconcile_usage"
  | "resolve_failure"
  | "system_reset"
  | "system_reset_complete";

/**
 * Grava uma ação administrativa em `adminLog`. Mesmo formato das entradas antigas (string ISO em `createdAt`,
 * campos `restaurantId`/`restaurantName` presentes mesmo quando o alvo não é um restaurante — ficam vazios), para
 * o visualizador atual listar junto. Nunca lança: a auditoria não pode derrubar a operação principal.
 */
export async function auditLog(
  caller: AdminCaller,
  action: AuditAction,
  params: { targetId: string; targetKind: string; before?: unknown; after?: unknown; reason?: string; detail?: string },
) {
  try {
    await adminDb()
      .collection("adminLog")
      .add({
        adminUid: caller.uid,
        adminEmail: caller.email || "",
        restaurantId: params.targetKind === "restaurant" ? params.targetId : "",
        restaurantName: "",
        action,
        targetId: params.targetId,
        targetKind: params.targetKind,
        detail: params.detail || `${params.targetKind}/${params.targetId}`,
        before: params.before ?? null,
        after: params.after ?? null,
        reason: params.reason || "",
        createdAt: new Date().toISOString(),
      });
  } catch (error) {
    console.error("[admin] falha ao gravar adminLog:", (error as { message?: string })?.message || error);
  }
}
