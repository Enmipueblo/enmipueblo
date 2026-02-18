// frontend/src/lib/firebase.js
// Nota: este archivo NO usa Firebase. Mantiene el nombre por compatibilidad histórica.
// Auth: Google Identity Services (ID Token) + backend /api/auth/*
// Storage: signed upload via /api/uploads/sign

const KEY = "enmipueblo_auth_v1";
const AUTH_EVENT = "enmipueblo:auth";

let _gisReady = false;
let _gisLoading = null;

function _notifyAuth() {
  // Notifica cambios en el mismo tab (storage event NO dispara en el mismo tab)
  try {
    window.dispatchEvent(new CustomEvent(AUTH_EVENT));
  } catch (_) {}
}

function _getAuth() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function _saveAuth(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
  _notifyAuth();
}

function _clearAuth() {
  localStorage.removeItem(KEY);
  _notifyAuth();
}

function decodeJwt(token) {
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decodeURIComponent(escape(json)));
  } catch {
    return null;
  }
}

async function loadGis() {
  if (_gisReady) return true;
  if (_gisLoading) return _gisLoading;

  _gisLoading = new Promise((resolve, reject) => {
    if (typeof window === "undefined") return resolve(false);
    if (window.google?.accounts?.id) {
      _gisReady = true;
      return resolve(true);
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      _gisReady = true;
      resolve(true);
    };
    script.onerror = () => reject(new Error("No se pudo cargar Google Identity Services"));
    document.head.appendChild(script);
  });

  return _gisLoading;
}

export const auth = {
  get currentUser() {
    const a = _getAuth();
    return a?.user || null;
  },
  async getIdToken() {
    const a = _getAuth();
    return a?.token || null;
  },
};

export function onUserStateChange(callback) {
  // Llama inmediatamente
  callback(auth.currentUser);

  const onStorage = (e) => {
    if (e.key === KEY) callback(auth.currentUser);
  };

  const onLocalEvent = () => callback(auth.currentUser);

  window.addEventListener("storage", onStorage);
  window.addEventListener(AUTH_EVENT, onLocalEvent);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(AUTH_EVENT, onLocalEvent);
  };
}

export async function signInWithGoogle() {
  const clientId = import.meta.env.PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) {
    return { error: "Falta PUBLIC_GOOGLE_CLIENT_ID" };
  }

  try {
    await loadGis();

    return await new Promise((resolve) => {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response) => {
          const token = response.credential;
          const payload = decodeJwt(token);

          if (!payload?.sub) {
            resolve({ error: "Token inválido" });
            return;
          }

          const user = {
            uid: payload.sub,
            email: payload.email || "",
            name: payload.name || payload.email || "Usuario",
            picture: payload.picture || "",
          };

          _saveAuth({ token, user });
          resolve({ user, token });
        },
        // Evita auto-select raro
        auto_select: false,
      });

      window.google.accounts.id.prompt((notification) => {
        // Si el prompt no se muestra (adblock, etc)
        if (notification?.isNotDisplayed?.() || notification?.isSkippedMoment?.()) {
          resolve({ error: "No se pudo mostrar el login de Google (bloqueado o no disponible)" });
        }
      });
    });
  } catch (e) {
    return { error: e?.message || "Error login Google" };
  }
}

export function renderGoogleButton(el, opts = {}) {
  const clientId = import.meta.env.PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) return;

  loadGis()
    .then(() => {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          const token = response.credential;
          const payload = decodeJwt(token);
          if (!payload?.sub) return;

          const user = {
            uid: payload.sub,
            email: payload.email || "",
            name: payload.name || payload.email || "Usuario",
            picture: payload.picture || "",
          };

          _saveAuth({ token, user });
        },
        auto_select: false,
      });

      window.google.accounts.id.renderButton(el, {
        theme: "outline",
        size: "large",
        shape: "pill",
        ...opts,
      });
    })
    .catch(() => {});
}

export async function signOut() {
  try {
    _clearAuth();
    // best-effort: disable auto-select
    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect();
    }
  } catch (_) {}
}

// Compat: algunos componentes importan signOutUser
export const signOutUser = signOut;

export async function uploadFile(file) {
  if (!file) throw new Error("Falta file");

  const token = await auth.getIdToken();
  if (!token) throw new Error("No autenticado");

  const signRes = await fetch("/api/uploads/sign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type || "application/octet-stream",
    }),
  });

  if (!signRes.ok) {
    const txt = await signRes.text().catch(() => "");
    throw new Error(`No se pudo firmar upload (${signRes.status}). ${txt}`);
  }

  const { uploadUrl, publicUrl } = await signRes.json();

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });

  if (!putRes.ok) {
    const txt = await putRes.text().catch(() => "");
    throw new Error(`No se pudo subir archivo (${putRes.status}). ${txt}`);
  }

  return { publicUrl };
}
