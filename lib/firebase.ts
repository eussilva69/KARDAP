import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

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

export const getDb = () => getFirestore(getFirebaseApp());
export const getStorageService = () => getStorage(getFirebaseApp());
