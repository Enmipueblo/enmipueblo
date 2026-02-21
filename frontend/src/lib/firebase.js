// frontend/src/lib/firebase.js
// Nota: este archivo NO usa Firebase. Mantiene el nombre por compatibilidad histórica.
// Auth: Google Identity Services (ID Token) + backend /api/*
// Storage: signed upload via /api/uploads/sign

const KEY = "enmipueblo_auth_v1";
const LEGACY_TOKEN_KEY = "enmi_google_id_token_v1"; // usado por UserServiciosIsland
const USER_KEY = "enmipueblo_user"; // compat con api-utils / otros
const AUTH_EVENT = "enmipueblo:auth";

let _gisLoading = null;

function _notifyAuth() {
  try {
    window.dispatchEvent(new Event(AUTH_EVENT));
    window.dispatchEvent(new Event("auth:changed"));
  } catch {}
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
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    // compat: token legacy + user legacy
    if (data?.token) localStorage.setItem(LEGACY_TOKEN_KEY, String(data.token));
    if (data?.user) localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  } catch {}
  _notifyAuth();
}

function _clearAuth() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {}
  _notifyAuth();
}

function decodeJwt(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(payload)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function loadGis() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.accounts?.id) return Promise.resolve();
  if (_gisLoading) return _gisLoading;

  _gisLoading = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("No se pudo cargar Google GIS")));
      return;
    }

    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("No se pudo cargar Google GIS"));
    document.head.appendChild(s);
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
  // inmediato
  callback(auth.currentUser);

  const onStorage = (e) => {
    if (!e?.key) return;
    if (e.key === KEY || e.key === LEGACY_TOKEN_KEY || e.key === USER_KEY) {
      callback(auth.currentUser);
    }
  };
  const onLocalEvent = () => callback(auth.currentUser);

  window.addEventListener("storage", onStorage);
  window.addEventListener(AUTH_EVENT, onLocalEvent);
  window.addEventListener("auth:changed", onLocalEvent);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(AUTH_EVENT, onLocalEvent);
    window.removeEventListener("auth:changed", onLocalEvent);
  };
}

export async function signInWithGoogle() {
  const clientId = import.meta.env.PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) return { error: "Falta PUBLIC_GOOGLE_CLIENT_ID en frontend build" };

  try {
    await loadGis();

    return await new Promise((resolve) => {
      let done = false;
      const finish = (res) => {
        if (done) return;
        done = true;
        resolve(res);
      };

      window.google.accounts.id.initialize({
        client_id: clientId,
        // ✅ FedCM opt-in (reduce futuros problemas)
        use_fedcm_for_prompt: true,
        auto_select: false,
        callback: (response) => {
          try {
            const token = response?.credential;
            const payload = decodeJwt(token);

            if (!token || !payload?.sub) {
              finish({ error: "Token inválido" });
              return;
            }

            const user = {
              uid: payload.sub,
              email: payload.email || "",
              name: payload.name || payload.email || "Usuario",
              picture: payload.picture || "",
            };

            _saveAuth({ token, user });
            finish({ user, token });
          } catch (e) {
            finish({ error: e?.message || "Error login Google" });
          }
        },
      });

      // ✅ No usamos isNotDisplayed/isSkippedMoment (evita warning FedCM)
      window.google.accounts.id.prompt(() => {});

      // timeout por si el usuario cierra el prompt y no vuelve nada
      setTimeout(() => {
        if (!done) finish({ error: "Login cancelado o no disponible" });
      }, 4500);
    });
  } catch (e) {
    return { error: e?.message || "Error login Google" };
  }
}

export function signOutUser() {
  _clearAuth();
  try {
    // opcional, no siempre existe
    window.google?.accounts?.id?.disableAutoSelect?.();
  } catch {}
}

export function renderGoogleButton(el, opts = {}) {
  const clientId = import.meta.env.PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId || !el) return;

  loadGis()
    .then(() => {
      window.google.accounts.id.initialize({
        client_id: clientId,
        use_fedcm_for_prompt: true,
        auto_select: false,
        callback: (response) => {
          const token = response?.credential;
          const payload = decodeJwt(token);
          if (!token || !payload?.sub) return;

          const user = {
            uid: payload.sub,
            email: payload.email || "",
            name: payload.name || payload.email || "Usuario",
            picture: payload.picture || "",
          };

          _saveAuth({ token, user });
        },
      });

      window.google.accounts.id.renderButton(el, {
        type: "standard",
        theme: "outline",
        size: "large",
        shape: "pill",
        text: "signin_with",
        ...opts,
      });
    })
    .catch(() => {});
}

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
      size: file.size || 0,
    }),
  });

  const signJson = await signRes.json().catch(() => ({}));
  if (!signRes.ok) throw new Error(signJson?.error || "No se pudo firmar upload");

  // Backends típicos: { ok, uploadUrl, publicUrl, fields? }
  if (signJson.uploadUrl) {
    const putRes = await fetch(signJson.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!putRes.ok) throw new Error("Upload falló");
    return { url: signJson.publicUrl || signJson.url || signJson.fileUrl || null };
  }

  // Compat: si viene { url } directo
  if (signJson.url) return { url: signJson.url };

  throw new Error("Respuesta de upload inesperada");
}