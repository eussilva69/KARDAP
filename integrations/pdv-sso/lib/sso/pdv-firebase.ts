/**
 * PDV — Firebase do navegador (mesmo projeto do KARDAP, mesmas variáveis NEXT_PUBLIC_FIREBASE_*).
 * O Auth nasce com persistência SÓ em memória: o login do PDV vem sempre da sessão compartilhada e nenhum
 * token fica salvo no navegador. Se o PDV já inicializa o Firebase em outro arquivo, mantenha um único
 * app [DEFAULT] e troque a criação do Auth abaixo por initializeAuth com inMemoryPersistence.
 */
import { getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, inMemoryPersistence, initializeAuth, type Auth } from "firebase/auth";

export function pdvFirebaseApp() {
  return (
    getApps()[0] ||
    initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    })
  );
}

let auth: Auth | null = null;

export function pdvAuth(): Auth {
  if (auth) return auth;
  const app = pdvFirebaseApp();
  try {
    auth = initializeAuth(app, { persistence: inMemoryPersistence });
  } catch {
    auth = getAuth(app);
  }
  // Somente testes locais (projeto demo-*): mesmo emulador usado pelo KARDAP.
  if (process.env.NEXT_PUBLIC_FIREBASE_EMULATORS === "1" && !auth.emulatorConfig) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  }
  return auth;
}
