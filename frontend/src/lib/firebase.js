// frontend/src/lib/firebase.js
import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
} from "firebase/auth";

const env = import.meta.env;

const REQUIRED_ENVS = [
  "PUBLIC_FIREBASE_API_KEY",
  "PUBLIC_FIREBASE_AUTH_DOMAIN",
  "PUBLIC_FIREBASE_PROJECT_ID",
  "PUBLIC_FIREBASE_STORAGE_BUCKET",
  "PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "PUBLIC_FIREBASE_APP_ID",
];

function getMissingEnvs() {
  return REQUIRED_ENVS.filter((k) => !env?.[k] || String(env[k]).trim() === "");
}

let app = null;
let auth = null;

function initFirebase() {
  const missing = getMissingEnvs();
  if (missing.length) {
    console.warn("[firebase] Faltan envs PUBLIC_FIREBASE_* (no se inicializa).", missing);
    return;
  }

  const firebaseConfig = {
    apiKey: env.PUBLIC_FIREBASE_API_KEY,
    authDomain: env.PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: env.PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: env.PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.PUBLIC_FIREBASE_APP_ID,
    measurementId: env.PUBLIC_FIREBASE_MEASUREMENT_ID || undefined,
  };

  if (!getApps().length) app = initializeApp(firebaseConfig);
  else app = getApps()[0];

  auth = getAuth(app);
}

initFirebase();

export { app, auth };

export function onUserStateChange(cb) {
  if (!auth) {
    cb?.(null);
    return () => {};
  }
  return onAuthStateChanged(auth, (u) => cb?.(u || null));
}

export async function signInWithGoogle() {
  if (!auth) throw new Error("Firebase no configurado");
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const res = await signInWithPopup(auth, provider);
  return res.user;
}

export async function signOut() {
  if (!auth) return;
  await fbSignOut(auth);
}

function backendBase() {
  return env.PUBLIC_BACKEND_URL || "/api";
}

function r2PublicBase() {
  return env.PUBLIC_R2_PUBLIC_BASE_URL || "https://media.enmipueblo.com";
}

function safeName(name) {
  return String(name || "file")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "");
}

async function waitForUser(ms = 5000) {
  if (!auth) return null;
  if (auth.currentUser) return auth.currentUser;

  return await new Promise((resolve) => {
    const t = setTimeout(() => {
      unsub?.();
      resolve(null);
    }, ms);

    const unsub = onAuthStateChanged(auth, (u) => {
      clearTimeout(t);
      unsub?.();
      resolve(u || null);
    });
  });
}

async function getAuthContextOrThrow() {
  const u = await waitForUser(6000);
  if (!u) throw new Error("No autorizado (sin sesión)");
  const token = await u.getIdToken();
  return { uid: u.uid, token };
}

function putWithProgress(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

    xhr.upload.onprogress = (e) => {
      if (!onProgress) return;
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        onProgress(Math.min(99, Math.max(1, pct)));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`upload failed ${xhr.status}: ${xhr.responseText || ""}`));
    };

    xhr.onerror = () => reject(new Error("upload network error"));
    xhr.send(file);
  });
}

/**
 * uploadFile(file, "service_images/fotos", cb)
 * => key final: service_images/fotos/<uid>/<timestamp>_<rand>_<name>
 */
export async function uploadFile(file, folder = "service_images/fotos", onProgress) {
  if (!file) throw new Error("Falta archivo");
  if (!auth) throw new Error("Firebase no configurado");

  const progress = typeof onProgress === "function" ? onProgress : null;
  progress?.(1);

  const { uid, token } = await getAuthContextOrThrow();

  const key = `${folder}/${uid}/${Date.now()}_${Math.random().toString(16).slice(2)}_${safeName(
    file.name
  )}`;

  const signRes = await fetch(`${backendBase()}/uploads/sign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      key,
      contentType: file.type || "application/octet-stream",
      size: file.size,
    }),
  });

  if (!signRes.ok) {
    const text = await signRes.text();
    throw new Error(`sign failed ${signRes.status}: ${text}`);
  }

  const data = await signRes.json();
  const uploadUrl = data.uploadUrl || data.url || data.signedUrl;
  const publicUrl =
    data.publicUrl ||
    (data.key ? `${r2PublicBase()}/${data.key}` : `${r2PublicBase()}/${key}`);

  if (!uploadUrl) throw new Error("Respuesta de firmado inválida (sin uploadUrl)");

  progress?.(5);
  await putWithProgress(uploadUrl, file, (pct) => progress?.(pct));
  progress?.(100);

  return publicUrl;
}
