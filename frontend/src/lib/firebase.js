// frontend/src/lib/firebase.js
// Google Sign-In (NO Firebase) + helpers usados por el frontend.
// Guarda token/user en localStorage y usa el backend (/api) para uploads firmados.

const API_BASE = import.meta?.env?.PUBLIC_API_BASE || "/api";
const CLIENT_ID = import.meta?.env?.PUBLIC_GOOGLE_CLIENT_ID || "";

const USER_KEY = "enmp_user";
const TOKEN_KEY = "enmp_token";

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function getStoredUser() {
  try {
    return safeJsonParse(localStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
}

function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setStoredAuth(user, token) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {}
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

// Estado “tipo auth”
export const auth = {
  currentUser: getStoredUser(),
};

const listeners = new Set();
function notify() {
  auth.currentUser = getStoredUser();
  const u = auth.currentUser;
  listeners.forEach((cb) => {
    try {
      cb(u);
    } catch {}
  });
}

// Decodificar JWT (Google ID token) para mostrar nombre/email/foto sin Firebase
function decodeJwt(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

function ensureGoogleScriptLoaded() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.accounts?.id) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("No se pudo cargar Google Sign-In")));
      return;
    }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("No se pudo cargar Google Sign-In"));
    document.head.appendChild(s);
  });
}

function requireClientId() {
  if (!CLIENT_ID) {
    throw new Error(
      "Falta PUBLIC_GOOGLE_CLIENT_ID. Revisa /srv/apps/enmipueblo/env/app.env (server) y tu .env local."
    );
  }
}

function initGoogleOnce(callback) {
  requireClientId();
  if (!window.google?.accounts?.id) throw new Error("Google Sign-In no está cargado.");

  // Importante: inicializar siempre con el callback más reciente.
  window.google.accounts.id.initialize({
    client_id: CLIENT_ID,
    callback,
    auto_select: false,
    cancel_on_tap_outside: true,
  });
}

// API pública: subscribe a cambios de usuario
export function onUserStateChange(cb) {
  listeners.add(cb);
  // Emitir estado actual al suscribirse
  try {
    cb(getStoredUser());
  } catch {}

  const onStorage = (e) => {
    if (e?.key === USER_KEY || e?.key === TOKEN_KEY) notify();
  };
  try {
    window.addEventListener("storage", onStorage);
  } catch {}

  return () => {
    listeners.delete(cb);
    try {
      window.removeEventListener("storage", onStorage);
    } catch {}
  };
}

// Botón Google “render”
export async function renderGoogleButton(containerEl, options = {}) {
  if (!containerEl) return;
  await ensureGoogleScriptLoaded();
  requireClientId();

  initGoogleOnce(async (resp) => {
    const token = resp?.credential;
    const payload = token ? decodeJwt(token) : null;

    if (token && payload) {
      const user = {
        uid: payload.sub,
        email: payload.email,
        displayName: payload.name,
        photoURL: payload.picture,
      };
      setStoredAuth(user, token);
      notify();
    }
  });

  const theme = options.theme || "outline";
  const size = options.size || "large";
  const text = options.text || "signin_with";

  window.google.accounts.id.renderButton(containerEl, {
    theme,
    size,
    text,
    shape: "pill",
    width: options.width,
    locale: options.locale || "es",
  });
}

// Sign-in “por código” (por si lo usas en un onClick)
// Nota: con GIS lo normal es renderizar el botón; esto dispara el “prompt”.
export async function signInWithGoogle() {
  await ensureGoogleScriptLoaded();
  requireClientId();

  return new Promise((resolve, reject) => {
    try {
      initGoogleOnce((resp) => {
        const token = resp?.credential;
        const payload = token ? decodeJwt(token) : null;
        if (!token || !payload) {
          reject(new Error("No se obtuvo credencial de Google."));
          return;
        }
        const user = {
          uid: payload.sub,
          email: payload.email,
          displayName: payload.name,
          photoURL: payload.picture,
        };
        setStoredAuth(user, token);
        notify();
        resolve(user);
      });

      window.google.accounts.id.prompt((n) => {
        // si el usuario cierra / bloquea el prompt, igual resolvemos con el usuario actual si existe
        if (n?.isNotDisplayed?.() || n?.isSkippedMoment?.()) {
          const u = getStoredUser();
          if (u) resolve(u);
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

// Sign-out
export async function signOut() {
  setStoredAuth(null, null);
  try {
    window.google?.accounts?.id?.disableAutoSelect?.();
  } catch {}
  notify();
}

// Alias para compatibilidad con tu AuthIsland actual
export const signOutUser = signOut;

// --- Uploads ---
// Usa el backend: POST /api/uploads/sign => { uploadUrl, publicUrl }
function sanitizeName(name) {
  return String(name || "file")
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 120);
}

function buildDefaultKey(file) {
  const u = getStoredUser();
  const uid = u?.uid || "anon";
  const ts = Date.now();
  const ext = sanitizeName(file?.name || "upload.bin");
  return `uploads/${uid}/${ts}_${ext}`;
}

function xhrPut(url, file, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    if (contentType) xhr.setRequestHeader("Content-Type", contentType);

    xhr.upload.onprogress = (evt) => {
      if (!onProgress) return;
      if (evt.lengthComputable) onProgress(Math.round((evt.loaded / evt.total) * 100));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload failed (network)"));
    xhr.send(file);
  });
}

// Firma + PUT al storage
// Soporta llamadas tipo:
// - uploadFile(file)
// - uploadFile(file, { key, onProgress })
// - uploadFile(file, "uploads/miRuta/archivo.jpg")  (compat)
export async function uploadFile(file, arg2 = undefined, arg3 = undefined) {
  if (!file) throw new Error("uploadFile: falta file");

  const token = getStoredToken();
  if (!token) throw new Error("uploadFile: no hay token (usuario no autenticado)");

  let key = "";
  let onProgress = null;

  if (typeof arg2 === "string") {
    key = arg2;
    onProgress = typeof arg3 === "function" ? arg3 : null;
  } else {
    key = arg2?.key || buildDefaultKey(file);
    onProgress = typeof arg2?.onProgress === "function" ? arg2.onProgress : null;
  }

  const contentType = file.type || "application/octet-stream";
  const size = typeof file.size === "number" ? file.size : 0;

  const res = await fetch(`${API_BASE}/uploads/sign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ key, contentType, size }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `No se pudo firmar upload (${res.status})`);
  }

  if (!data?.uploadUrl || !data?.publicUrl) {
    throw new Error("Respuesta inválida de /uploads/sign (faltan uploadUrl/publicUrl)");
  }

  await xhrPut(data.uploadUrl, file, contentType, onProgress);
  return data.publicUrl;
}
