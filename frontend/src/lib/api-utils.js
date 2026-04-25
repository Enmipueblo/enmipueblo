// frontend/src/lib/api-utils.js
//
// Helper central para llamadas al backend (/api/*).
// - Normaliza endpoints legacy vs nuevos.
// - Añade Authorization: Bearer <id_token> si hay sesión.
// - Expone helpers usados por componentes TS/JS.

const API_BASE = "/api";

// Keys de auth (compat)
const KEY_AUTH = "enmipueblo_auth_v1"; // { token, user }
const KEY_LEGACY_TOKEN = "enmi_google_id_token_v1";
const KEY_LEGACY_USER = "enmipueblo_user";
const AUTH_EVENT = "enmipueblo:auth";

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getStoredAuth() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(KEY_AUTH);
  if (!raw) return null;
  return safeJsonParse(raw);
}

export function getIdToken() {
  try {
    const a = getStoredAuth();
    if (a?.token) return String(a.token);

    const t = window.localStorage.getItem(KEY_LEGACY_TOKEN);
    if (t) return String(t);

    return "";
  } catch {
    return "";
  }
}

export function getCurrentUser() {
  try {
    const a = getStoredAuth();
    if (a?.user) return a.user;

    const raw = window.localStorage.getItem(KEY_LEGACY_USER);
    if (raw) return safeJsonParse(raw);

    const raw2 = window.localStorage.getItem("enmipueblo_user_v1");
    if (raw2) return safeJsonParse(raw2);

    return null;
  } catch {
    return null;
  }
}

export function onUserStateChange(cb) {
  cb(getCurrentUser());

  const onStorage = (e) => {
    if (!e?.key) return;
    if ([KEY_AUTH, KEY_LEGACY_TOKEN, KEY_LEGACY_USER, "enmipueblo_user_v1"].includes(e.key)) {
      cb(getCurrentUser());
    }
  };

  const onLocal = () => cb(getCurrentUser());

  window.addEventListener("storage", onStorage);
  window.addEventListener(AUTH_EVENT, onLocal);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(AUTH_EVENT, onLocal);
  };
}

function normalizeApiPath(path) {
  if (!path) return API_BASE;
  if (path === API_BASE || path.startsWith(`${API_BASE}/`)) return path;
  if (path.startsWith("/")) return `${API_BASE}${path}`;
  return `${API_BASE}/${path}`;
}

function qs(obj = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null || v === "") continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

