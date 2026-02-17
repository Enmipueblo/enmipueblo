// frontend/src/lib/firebase.js
// Google Sign-In (NO Firebase) + sesión por backend (id_token)
// Provee helpers usados por las islands (AuthIsland, etc.)

let _currentUser = null;
let _listeners = new Set();

function notify() {
  for (const cb of _listeners) {
    try {
      cb(_currentUser);
    } catch {}
  }
}

function setUser(u) {
  _currentUser = u || null;
  notify();
}

// Carga sesión desde localStorage (si existe)
function loadSession() {
  try {
    const raw = localStorage.getItem("emp_session");
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !s.user || !s.token) return null;
    return s;
  } catch {
    return null;
  }
}

function saveSession(session) {
  try {
    localStorage.setItem("emp_session", JSON.stringify(session));
  } catch {}
}

function clearSession() {
  try {
    localStorage.removeItem("emp_session");
  } catch {}
}

function sessionToUser(session) {
  if (!session?.user) return null;
  return {
    uid: session.user.sub || session.user.id || session.user.email || "user",
    email: session.user.email || "",
    displayName: session.user.name || session.user.given_name || session.user.email || "Usuario",
    photoURL: session.user.picture || "",
    // compat
    getIdToken: async () => session?.token || "",
  };
}

function getBackendUrl() {
  // Preferimos /api (proxy nginx) si existe en producción
  // pero mantenemos PUBLIC_BACKEND_URL si lo usas en local.
  const envUrl = import.meta.env.PUBLIC_BACKEND_URL || "";
  return envUrl || "";
}

async function backendLoginWithGoogleIdToken(idToken) {
  const base = getBackendUrl();
  // Si no hay backend URL, intentamos /api (nginx proxy)
  const url = base ? `${base}/auth/google` : `/api/auth/google`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id_token: idToken }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Auth backend error (${res.status}): ${t}`);
  }

  const data = await res.json();
  // Esperamos: { token, user }
  if (!data?.token || !data?.user) {
    throw new Error("Auth backend response inválida");
  }
  return data;
}

function ensureGsiLoaded() {
  if (typeof window === "undefined") return false;
  return !!(window.google && window.google.accounts && window.google.accounts.id);
}

function promptGoogleOneTap() {
  return new Promise((resolve, reject) => {
    if (!ensureGsiLoaded()) return reject(new Error("Google GSI no cargado"));

    // callback recibe credencial (JWT)
    window.google.accounts.id.initialize({
      client_id: import.meta.env.PUBLIC_GOOGLE_CLIENT_ID,
      callback: (resp) => resolve(resp),
      auto_select: false,
      cancel_on_tap_outside: true,
    });

    window.google.accounts.id.prompt((notification) => {
      // Si no se muestra (por bloqueos) igual resolvemos con null
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        resolve(null);
      }
    });
  });
}

export const auth = {
  get currentUser() {
    return _currentUser;
  },
  onAuthStateChanged(cb) {
    _listeners.add(cb);
    // emitir estado actual
    cb(_currentUser);
    return () => _listeners.delete(cb);
  },
  async getIdToken() {
    const s = loadSession();
    return s?.token || "";
  },
};

export async function bootstrapAuthFromStorage() {
  const s = loadSession();
  if (s) setUser(sessionToUser(s));
}

export function onUserStateChange(cb) {
  // compat para components
  // Asegura que el estado se inicializa desde storage una vez
  if (typeof window !== "undefined") {
    // fire and forget
    bootstrapAuthFromStorage();
  }
  return auth.onAuthStateChanged(cb);
}

export async function signInWithGoogle() {
  // 1) OneTap / Prompt -> id_token
  const resp = await promptGoogleOneTap();
  if (!resp || !resp.credential) {
    throw new Error("No se obtuvo credencial de Google (OneTap bloqueado/cancelado)");
  }

  // 2) backend exchange -> sesión
  const data = await backendLoginWithGoogleIdToken(resp.credential);
  saveSession(data);

  // 3) set user
  const u = sessionToUser(data);
  setUser(u);
  return u;
}

export async function signOut() {
  clearSession();
  setUser(null);

  // Limpia OneTap (si está)
  try {
    if (ensureGsiLoaded()) {
      window.google.accounts.id.disableAutoSelect();
    }
  } catch {}
}

/**
 * COMPAT: algunos componentes importan signOutUser.
 * Lo dejamos como alias estable para evitar romper builds.
 */
export async function signOutUser() {
  return signOut();
}

export async function getCurrentUser() {
  if (_currentUser) return _currentUser;
  await bootstrapAuthFromStorage();
  return _currentUser;
}

export async function getIdToken() {
  return auth.getIdToken();
}
