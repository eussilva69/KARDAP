import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

function adminApp() {
  if (getApps().length) return getApps()[0]!;
  // Testes locais (docs/TESTES.md): com os emuladores, o SDK não usa credencial nenhuma e só aceita projetos
  // "demo-*", que nunca acessam serviços reais. Em produção essas variáveis não existem.
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST) {
    const demoProject = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "";
    if (!demoProject.startsWith("demo-")) throw new Error("Emuladores do Firebase só com projeto demo-*.");
    return initializeApp({ projectId: demoProject, storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET });
  }
  // Credencial: aceita duas formas (a primeira que estiver preenchida vale).
  //  a) FIREBASE_ADMIN_CREDENTIALS: o JSON inteiro da conta de serviço (o arquivo baixado do console do Firebase),
  //     colado como está, com quebras de linha reais ou escapadas (\n). É o modo recomendado em produção.
  //  b) FIREBASE_ADMIN_PROJECT_ID + FIREBASE_ADMIN_CLIENT_EMAIL + FIREBASE_ADMIN_PRIVATE_KEY: compatibilidade com
  //     ambientes antigos; cada campo em sua própria variável.
  const parsed = parseCredentialsJson(process.env.FIREBASE_ADMIN_CREDENTIALS);
  const projectId = parsed?.project_id || process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = parsed?.client_email || process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = (parsed?.private_key || process.env.FIREBASE_ADMIN_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase Admin não configurado. Defina FIREBASE_ADMIN_CREDENTIALS (JSON da conta de serviço) ou as três FIREBASE_ADMIN_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY.");
  }
  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    storageBucket: process.env.FIREBASE_ADMIN_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

/**
 * Lê o JSON da conta de serviço. Aceita o conteúdo literal do arquivo baixado do Firebase (com quebras reais ou
 * escapadas) e também base64 do mesmo JSON (útil quando o painel do provedor não preserva quebras). Devolve `null`
 * se a variável não foi definida; lança se foi definida mas está inválida, para a falha aparecer no log em vez de
 * virar silenciosamente um "não configurado".
 */
function parseCredentialsJson(raw: string | undefined): { project_id?: string; client_email?: string; private_key?: string } | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const candidates = trimmed.startsWith("{") ? [trimmed] : [tryBase64(trimmed), trimmed];
  for (const text of candidates) {
    if (!text) continue;
    try {
      const parsed = JSON.parse(text) as { project_id?: string; client_email?: string; private_key?: string };
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // tenta o próximo candidato
    }
  }
  throw new Error("FIREBASE_ADMIN_CREDENTIALS inválido: cole o JSON da conta de serviço (ou o mesmo JSON em base64).");
}

function tryBase64(value: string): string | null {
  if (!/^[A-Za-z0-9+/=_-]+$/.test(value)) return null;
  try {
    return Buffer.from(value, "base64").toString("utf8");
  } catch {
    return null;
  }
}

export const adminAuth = () => getAuth(adminApp());
export const adminDb = () => getFirestore(adminApp());
export const adminBucket = () => getStorage(adminApp()).bucket();
