/**
 * Verificação de acesso pago para rotas de servidor.
 * Preserva o plano gratuito/trial: a UI consulta `GET /api/billing/subscription`
 * para decidir o que mostrar; aqui é só o enforcement no backend.
 */

import { adminAuth } from "@/lib/firebase-admin";
import { getUserSubscription, hasPaidAccess, type SubscriptionRecord } from "./subscriptions";

export type AuthedUser = { uid: string; email: string | null };

export async function requireAuth(authorizationHeader: string | null): Promise<AuthedUser> {
  const token = authorizationHeader?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Response("Não autenticado", { status: 401 });
  const decoded = await adminAuth().verifyIdToken(token);
  return { uid: decoded.uid, email: decoded.email ?? null };
}

export async function requirePaidAccess(uid: string): Promise<SubscriptionRecord> {
  const sub = await getUserSubscription(uid);
  if (!hasPaidAccess(sub)) throw new Response("Assinatura inativa", { status: 402 });
  return sub as SubscriptionRecord;
}
