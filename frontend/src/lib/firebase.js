import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from "firebase/auth";

// Importante:
// - Firebase se usa SOLO para Auth (Google Sign-In).
// - Las subidas de imagen/video se hacen a Cloudflare R2 via URL firmada del backend (/api/uploads/sign).

const firebaseConfig = {
  apiKey: import.meta.env.FIREBASE_API_KEY,
  authDomain: import.meta.env.FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.FIREBASE_STORAGE_BUCKET, // ya no se usa para uploads, pero lo dejamos por compatibilidad
  messagingSenderId: import.meta.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.FIREBASE_APP_ID,
  measurementId: import.meta.env.FIREBASE_MEASUREMENT_ID,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
const provider = new GoogleAuthProvider();

/**
 * Guarda el usuario en cookie (para SSR / UI)
 */
function setUserCookie(user) {
  if (!user) {
    document.cookie = `userData=; path=/; max-age=0`;
    return;
  }
  const userData = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
  };
  document.cookie = `userData=${encodeURIComponent(
    JSON.stringify(userData)
  )}; path=/; max-age=604800`;
}

/**
 * Expone el usuario globalmente
 */
function setGlobalUser(user) {
  if (!user) {
    window.user = null;
    return;
  }
  window.user = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
  };
}

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, provider);
  setUserCookie(result.user);
  setGlobalUser(result.user);
  return result.user;
}

export async function signOut() {
  await firebaseSignOut(auth);
  setUserCookie(null);
  setGlobalUser(null);
}

export function onUserStateChange(callback) {
  return onAuthStateChanged(auth, (user) => {
    setUserCookie(user);
    setGlobalUser(user);
    callback(user);
  });
}

export async function getAuthToken() {
  const user = auth.currentUser;
  if (!user) return null;
  return await user.getIdToken();
}

/**
 * =========================
 * R2 Uploader (imagenes + video)
 * =========================
 */

function getApiBase() {
  const raw =
    import.meta.env.PUBLIC_API_URL ||
    import.meta.env.PUBLIC_BACKEND_URL ||
    import.meta.env.PUBLIC_BACKEND ||
    "";
  const base = String(raw || "").trim().replace(/\/+$/, "");
  if (!base) return "/api";
  if (base.endsWith("/api")) return base;
  return `${base}/api`;
}

function sanitizePrefix(prefix) {
  const p = String(prefix || "otros")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  return p || "otros";
}

function randomId() {
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getExtFromName(name) {
  const n = String(name || "");
  const idx = n.lastIndexOf(".");
  if (idx === -1) return "";
  const ext = n.slice(idx + 1).toLowerCase();
  return ext.replace(/[^a-z0-9]/g, "");
}

function baseName(name) {
  const n = String(name || "");
  const idx = n.lastIndexOf(".");
  return idx === -1 ? n : n.slice(0, idx);
}

function safeFileName(originalName, forcedExt) {
  const ext = String(forcedExt || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const bn = baseName(originalName)
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);

  const finalBase = bn || "archivo";
  return `${finalBase}.${ext || "bin"}`;
}

async function optimizeImageToWebp(file, opts = {}) {
  const maxSide = Number(opts.maxSide) || 1600;
  const quality = typeof opts.quality === "number" ? opts.quality : 0.82;

  // Si no se puede procesar (o no es browser), subimos tal cual
  if (typeof document === "undefined" || typeof createImageBitmap === "undefined") {
    return { blob: file, contentType: file.type || "application/octet-stream", ext: getExtFromName(file.name) || "bin" };
  }

  const bitmap = await createImageBitmap(file);
  const w0 = bitmap.width;
  const h0 = bitmap.height;

  const scale = Math.min(1, maxSide / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, w, h);

  if (typeof bitmap.close === "function") bitmap.close();

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("No se pudo generar WEBP"))),
      "image/webp",
      quality
    );
  });

  return { blob, contentType: "image/webp", ext: "webp" };
}

function putWithProgress(url, blob, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);

    if (contentType) xhr.setRequestHeader("Content-Type", contentType);

    xhr.upload.onprogress = (evt) => {
      if (!onProgress) return;
      if (evt.lengthComputable) {
        const pct = Math.round((evt.loaded / evt.total) * 100);
        onProgress(pct);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      reject(
        new Error(
          `Upload fallo (${xhr.status}): ${xhr.responseText || xhr.statusText || "error"}`
        )
      );
    };

    xhr.onerror = () => reject(new Error("Upload fallo (network error)"));
    xhr.send(blob);
  });
}

/**
 * Subida única a R2 (imagenes y video)
 * @param {File|Blob} file
 * @param {string} tipo prefijo (ej: "service_images/fotos" o "service_images/videos")
 * @param {(pct:number)=>void} onProgress
 * @returns {Promise<string>} publicUrl
 */
export async function uploadFile(file, tipo = "otros", onProgress) {
  if (!file) throw new Error("Falta archivo");

  const user = auth.currentUser;
  if (!user) throw new Error("No autorizado (sin sesión)");

  const token = await user.getIdToken();

  const originalType = String(file.type || "");
  const isImage = originalType.startsWith("image/");
  const isVideo = originalType.startsWith("video/");

  if (!isImage && !isVideo) {
    throw new Error("Archivo no soportado. Usa imagen o video.");
  }

  let blob = file;
  let contentType = originalType || "application/octet-stream";
  let ext = getExtFromName(file.name);

  if (isImage) {
    const optimized = await optimizeImageToWebp(file, { maxSide: 1600, quality: 0.82 });
    blob = optimized.blob;
    contentType = optimized.contentType;
    ext = optimized.ext;
  } else {
    // Videos: recomendados MP4 o WEBM
    const allowed = new Set(["video/mp4", "video/webm", "video/quicktime", "application/octet-stream"]);
    if (!allowed.has(contentType)) {
      throw new Error("Video no soportado. Sube MP4 o WebM.");
    }

    // Si el navegador no detecta el type, intentamos por extensión
    if (contentType === "application/octet-stream") {
      const guessed = (ext || "").toLowerCase();
      if (guessed === "mp4") contentType = "video/mp4";
      else if (guessed === "webm") contentType = "video/webm";
      else if (guessed === "mov") contentType = "video/quicktime";
      else throw new Error("No se pudo detectar el tipo de video. Usa MP4 o WebM.");
    }
  }

  const prefix = sanitizePrefix(tipo);
  const finalName = safeFileName(file.name, ext || (isVideo ? "mp4" : "webp"));

  const key = `${prefix}/${user.uid}/${Date.now()}_${randomId()}_${finalName}`;

  const apiBase = getApiBase();
  const signUrl = `${apiBase}/uploads/sign`;

  const signRes = await fetch(signUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      key,
      contentType,
      size: blob.size,
    }),
  });

  if (!signRes.ok) {
    const txt = await signRes.text().catch(() => "");
    throw new Error(`No se pudo firmar upload: ${signRes.status} ${txt}`);
  }

  const data = await signRes.json().catch(() => ({}));
  if (!data.putUrl) throw new Error("Respuesta inválida del servidor (sin putUrl)");
  if (!data.publicUrl) throw new Error("Respuesta inválida del servidor (sin publicUrl)");

  await putWithProgress(data.putUrl, blob, contentType, onProgress);

  return data.publicUrl;
}
