import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { connectFirestoreEmulator, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore } from "firebase/firestore";

// Chaves públicas do projeto Firebase. As regras do Firestore continuam sendo
// responsáveis por definir quem pode ler e alterar os dados.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId,
);

let initializedApp: FirebaseApp | undefined;

export function getFirebaseApp() {
  if (!isFirebaseConfigured) {
    throw new Error("Firebase não está configurado neste ambiente.");
  }
  if (!initializedApp) {
    initializedApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
  }
  return initializedApp;
}

/**
 * Emuladores locais do Firebase (desenvolvimento e testes de ponta a ponta), ligados só com
 * NEXT_PUBLIC_FIREBASE_EMULATORS=1. Portas em firebase.json. Sem a variável, nada muda.
 */
export const useEmulators = process.env.NEXT_PUBLIC_FIREBASE_EMULATORS === "1";
export const EMULATOR_HOST = "127.0.0.1";

let db: Firestore | undefined;
export const getDb = () => {
  if (db) return db;
  // persistentLocalCache: serve dados do IndexedDB instantaneamente em recarregamentos e F5.
  // Não aumenta leituras no Firestore — apenas acelera a entrega local.
  db = initializeFirestore(getFirebaseApp(), {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  if (useEmulators) connectFirestoreEmulator(db, EMULATOR_HOST, 8080);
  return db;
};
// O Storage é inicializado em lib/storage.ts, carregado só pelo painel e pela configuração inicial.
