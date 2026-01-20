// frontend/src/lib/firebase.js
// Cliente Firebase SOLO para Google Sign-In + helper de uploads a R2 (vía /api/uploads/sign)
// Importante: no inicializa Firebase en build/SSR (Astro) para evitar errores en "astro build".

export let auth = null; // <- export requerido por src/lib/api-utils.js (live binding)

let _app = null;
let _provider = null;
let _initPromise = null;

function getEnv(name) {
  try {
    return import.meta?.env?.[name];
  } catch {
    return undefined;
  }
}

function firebaseConfigFromEnv() {
  // Soportamos PUBLIC_* y VITE_* por si cambiaste prefijos
  const pick = (k) => getEnv(k) || getEnv(`VITE_${k}`) || "";

  return {
    apiKey: pick("PUBLIC_FIREBASE_API_KEY"),
    authDomain: pick("PUBLIC_FIREBASE_AUTH_DOMAIN"),
    projectId: pick("PUBLIC_FIREBASE_PROJECT_ID"),
    storageBucket: pick("PUBLIC_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: pick("PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
    appId: pick("PUBLIC_FIREBASE_APP_ID"),
    measurementId: pick("PUBLIC_FIREBASE_MEASUREMENT_ID"),
  };
}

async function ensureFirebase() {
  // En build/SSR no hay window -> no inicializamos nada
  if (typeof window === "undefined") return null;
  if (auth && _app) return { app: _app, auth, provider: _provider };
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const cfg = firebaseConfigFromEnv();
    if (!cfg.apiKey || !cfg.authDomain || !cfg.projectId) {
      console.warn("[firebase] Faltan envs PUBLIC_FIREBASE_* (no se inicializa).");
      return null;
    }

    const { initializeApp, getApps } = await import("firebase/app");
    const {
      getAuth,
      GoogleAuthProvider,
      setPersistence,
      browserLocalPersistence,
    } = await import("firebase/auth");

    _app = getApps().length ? getApps()[0] : initializeApp(cfg);

    auth = getAuth(_app);
    _provider = new GoogleAuthProvider();

    // Persistencia local (si falla, seguimos igual)
    try {
      await setPersistence(auth, browserLocalPersistence);
    } catch {}

    return { app: _app, auth, provider: _provider };
  })();

  return _initPromise;
}

// Inicializa “en caliente” en el navegador (sin romper SSR/build)
if (typeof window !== "undefined") {
  // no await: solo dispara init
  ensureFirebase().catch(() => {});
}

// =======================
// AUTH (Google Sign-In)
// =======================
export async function signInWithGoogle() {
  const fb = await ensureFirebase();
  if (!fb?.auth || !fb?.provider) throw new Error("Firebase no configurado");
  const { signInWithPopup } = await import("firebase/auth");
  return signInWithPopup(fb.auth, fb.provider);
}

export async function signOut() {
  const fb = await ensureFirebase();
  if (!fb?.auth) return;
  const { signOut: firebaseSignOut } = await import("firebase/auth");
  return firebaseSignOut(fb.auth);
}

export function onUserStateChange(cb) {
  let unsub = null;
  let cancelled = false;

  ensureFirebase()
    .then(async (fb) => {
      if (cancelled || !fb?.auth) return;
      const { onAuthStateChanged } = await import("firebase/auth");
      unsub = onAuthStateChanged(fb.auth, (user) => cb?.(user || null));
    })
    .catch(() => {});

  return () => {
    cancelled = true;
    if (typeof unsub === "function") unsub();
  };
}

export async function getFirebaseToken() {
  try {
    const fb = await ensureFirebase();
    const u = fb?.auth?.currentUser;
    if (!u?.getIdToken) return null;
    return await u.getIdToken();
  } catch {
    return null;
  }
}

// =======================
// UPLOAD a R2 (Signed PUT)
// =======================

function safeName(name) {
  return String(name || "file")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w.\-]+/g, "")
    .slice(0, 120);
}

function rand(n = 8) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < n; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function maybeCompressImage(file) {
  if (!file?.type?.startsWith("image/")) return file;

  // Si ya es webp y es chica, no tocamos
  if (file.type === "image/webp" && file.size <= 900_000) return file;

  try {
    const mod = await import("browser-image-compression");
    const imageCompression = mod.default || mod;

    const compressed = await imageCompression(file, {
      maxSizeMB: 0.7,
      maxWidthOrHeight: 1600,
      useWebWorker: true,
      fileType: "image/webp",
      initialQuality: 0.82,
    });

    // browser-image-compression devuelve Blob/File según navegador
    if (compressed instanceof File) return compressed;

    const newName = safeName(file.name).replace(/\.[^.]+$/, "") + ".webp";
    return new File([compressed], newName, { type: "image/webp" });
  } catch {
    return file;
  }
}

/**
 * Firma + sube a R2. Mantiene la firma de uso "vieja":
 * uploadFile(file, folder, onProgress) -> url pública
 */
export async function uploadFile(file, folder, onProgress) {
  if (!file) throw new Error("uploadFile: falta file");

  const token = await getFirebaseToken();
  if (!token) throw new Error("No autorizado (sin token)");

  const folderClean = String(folder || "").replace(/^\/+|\/+$/g, "");
  const fb = await ensureFirebase();
  const uid = fb?.auth?.currentUser?.uid || "user";

  // Compresión solo para imágenes
  const fileToSend = await maybeCompressImage(file);

  const name = safeName(fileToSend.name || file.name);
  const key = `${folderClean}/${uid}/${Date.now()}_${rand(10)}_${name}`;
  const contentType = fileToSend.type || "application/octet-stream";

  // 1) pedir URL firmada al backend
  const res = await fetch("/api/uploads/sign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ key, contentType }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Sign fallo (${res.status}): ${txt}`);
  }

  const data = await res.json().catch(() => ({}));
  const signedUrl =
    data.url || data.signedUrl || data.uploadUrl || data.putUrl || null;

  if (!signedUrl) throw new Error("Sign OK pero no vino url firmada");

  const publicUrl =
    data.publicUrl ||
    data.publicURL ||
    (data.publicBaseUrl ? `${String(data.publicBaseUrl).replace(/\/$/, "")}/${key}` : null) ||
    (data.baseUrl ? `${String(data.baseUrl).replace(/\/$/, "")}/${key}` : null) ||
    null;

  // 2) PUT a R2 con progreso
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl, true);
    xhr.setRequestHeader("Content-Type", contentType);

    xhr.upload.onprogress = (evt) => {
      if (!evt.lengthComputable) return;
      const pct = Math.round((evt.loaded / evt.total) * 100);
      try {
        onProgress?.(pct);
      } catch {}
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`PUT fallo: ${xhr.status}`));
    };

    xhr.onerror = () => reject(new Error("PUT fallo (network error)"));
    xhr.send(fileToSend);
  });

  // Si el backend devuelve publicUrl, usamos ese (ideal con custom domain)
  // Si no, fallback a tu custom domain conocido:
  if (publicUrl) return publicUrl;

  const fallbackBase =
    getEnv("PUBLIC_MEDIA_BASE_URL") ||
    getEnv("PUBLIC_R2_PUBLIC_BASE_URL") ||
    "https://media.enmipueblo.com";

  return `${String(fallbackBase).replace(/\/$/, "")}/${key}`;
}