function withAuthHeaders(init = {}) {
  const token = getIdToken();
  const headers = new Headers(init.headers || {});
  if (token && !headers.get("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return { ...init, headers };
}

export async function apiFetch(path, init = {}) {
  const url = normalizeApiPath(path);

  const opts = withAuthHeaders({
    credentials: "include",
    ...init,
  });

  const res = await fetch(url, opts);

  const ct = res.headers.get("content-type") || "";
  const isJson = ct.includes("application/json");
  const payload = isJson ? await res.json().catch(() => null) : await res.text().catch(() => "");

  if (!res.ok) {
    const msg =
      (payload && typeof payload === "object" && (payload.error || payload.message)) ||
      (typeof payload === "string" && payload) ||
      `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.payload = payload;
    throw err;
  }

  return payload;
}

async function tryApi(paths, init) {
  const list = Array.isArray(paths) ? paths : [paths];
  let lastErr = null;

  for (const p of list) {
    try {
      return await apiFetch(p, init);
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr || new Error("Error API");
}

// =========================
// Servicios (público)
// =========================
export async function listarServicios(params = {}) {
  return tryApi([`/servicios${qs(params)}`], {});
}

export async function buscarServicios(params = {}) {
  const qStr = qs(params);
  return tryApi([`/featured/search${qStr}`, `/servicios${qStr}`], {});
}

export async function getServicioById(id) {
  if (!id) throw new Error("getServicioById: id requerido");
  const res = await tryApi([`/servicios/${encodeURIComponent(id)}`], {});
  // ✅ FIX: el backend devuelve { ok, data, servicio } — extraemos el objeto real
  // Sin este fix el formulario de editar aparece vacío porque servicio.nombre era undefined
  return res?.data || res?.servicio || res;
}

export async function getServicioRelacionadosById(id, limit = 8) {
  if (!id) throw new Error("getServicioRelacionadosById: id requerido");

  const eid = encodeURIComponent(id);
  const res = await tryApi(
    [
      `/servicios/${eid}/relacionados${qs({ limit })}`,
      `/servicios/relacionados/${eid}${qs({ limit })}`,
      `/servicios/${eid}/related${qs({ limit })}`,
    ],
    {}
  );
  // El backend puede devolver { ok, data } o el array directamente
  return res?.data || res;
}

// =========================
// Destacados / Home
// =========================
export async function getDestacados(limit = 18) {
  return tryApi([`/featured/portada${qs({ limit })}`], {});
}

// =========================
// CRUD (usuario)
// =========================
export async function crearServicio(payload) {
  return tryApi([`/servicios`], {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
}

export async function actualizarServicio(id, payload) {
  if (!id) throw new Error("actualizarServicio: id requerido");
  return tryApi([`/servicios/${encodeURIComponent(id)}`], {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
}

export async function borrarServicio(id) {
  if (!id) throw new Error("borrarServicio: id requerido");
  return tryApi([`/servicios/${encodeURIComponent(id)}`], { method: "DELETE" });
}

// =========================
// Favoritos (ruta real: /api/favorito)
// =========================
export async function misFavoritos() {
  return tryApi([`/favorito`], {});
}

export async function addFavorito(servicioId) {
  if (!servicioId) throw new Error("addFavorito: servicioId requerido");
  return tryApi([`/favorito`], {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ servicioId }),
  });
}

export async function removeFavorito(servicioId) {
  if (!servicioId) throw new Error("removeFavorito: servicioId requerido");
  return tryApi([`/favorito`], {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ servicioId }),
  });
}

// =========================
// Panel usuario
// =========================
export async function misServicios(params = {}) {
  return tryApi([`/servicios/mios${qs(params)}`], {});
}

// =========================
// Admin (nuevas rutas /api/admin2/*)
// =========================
export async function adminMe() {
  return tryApi([`/admin2/me`], {});
}

export async function adminListServicios(params = {}) {
  return tryApi([`/admin2/servicios${qs(params)}`], {});
}

export async function adminPatchServicio(id, patch = {}) {
  if (!id) throw new Error("adminPatchServicio: id requerido");
  return tryApi([`/admin2/servicios/${encodeURIComponent(id)}`], {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch || {}),
  });
}

export async function isAdminUser(user) {
  if (user?.is_admin === true || user?.isAdmin === true) return true;

  try {
    const me = await adminMe();
    return !!(me?.ok && (me?.user?.is_admin || me?.user?.isAdmin));
  } catch {
    return false;
  }
}

// =========================
// Localidades / Geocoding
// =========================
export async function buscarLocalidades(q = "") {
  if (!q) return { data: [] };
  return apiFetch(`/localidades?q=${encodeURIComponent(q)}`);
}

export async function geocodeES(text = "") {
  if (!text) return null;
  const res = await apiFetch(`/geocoder?q=${encodeURIComponent(text)}`);

  if (res?.data && res.data.lon != null && res.data.lng == null) {
    res.data.lng = res.data.lon;
  }
  return res;
}


// =========================
// Compat aliases (legacy)
// =========================
export async function getServicios(params = {}) {
  return listarServicios(params);
}
export async function searchServicios(params = {}) {
  return buscarServicios(params);
}
export async function getServicio(id) {
  return getServicioById(id);
}
export async function getServicioRelacionados(id, limit = 8) {
  return getServicioRelacionadosById(id, limit);
}
export async function getServiciosRelacionados(id, limit = 8) {
  return getServicioRelacionadosById(id, limit);
}
export async function getFeatured(limit = 18) {
  return getDestacados(limit);
}
export async function getServiciosDestacados(limit = 18) {
  return getDestacados(limit);
}
export async function getFavoritos() {
  return misFavoritos();
}
export async function crearAnuncio(payload) {
  return crearServicio(payload);
}
export async function editarServicio(id, payload) {
  return actualizarServicio(id, payload);
}
export async function eliminarServicio(id) {
  return borrarServicio(id);
}
export async function deleteServicio(id) {
  return borrarServicio(id);
}
export async function updateServicio(id, payload) {
  return actualizarServicio(id, payload);
}
