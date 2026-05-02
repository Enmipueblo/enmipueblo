// frontend/src/lib/firebase.js
// Nota: este archivo NO usa Firebase. Mantiene el nombre por compatibilidad histórica.
// Auth: Google Identity Services (ID Token) + backend /api/*
// Storage: signed upload via /api/uploads/sign

const KEY = "enmipueblo_auth_v1";
const LEGACY_TOKEN_KEY = "enmi_google_id_token_v1";
const USER_KEY = "enmipueblo_user";
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

// ✅ FIX Safari: Safari no soporta FedCM (use_fedcm_for_prompt).
// Con FedCM activado en Safari el login se cuelga silenciosamente sin error en consola.
function isSafariOrIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // Safari puro (excluye Chrome y Firefox que también tienen "Safari" en el UA)
  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);
  // iOS (iPhone/iPad), incluido Chrome en iOS que usa WebKit
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  return isSafari || isIOS;
}

function loadGis() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.accounts?.id) return Promise.resolve();
  if (_gisLoading) return _gisLoading;

  _gisLoading = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      if (window.google?.accounts?.id) return resolve();
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

function _buildUserFromCredential(token) {
  const payload = decodeJwt(token);
  if (!token || !payload?.sub) return null;

  return {
    token: String(token),
    user: {
      uid: payload.sub,
      email: payload.email || "",
      name: payload.name || payload.email || "Usuario",
      picture: payload.picture || "",
    },
  };
}

export async function signInWithGoogle() {
  const clientId = import.meta.env.PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) return { error: "Falta PUBLIC_GOOGLE_CLIENT_ID en frontend build" };

  // Si ya hay sesión guardada, no fuerces un prompt nuevo
  try {
    const a = _getAuth();
    if (a?.token && a?.user?.uid) {
      return { user: a.user, token: a.token };
    }
  } catch {}

  try {
    await loadGis();

    // ✅ FIX Safari: en Safari/iOS NO usamos use_fedcm_for_prompt (no soportado)
    // El prompt estándar one-tap sí funciona en todos los navegadores
    const useFedCM = !isSafariOrIOS();

    return await new Promise((resolve) => {
      let done = false;
      let timer = null;

      const finish = (res) => {
        if (done) return;
        done = true;
        try {
          if (timer) clearTimeout(timer);
        } catch {}
        resolve(res);
      };

      window.google.accounts.id.initialize({
        client_id: clientId,
        use_fedcm_for_prompt: useFedCM,
        auto_select: false,
        callback: (response) => {
          try {
            const token = response?.credential;
            const built = _buildUserFromCredential(token);

            if (!built) {
              finish({ error: "Token inválido" });
              return;
            }

            _saveAuth(built);
            finish({ user: built.user, token: built.token });
          } catch (e) {
            finish({ error: e?.message || "Error login Google" });
          }
        },
      });

      window.google.accounts.id.prompt((notification) => {
        // ✅ FIX Safari: si el prompt no se muestra (isNotDisplayed) en Safari,
        // mostramos el botón de Google como fallback automático
        if (
          notification?.isNotDisplayed?.() ||
          notification?.isSkippedMoment?.()
        ) {
          // No es un error duro, dejamos que el timer decida
          // (el botón de Google estará disponible en el UI si se usa renderGoogleButton)
        }
      });

      // Timeout generoso — si no hay respuesta, no es error duro
      timer = setTimeout(() => {
        const a = _getAuth();
        if (a?.token && a?.user?.uid) {
          finish({ user: a.user, token: a.token });
          return;
        }
        // En Safari el prompt no aparece → devolvemos cancelled para que el UI
        // muestre el botón de Google en su lugar
        finish({ cancelled: true, safariHint: isSafariOrIOS() });
      }, 6500);
    });
  } catch (e) {
    return { error: e?.message || "Error login Google" };
  }
}

export function signOutUser() {
  _clearAuth();
  try {
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
        // ✅ FIX Safari: sin FedCM en Safari
        use_fedcm_for_prompt: !isSafariOrIOS(),
        auto_select: false,
        callback: (response) => {
          const token = response?.credential;
          const built = _buildUserFromCredential(token);
          if (!built) return;
          _saveAuth(built);
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

// ✅ ARQUITECTURA PROXY: el frontend manda el archivo al backend vía multipart.
// El backend lo sube a R2 server-side. Nunca hay PUT directo navegador→R2.
// Elimina el CORS 403 en r2.cloudflarestorage.com para siempre.
export async function uploadFile(file, folder, onProgress) {
  if (!file) throw new Error("Falta file");

  const token = await auth.getIdToken();
  if (!token) throw new Error("No autenticado");

  const resolvedFolder = folder || "service_images/fotos";

  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file, file.name || "archivo");
    formData.append("folder", resolvedFolder);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/uploads/upload", true);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    // NO poner Content-Type manualmente: el browser añade el boundary correcto

    if (typeof onProgress === "function") {
      xhr.upload.onprogress = (evt) => {
        if (!evt.lengthComputable) return;
        onProgress(Math.round((evt.loaded / evt.total) * 100));
      };
    }

    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && json?.ok) {
          if (typeof onProgress === "function") onProgress(100);
          const publicUrl = json?.data?.publicUrl || json?.publicUrl || json?.fileUrl || "";
          if (!publicUrl) return reject(new Error("El servidor no devolvio publicUrl"));
          resolve(publicUrl);
        } else {
          reject(new Error(json?.error || `Upload fallo (${xhr.status})`));
        }
      } catch {
        reject(new Error(`Upload fallo (${xhr.status}): respuesta no es JSON`));
      }
    };

    xhr.onerror = () => reject(new Error("Error de red subiendo archivo"));
    xhr.ontimeout = () => reject(new Error("Timeout subiendo archivo"));
    xhr.timeout = 120000;

    xhr.send(formData);
  });
}
