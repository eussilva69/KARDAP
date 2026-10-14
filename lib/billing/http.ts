/**
 * Autenticação e respostas das APIs de planos (somente servidor).
 *
 * Duas formas de chamar, as duas validadas no servidor central:
 * - Bearer <Firebase ID token>: o painel do KARDAP e o navegador do PDV (que entra com o mesmo uid);
 * - Basic <client_id:client_secret> + { session: "<cookie kardap_sso_session>" } no corpo: o SERVIDOR do PDV,
 *   como em /api/sso/introspect. O PDV não precisa de credencial do Firebase Admin.
 * Identidade anônima (curtidas no cardápio) nunca é aceita.
 */
import { NextResponse, type NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { authenticateClient } from "@/lib/sso/oauth";
import { SsoError, logSsoError, verifySession, withCors } from "@/lib/sso/server";
import { BillingError } from "./server";

export type Caller = { uid: string; email: string | null; via: "token" | "client"; clientId?: string };

export async function authenticate(req: NextRequest, body?: { session?: unknown } | null): Promise<Caller> {
  const header = req.headers.get("authorization") || "";
  if (/^Bearer\s+/i.test(header)) {
    try {
      const decoded = await adminAuth().verifyIdToken(header.replace(/^Bearer\s+/i, ""));
      if (decoded.firebase?.sign_in_provider === "anonymous") throw new Error("anonymous");
      return { uid: decoded.uid, email: decoded.email ?? null, via: "token" };
    } catch {
      throw new BillingError("unauthenticated", 401, "Sessão inválida ou expirada. Entre de novo.");
    }
  }
  if (/^Basic\s+/i.test(header)) {
    const clientId = authenticateClient(req);
    const session = typeof body?.session === "string" && body.session.length < 4096 ? body.session : "";
    try {
      const central = await verifySession(session);
      return { uid: central.uid, email: central.email, via: "client", clientId };
    } catch {
      throw new BillingError("unauthenticated", 401, "Sessão expirada ou encerrada. Entre de novo.");
    }
  }
  throw new BillingError("unauthenticated", 401, "Não autenticado.");
}

/** Resposta de erro padrão { error, message, ...detalhes }; erros inesperados viram 500 genérico (sem detalhes internos). */
export function errorResponse(req: NextRequest, scope: string, error: unknown) {
  let status = 500;
  let body: Record<string, unknown> = { error: "server_error", message: "Não foi possível concluir agora. Tente de novo." };
  if (error instanceof BillingError) {
    status = error.status;
    body = { error: error.code, message: error.message, ...error.details };
  } else if (error instanceof SsoError) {
    status = error.status;
    body = { error: error.code, message: error.message };
  } else if ((error as { code?: unknown })?.code === 10 || /contention|aborted/i.test(String((error as Error)?.message || ""))) {
    // Muitas confirmações ao mesmo tempo no mesmo estabelecimento: nada foi gravado; pode tentar de novo.
    status = 503;
    body = { error: "busy", message: "Muitos pedidos ao mesmo tempo. Tente de novo em instantes." };
  } else {
    logSsoError(`billing ${scope}`, error);
  }
  return json(req, body, status);
}

export function json(req: NextRequest, body: unknown, status = 200) {
  return withCors(req, NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } }));
}

/** CORS para o navegador do PDV (Bearer token): autoriza o cabeçalho Authorization. */
export function preflight(req: NextRequest) {
  const res = withCors(req, new NextResponse(null, { status: 204 }));
  if (res.headers.get("Access-Control-Allow-Origin")) res.headers.set("Access-Control-Allow-Headers", "content-type, authorization, x-csrf-token");
  return res;
}

export async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}
