// frontend/src/lib/firebase.js
// ✅ Reemplazo de Firebase Auth por Google Identity Services (GIS)
// Objetivo: mantener "Login con Google" SIN Firebase para evitar cargos.
//
// Requisitos ENV (frontend):
// - PUBLIC_GOOGLE_CLIENT_ID (OAuth Client ID de tipo "Web application")
//
// El backend debe validar el ID token con GOOGLE_CLIENT_ID.

const env = import.meta.env;

const CLIENT_ID =
  env.PUBLIC_GOOGLE_CLIENT_ID ||
  env.PUBLIC_GOOGLE_OAUTH_CLIENT_ID ||
  "";

const LS_TOKEN = "enmi_google_id_token_v1";

export const auth = {
  /** @type {null | { uid:string, email:string, name:string, picture:string, getIdToken:()=>Promise<string> }} */
  currentUser: null,
};

const listeners = new Set();

function notify() {
  listeners.forEach((cb) => {
    try {
      cb(auth.currentUser);
    } catch (e) {
      console.error("[auth] listener error", e);
    }
  });
}

function b64UrlDecode(str) {
  const s = String(str || "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  return atob(s + pad);
}

function decodeJwtPayload(token) {
  const parts = String(token || "").split(".");
  if (parts.length < 2) throw new Error("JWT inválido");
  const json = b64UrlDecode(parts[1]);
  return JSON.parse(json);
}

function tokenStillValid(token) {
  try {
    const p = decodeJwtPayload(token);
    const expMs = (Number(p.exp) || 0) * 1000;
    // margen 30s
    return expMs > Date.now() + 30_000;
  } catch {
    return false;
  }
}

function setSessionFromToken(token) {
  const p = decodeJwtPayload(token);

  const user = {
    uid: p.sub || "",
    email: p.email || "",
    name: p.name || "",
    picture: p.picture || "",
    getIdToken: async () => token,
  };

  auth.currentUser = user;

  try {
    localStorage.setItem(LS_TOKEN, token);
  } catch {}

  notify();
  return user;
}

function clearSession() {
  auth.currentUser = null;
  try {
    localStorage.removeItem(LS_TOKEN);
  } catch {}

  try {
    window.google?.accounts?.id?.disableAutoSelect?.();
  } catch {}

  notify();
}

function restoreSession() {
  if (typeof window === "undefined") return;
  try {
    const t = localStorage.getItem(LS_TOKEN);
    if (!t) return;
    if (!tokenStillValid(t)) {
      localStorage.removeItem(LS_TOKEN);
      return;
    }
    setSessionFromToken(t);
  } catch {
    // nada
  }
}

let _gsiLoadPromise = null;

function loadGsiScript() {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.google?.accounts?.id) return Promise.resolve(true);
  if (_gsiLoadPromise) return _gsiLoadPromise;

  _gsiLoadPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve(true);
    s.onerror = () => reject(new Error("No se pudo cargar Google Identity Services"));
    document.head.appendChild(s);
  });

  return _gsiLoadPromise;
}

let _gsiInited = false;

function initGsiOnce() {
  if (_gsiInited) return;
  if (!CLIENT_ID) {
    console.warn("[auth] Falta PUBLIC_GOOGLE_CLIENT_ID (no se inicializa GIS)");
    return;
  }
  if (!window.google?.accounts?.id) return;

  window.google.accounts.id.initialize({
    client_id: CLIENT_ID,
    callback: (resp) => {
      const token = resp?.credential;
      if (!token) return;
      try {
        setSessionFromToken(token);
      } catch (e) {
        console.error("[auth] No se pudo guardar sesión:", e);
      }
    },
    auto_select: false,
    cancel_on_tap_outside: false,
  });

  _gsiInited = true;
}

async function ensureGsiReady() {
  await loadGsiScript();
  initGsiOnce();
}

export function onUserStateChange(cb) {
  if (typeof cb !== "function") return () => {};
  listeners.add(cb);
  // estado inicial
  try {
    cb(auth.currentUser);
  } catch {}
  return () => listeners.delete(cb);
}

/**
 * Iniciar sesión:
 * - Usamos el "prompt" (One Tap / selección) de GIS.
 * - Para máxima fiabilidad puedes usar renderGoogleButton() dentro del modal.
 */
export async function signInWithGoogle() {
  if (typeof window === "undefined") throw new Error("Solo disponible en navegador");
  if (!CLIENT_ID) throw new Error("Falta PUBLIC_GOOGLE_CLIENT_ID");

  await ensureGsiReady();

  return await new Promise((resolve, reject) => {
    let done = false;

    const unsub = onUserStateChange((u) => {
      if (done) return;
      if (u) {
        done = true;
        unsub();
        resolve(u);
      }
    });

    const t = setTimeout(() => {
      if (done) return;
      done = true;
      unsub();
      reject(
        new Error(
          "No se pudo iniciar sesión (One Tap no disponible/bloqueado). Prueba en modo incógnito o permite cookies de terceros."
        )
      );
    }, 15_000);

    try {
      window.google.accounts.id.prompt(() => {
        // dejamos que el callback del initialize() resuelva cuando llegue credencial
        // si no llega, cae por timeout
        setTimeout(() => {}, 0);
      });
    } catch (e) {
      clearTimeout(t);
      unsub();
      reject(e);
    }
  });
}

/**
 * Renderiza el botón oficial de Google en un contenedor.
 * Útil si One Tap está bloqueado (más fiable).
 */
export async function renderGoogleButton(containerEl) {
  if (typeof window === "undefined") return;
  if (!containerEl) return;
  if (!CLIENT_ID) throw new Error("Falta PUBLIC_GOOGLE_CLIENT_ID");
  await ensureGsiReady();

  // limpiamos el contenedor para evitar botones duplicados
  try {
    containerEl.innerHTML = "";
  } catch {}

  window.google.accounts.id.renderButton(containerEl, {
    theme: "outline",
    size: "large",
    shape: "pill",
    text: "continue_with",
    width: 320,
  });
}

export async function signOut() {
  clearSession();
}

// ======================
// Helpers para uploads (R2 firmados)
// ======================
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
  if (auth.currentUser) return auth.currentUser;

  return await new Promise((resolve) => {
    const t = setTimeout(() => {
      unsub?.();
      resolve(null);
    }, ms);

    const unsub = onUserStateChange((u) => {
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
  // si expiró, obligamos a re-login
  if (!tokenStillValid(token)) {
    clearSession();
    throw new Error("Sesión expirada. Vuelve a iniciar sesión.");
  }
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
        onProgress(Math.min(99), Math.max(1, pct));
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

// init
restoreSession();
