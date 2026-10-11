import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirebaseApp } from "./firebase";

let persistenceInitialized = false;

export const getFirebaseAuth = () => {
  const auth = getAuth(getFirebaseApp());
  if (typeof window !== "undefined" && !persistenceInitialized) {
    persistenceInitialized = true;
    setPersistence(auth, browserLocalPersistence).catch(() => {
      // Ignore if offline or not supported
    });
  }
  return auth;
};
