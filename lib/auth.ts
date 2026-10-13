import { connectAuthEmulator, getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { EMULATOR_HOST, getFirebaseApp, useEmulators } from "./firebase";

let persistenceInitialized = false;

export const getFirebaseAuth = () => {
  const auth = getAuth(getFirebaseApp());
  if (useEmulators && !auth.emulatorConfig) connectAuthEmulator(auth, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
  if (typeof window !== "undefined" && !persistenceInitialized) {
    persistenceInitialized = true;
    setPersistence(auth, browserLocalPersistence).catch(() => {
      // Ignore if offline or not supported
    });
  }
  return auth;
};
