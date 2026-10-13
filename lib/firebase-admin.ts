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
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase Admin não configurado. Defina as variáveis FIREBASE_ADMIN_*");
  }
  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    storageBucket: process.env.FIREBASE_ADMIN_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

export const adminAuth = () => getAuth(adminApp());
export const adminDb = () => getFirestore(adminApp());
export const adminBucket = () => getStorage(adminApp()).bucket();
