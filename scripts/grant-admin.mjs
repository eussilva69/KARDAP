// Libera ou remove o acesso à administração do Kardap (/admin).
//
// Uso:
//   node scripts/grant-admin.mjs <e-mail ou uid>            libera o acesso
//   node scripts/grant-admin.mjs <e-mail ou uid> --remover  remove o acesso
//
// Credenciais do Firebase Admin (uma das duas opções, lidas do ambiente ou do .env.local/.env):
//  a) FIREBASE_ADMIN_CREDENTIALS: o JSON inteiro da conta de serviço (recomendado).
//  b) FIREBASE_ADMIN_PROJECT_ID + FIREBASE_ADMIN_CLIENT_EMAIL + FIREBASE_ADMIN_PRIVATE_KEY.
// Sem credenciais, crie o documento admins/{uid} pelo console do Firebase:
// Firestore Database > Iniciar coleção "admins" > ID do documento = uid da conta > campo grantedAt (texto).
import { readFileSync, existsSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function loadEnvFile(file) {
  if (!existsSync(file)) return;
  // Lê KEY=valor; o valor pode estar entre aspas simples ou duplas, e pode ser multilinha (até achar
  // a aspa de fechamento). Aspas simples são preservadas literalmente (ideal para o JSON das credenciais).
  const text = readFileSync(file, "utf8");
  let i = 0;
  while (i < text.length) {
    const newlineAt = text.indexOf("\n", i);
    const line = (newlineAt === -1 ? text.slice(i) : text.slice(i, newlineAt)).replace(/\r$/, "");
    i = newlineAt === -1 ? text.length : newlineAt + 1;
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2];
    for (const quote of ["'", '"']) {
      if (value.startsWith(quote)) {
        if (value.length > 1 && value.endsWith(quote)) {
          value = value.slice(1, -1);
        } else {
          const end = text.indexOf(quote, i);
          value = text.slice(i, end === -1 ? text.length : end).replace(/\r$/, "");
          value = match[2].slice(1) + "\n" + value;
          i = end === -1 ? text.length : end + 1 + (text[end + 1] === "\n" ? 1 : 0);
        }
        break;
      }
    }
    process.env[match[1]] = value;
  }
}
loadEnvFile(".env.local");
loadEnvFile(".env");

const [target, flag] = process.argv.slice(2);
if (!target) {
  console.error("Informe o e-mail ou o uid da conta. Ex.: node scripts/grant-admin.mjs voce@empresa.com");
  process.exit(1);
}

const parsed = parseCredentialsJson(process.env.FIREBASE_ADMIN_CREDENTIALS);
const projectId = parsed?.project_id || process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = parsed?.client_email || process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = (parsed?.private_key || process.env.FIREBASE_ADMIN_PRIVATE_KEY || "").replace(/\\n/g, "\n");
if (!projectId || !clientEmail || !privateKey) {
  console.error("Credenciais do Firebase Admin ausentes. Configure FIREBASE_ADMIN_CREDENTIALS (JSON) ou as três FIREBASE_ADMIN_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY (veja o topo deste arquivo).");
  process.exit(1);
}

function parseCredentialsJson(raw) {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    try {
      return JSON.parse(Buffer.from(trimmed, "base64").toString("utf8"));
    } catch {
      return null;
    }
  }
}

initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const auth = getAuth();
const db = getFirestore();

const user = target.includes("@") ? await auth.getUserByEmail(target) : await auth.getUser(target);
const ref = db.collection("admins").doc(user.uid);

if (flag === "--remover") {
  await ref.delete();
  console.log(`Acesso à administração removido de ${user.email || user.uid}.`);
} else {
  await ref.set({ email: user.email || null, grantedAt: new Date().toISOString(), grantedBy: "scripts/grant-admin.mjs" }, { merge: true });
  console.log(`Acesso à administração liberado para ${user.email || user.uid} (uid ${user.uid}).`);
}
process.exit(0);
