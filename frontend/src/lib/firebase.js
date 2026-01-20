import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

function readEnv(key) {
  try {
    if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env[key] != null) {
      return import.meta.env[key];
    }
  } catch {}

  try {
    if (typeof window !== "undefined" && window.__ENV && window.__ENV[key] != null) {
      return window.__ENV[key];
    }
  } catch {}

  try {
    if (typeof process !== "undefined" && process.env && process.env[key] != null) {
      return process.env[key];
    }
  } catch {}

  return "";
}

const envKeys = [
  "PUBLIC_FIREBASE_API_KEY",
  "PUBLIC_FIREBASE_AUTH_DOMAIN",
  "PUBLIC_FIREBASE_PROJECT_ID",
  "PUBLIC_FIREBASE_STORAGE_BUCKET",
  "PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "PUBLIC_FIREBASE_APP_ID",
];

export const missingFirebaseEnvs = envKeys.filter((k) => !readEnv(k));
export const firebaseReady = missingFirebaseEnvs.length === 0;

export const firebaseConfig = {
  apiKey: readEnv("PUBLIC_FIREBASE_API_KEY"),
  authDomain: readEnv("PUBLIC_FIREBASE_AUTH_DOMAIN"),
  projectId: readEnv("PUBLIC_FIREBASE_PROJECT_ID"),
  storageBucket: readEnv("PUBLIC_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: readEnv("PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
  appId: readEnv("PUBLIC_FIREBASE_APP_ID"),
  measurementId: readEnv("PUBLIC_FIREBASE_MEASUREMENT_ID"),
};

let app = null;
let auth = null;
let googleProvider = null;

if (typeof window !== "undefined") {
  if (!firebaseReady) {
    console.error("[firebase] Faltan envs PUBLIC_FIREBASE_* (no se inicializa):", missingFirebaseEnvs);
  } else {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    googleProvider = new GoogleAuthProvider();
  }
}

export { app, auth, googleProvider };
