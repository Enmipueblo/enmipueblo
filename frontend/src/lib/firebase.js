import { initializeApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";

// -----------------------------------------------------
// CONFIGURACIÓN DE FIREBASE (solo Auth por ahora)
// -----------------------------------------------------
const firebaseConfig = {
  apiKey: import.meta.env.PUBLIC_FIREBASE_API_KEY,
  authDomain: import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID,
  // lo dejamos para no romper envs existentes, pero ya NO usamos Storage
  storageBucket: import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// -----------------------------------------------------
// Helpers internos: cookies y usuario global
// -----------------------------------------------------
function setUserCookie(user) {
  if (typeof document === "undefined") return;

  if (user && user.email) {
    const maxAge = 60 * 60 * 24 * 30;
    document.cookie = `userEmail=${user.email}; path=/; max-age=${maxAge}`;
  } else {
    document.cookie =
      "userEmail=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  }
}

function setGlobalUser(user) {
  if (typeof window !== "undefined") {
    window.__enmiPuebloUser__ = user || null;
  }
}

// -----------------------------------------------------
// AUTH (solo Google + signOut)
// -----------------------------------------------------
export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  const user = result.user;
  setUserCookie(user);
  setGlobalUser(user);
  return user;
}

export async function signOut() {
  await firebaseSignOut(auth);
  setUserCookie(null);
  setGlobalUser(null);
}

// -----------------------------------------------------
// OBSERVADOR DE USUARIO (mantiene roles si existen)
// -----------------------------------------------------
export function onUserStateChange(callback) {
  if (typeof window === "undefined") {
    callback(null);
    return () => {};
  }

  return onAuthStateChanged(auth, async (user) => {
    setUserCookie(user);
    setGlobalUser(user);

    if (user) {
      try {
        const tokenResult = await user.getIdTokenResult();
        const role = tokenResult.claims?.role || null;
        user.role = role;
        user.isAdmin = role === "admin" || role === "superadmin";
      } catch (err) {
        console.warn("No se pudieron leer los claims de rol:", err);
      }
    }

    callback(user);
  });
}

// -----------------------------------------------------
// ✅ SUBIDA A R2 (mantiene el mismo nombre uploadFile)
// -----------------------------------------------------
function normalizeFolder(tipo) {
  const t = String(tipo || "").trim().replace(/^\/+/, "").replace(/\/+$/, "");
  if (!t) return "service_images/fotos";
  if (t === "service_images/video") return "service_images/videos";
  return t;
}

function xhrPutWithProgress(uploadUrl, file, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", contentType || "application/octet-stream");

    if (xhr.upload && typeof onProgress === "function") {
      xhr.upload.onprogress = (evt) => {
        if (!evt.lengthComputable) return;
        const pct = Math.round((evt.loaded / evt.total) * 100);
        onProgress(Math.min(100, Math.max(0, pct)));
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve(true);
      reject(new Error(`Upload fallo (HTTP ${xhr.status})`));
    };

    xhr.onerror = () => reject(new Error("Upload fallo (network error)"));
    xhr.send(file);
  });
}

export async function uploadFile(file, tipo = "otros", onProgress) {
  if (!file) throw new Error("No se proporcionó archivo");

  // Exigimos sesión para firmar
  const user = auth.currentUser;
  if (!user || !user.uid) throw new Error("Debes iniciar sesión para subir archivos");

  const token = await user.getIdToken();
  const folder = normalizeFolder(tipo);

  const res = await fetch("/api/uploads/sign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      filename: file.name || "archivo",
      contentType: file.type || "application/octet-stream",
      folder,
    }),
  });

  const out = await res.json().catch(() => null);
  if (!res.ok) throw new Error(out?.error || `HTTP ${res.status}`);

  await xhrPutWithProgress(out.uploadUrl, file, file.type, onProgress);

  // preferimos URL pública; si no existe, devolvemos key
  return out.publicUrl || out.key;
}
