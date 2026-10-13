/**
 * SSO — credencial do Firebase para os outros aplicativos (ex.: o PDV), no estilo "authorization code".
 * Só no servidor do KARDAP.
 *
 * 1. O navegador do aplicativo pede um código ao servidor central (POST /api/sso/code): Origin do aplicativo,
 *    CSRF, sessão central válida e permissão para o aplicativo. O código vale 60 s, é de uso único e fica ligado
 *    ao aplicativo, ao usuário e à sessão central. Vai no corpo da resposta, nunca em URL.
 * 2. O navegador entrega o código ao SERVIDOR do aplicativo, que o troca (POST /api/sso/token) autenticado com
 *    o segredo do cliente. Só então sai um Firebase Custom Token do mesmo uid.
 * Sem o segredo, que nunca sai dos servidores, um código não vale nada: um script em outro subdomínio que
 * receba o cookie da sessão não consegue credencial do Firebase.
 *
 * O código é assinado (HMAC) e autossuficiente; o Firestore só guarda "já usado" (ssoCodigosUsados/{jti}).
 */
import { createHash, createHmac, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { SSO_CLIENTS } from "./config";
import { appAccess, type AppName, type AppRestaurant } from "./access";
import { SsoError, rateLimit, safeEqual, sessionRecordActive, type SsoSession } from "./server";

export const CODE_TTL_SECONDS = 60;

/**
 * Chave das assinaturas dos códigos. SSO_SIGNING_SECRET (32+ caracteres) ou, sem ela, derivada da chave privada
 * do Admin SDK, que só o servidor central tem (a mesma em todas as instâncias). Com os emuladores (testes, projeto
 * demo-*, que nunca acessa serviços reais), uma chave fixa: precisa valer entre recompilações do next dev.
 */
function signingKey(): Buffer {
  const explicit = process.env.SSO_SIGNING_SECRET || "";
  if (explicit.length >= 32) return createHash("sha256").update(explicit).digest();
  const project = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "";
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST && project.startsWith("demo-")) {
    return createHash("sha256").update(`kardap-sso-emulador:${project}`).digest();
  }
  const adminKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY || "";
  if (adminKey) return createHmac("sha256", adminKey).update("kardap-sso-code-v1").digest();
  throw new SsoError("sso_not_configured", 503, "SSO não configurado no servidor.");
}

const b64 = (value: Buffer | string) => Buffer.from(value).toString("base64url");
const sign = (payload: string) => b64(createHmac("sha256", signingKey()).update(payload).digest());

type CodePayload = { v: 1; sub: string; aud: string; sid: string; iat: number; exp: number; jti: string };

/** Emite o código para um aplicativo, a partir de uma sessão central já validada. */
export function issueCode(session: SsoSession, clientId: string) {
  const now = Math.floor(Date.now() / 1000);
  const payload: CodePayload = { v: 1, sub: session.uid, aud: clientId, sid: session.sid, iat: now, exp: now + CODE_TTL_SECONDS, jti: randomBytes(16).toString("hex") };
  const body = b64(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

// ───────────────────────── Clientes ─────────────────────────

function clientSecret(clientId: string) {
  const secret = process.env[`SSO_CLIENT_SECRET_${clientId.toUpperCase()}`] || "";
  return secret.length >= 32 ? secret : "";
}

/**
 * Autentica o servidor do aplicativo: Authorization: Basic base64(client_id:client_secret).
 * Falhas contam no limite de tentativas por IP.
 */
export function authenticateClient(req: NextRequest): string {
  const header = req.headers.get("authorization") || "";
  let id = "";
  let secret = "";
  if (/^Basic\s+/i.test(header)) {
    const decoded = Buffer.from(header.replace(/^Basic\s+/i, ""), "base64").toString("utf8");
    const sep = decoded.indexOf(":");
    if (sep > 0) [id, secret] = [decoded.slice(0, sep), decoded.slice(sep + 1)];
  }
  const expected = SSO_CLIENTS[id] ? clientSecret(id) : "";
  const digest = (s: string) => createHash("sha256").update(s).digest("hex");
  if (!expected || !safeEqual(digest(secret), digest(expected))) {
    rateLimit(req, "sso-client-fail", 20, 10 * 60_000);
    if (SSO_CLIENTS[id] && !clientSecret(id)) throw new SsoError("sso_not_configured", 503, "SSO não configurado para este aplicativo.");
    throw new SsoError("invalid_client", 401, "Aplicativo não autenticado.");
  }
  return id;
}

// ───────────────────────── Troca do código ─────────────────────────

export type Redeemed = { uid: string; email: string | null; name: string | null; restaurants: AppRestaurant[]; token: string };

/** Troca o código por um custom token, conferindo de novo a sessão central, a revogação e a permissão. */
export async function redeemCode(code: string, clientId: string): Promise<Redeemed> {
  const invalid = () => new SsoError("invalid_grant", 400, "Código inválido, vencido ou já usado.");
  const [body, signature] = typeof code === "string" && code.length < 1024 ? code.split(".") : [];
  if (!body || !signature || !safeEqual(signature, sign(body))) throw invalid();
  let payload: CodePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw invalid();
  }
  if (payload.v !== 1 || payload.aud !== clientId || payload.exp <= Math.floor(Date.now() / 1000)) throw invalid();

  // Uso único: o primeiro a gravar vence (create falha se o documento já existe).
  try {
    await adminDb()
      .collection("ssoCodigosUsados")
      .doc(payload.jti)
      .create({ aud: payload.aud, usedAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromMillis(payload.exp * 1000) });
  } catch {
    throw invalid();
  }

  // A sessão que pediu o código continua válida? (logout ou "sair de todos" depois da emissão invalidam)
  if (!(await sessionRecordActive(payload.sid, payload.sub))) throw new SsoError("invalid_grant", 400, "A sessão foi encerrada.");
  const user = await adminAuth()
    .getUser(payload.sub)
    .catch(() => null);
  const revokedAfter = user?.tokensValidAfterTime ? Date.parse(user.tokensValidAfterTime) / 1000 : 0;
  if (!user || user.disabled || revokedAfter > payload.iat) throw new SsoError("invalid_grant", 400, "A sessão foi encerrada.");

  const access = await appAccess(payload.sub, clientId as AppName);
  if (!access.allowed) throw new SsoError("forbidden", 403, "Esta conta não tem acesso a este aplicativo.");
  const token = await adminAuth().createCustomToken(payload.sub, { kardapApp: clientId });
  return { uid: payload.sub, email: user.email ?? null, name: user.displayName ?? null, restaurants: access.restaurants, token };
}
