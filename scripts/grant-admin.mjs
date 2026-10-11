// Libera ou remove o acesso à administração do Kardap (/admin).
//
// Uso:
//   node scripts/grant-admin.mjs <e-mail ou uid>            libera o acesso
//   node scripts/grant-admin.mjs <e-mail ou uid> --remover  remove o acesso
//
// Requer as variáveis FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL e FIREBASE_ADMIN_PRIVATE_KEY
// (lidas do ambiente ou do .env.local). Sem elas, crie o documento admins/{uid} pelo console do Firebase:
// Firestore Database > Iniciar coleção "admins" > ID do documento = uid da conta > campo grantedAt (texto).
import { readFileSync, existsSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^"(.*)"$/, "$1");
  }
}
loadEnvFile(".env.local");
loadEnvFile(".env");

const [target, flag] = process.argv.slice(2);
if (!target) {
  console.error("Informe o e-mail ou o uid da conta. Ex.: node scripts/grant-admin.mjs voce@empresa.com");
  process.exit(1);
}

const { FIREBASE_ADMIN_PROJECT_ID: projectId, FIREBASE_ADMIN_CLIENT_EMAIL: clientEmail } = process.env;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
if (!projectId || !clientEmail || !privateKey) {
  console.error("Credenciais do Firebase Admin ausentes. Configure FIREBASE_ADMIN_* ou use o console do Firebase (veja o topo deste arquivo).");
  process.exit(1);
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
