/**
 * SSO — sessão central (Firebase Admin SDK). Só no servidor do KARDAP: rotas de API e Server Components.
 *
 * Sessão = Firebase Session Cookie (assinado pelo Google) + registro em Firestore (ssoSessoes/{sha256 do cookie},
 * inacessível ao navegador pelas regras). O registro permite encerrar UMA sessão no logout sem derrubar os outros
 * aparelhos; "sair de todos os aparelhos" revoga os refresh tokens do usuário, o que invalida todas as sessões.
 */
import { createHash, randomBytes } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { RECENT_SIGN_IN_SECONDS, SSO_MAX_AGE_SECONDS } from "./config";
import { SsoError } from "./http";

export * from "./http";

const registry = () => adminDb().collection("ssoSessoes");
/** Identificador da sessão: hash do cookie (o cookie em si nunca é guardado). */
export const sessionKey = (cookie: string) => createHash("sha256").update(cookie).digest("hex");

/**
 * Valor do cookie: "<Firebase Session Cookie>~<identificador aleatório>". O Firebase Session Cookie tem precisão de
 * segundos e assinatura determinística: dois logins da mesma conta no mesmo segundo gerariam o mesmo valor e
 * dividiriam o registro (o logout de um derrubaria o outro). O identificador deixa cada sessão única.
 */
const firebasePart = (cookie: string) => {
  const i = cookie.lastIndexOf("~");
  return i > 0 && /^[A-Za-z0-9_-]{16,}$/.test(cookie.slice(i + 1)) ? cookie.slice(0, i) : "";
};

export type SsoSession = { sid: string; uid: string; email: string | null; emailVerified: boolean; name: string | null; authTime: number; expiresAt: number };

// Cache curtíssimo por instância: junta as verificações de um mesmo carregamento sem atrasar a revogação.
// Revogações feitas em outra instância valem em no máximo 10 segundos.
const cache = new Map<string, { session: SsoSession; until: number }>();
const CACHE_MS = 10_000;

/** Cria a sessão a partir de um ID token recém-emitido (login feito há no máximo 5 minutos). */
export async function createSession(idToken: string) {
  let decoded;
  try {
    decoded = await adminAuth().verifyIdToken(idToken, true);
  } catch {
    throw new SsoError("invalid_token", 401, "Sessão inválida. Entre de novo.");
  }
  if (Date.now() / 1000 - decoded.auth_time > RECENT_SIGN_IN_SECONDS) {
    throw new SsoError("recent_login_required", 401, "Por segurança, entre de novo para continuar.");
  }
  const expiresIn = SSO_MAX_AGE_SECONDS * 1000;
  const cookie = `${await adminAuth().createSessionCookie(idToken, { expiresIn })}~${randomBytes(16).toString("base64url")}`;
  // O registro guarda o mínimo (uid e validade): o id é o hash do cookie, nunca o cookie.
  await registry()
    .doc(sessionKey(cookie))
    .set({
      uid: decoded.uid,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + expiresIn),
      revokedAt: null,
    });
  return { cookie, uid: decoded.uid };
}

/** O registro da sessão existe, é deste uid, não foi encerrado e não venceu. */
export async function sessionRecordActive(sid: string, uid: string) {
  const data = (await registry().doc(sid).get()).data();
  return Boolean(data && !data.revokedAt && data.uid === uid && (data.expiresAt as Timestamp).toMillis() > Date.now());
}

/** Valida a sessão: assinatura, expiração e revogação no Firebase + registro não encerrado. */
export async function verifySession(cookie: string | undefined | null): Promise<SsoSession> {
  if (!cookie) throw new SsoError("no_session", 401, "Sessão ausente.");
  const sid = sessionKey(cookie);
  const hit = cache.get(sid);
  if (hit && hit.until > Date.now()) return hit.session;
  let decoded;
  try {
    decoded = await adminAuth().verifySessionCookie(firebasePart(cookie), true);
  } catch {
    cache.delete(sid);
    throw new SsoError("invalid_session", 401, "Sessão expirada ou encerrada.");
  }
  if (!(await sessionRecordActive(sid, decoded.uid))) {
    cache.delete(sid);
    throw new SsoError("invalid_session", 401, "Sessão expirada ou encerrada.");
  }
  const session: SsoSession = {
    sid,
    uid: decoded.uid,
    email: decoded.email ?? null,
    emailVerified: Boolean(decoded.email_verified),
    name: (decoded.name as string | undefined) ?? null,
    authTime: decoded.auth_time,
    expiresAt: decoded.exp,
  };
  if (cache.size > 2000) cache.forEach((v, k) => v.until < Date.now() && cache.delete(k));
  cache.set(sid, { session, until: Date.now() + CACHE_MS });
  return session;
}

/** Encerra a sessão (registro marcado como revogado). `everywhere`: revoga todas as sessões do usuário. */
export async function revokeSession(cookie: string | undefined | null, everywhere = false) {
  if (!cookie) return;
  const sid = sessionKey(cookie);
  cache.delete(sid);
  await registry().doc(sid).set({ revokedAt: FieldValue.serverTimestamp() }, { merge: true });
  if (everywhere) {
    const decoded = await adminAuth().verifySessionCookie(firebasePart(cookie), false).catch(() => null);
    if (decoded) await adminAuth().revokeRefreshTokens(decoded.uid);
  }
}
