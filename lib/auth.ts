import { getAuth } from "firebase/auth";
import { getFirebaseApp } from "./firebase";

export const getFirebaseAuth = () => getAuth(getFirebaseApp());
