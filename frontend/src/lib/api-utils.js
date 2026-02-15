// frontend/src/lib/api-utils.js
//
// Helper central para:
// - llamadas al backend via /api/* (proxy nginx)
// - estado de usuario (SIN firebase)
// - utilidades usadas por Islands (admin/panel/buscar/favoritos/geocode)

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function qs(params = {}) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const API_BASE = "/api";

// ------------------------
// User state (sin Firebase)
// ------------------------

export function getCurrentUser() {
  if (!isBrowser()) return null;

  const keys = ["enmipueblo_user", "emp_user", "user", "authUser"];
  for (const k of keys) {
    try {
      const raw = window.localStorage.getItem(k);
      if (raw) return JSON.parse(raw);
    } catch {}
  }
  return null;
}

export function setCurrentUser(user) {
  if (!isBrowser()) return;
  try {
    if (user) {
      window.localStorage.setItem("enmipueblo_user", JSON.stringify(user));
    } else {
      window.localStorage.removeItem("enmipueblo_user");
    }
    window.dispatchEvent(new Event("auth:changed"));
  } catch {}
}

export function clearCurrentUser() {
  setCurrentUser(null);
}

export function onUserStateChange(cb) {
  const emit = () => {
    try {
      cb(getCurrentUser());
    } catch {}
  };

  emit();

  if (!isBrowser()) return () => {};

  const onAuthChanged = () => emit();
  const onStorage = (e) => {
    if (!e || !e.key) return;
    if (["enmipueblo_user", "emp_user", "user", "authUser"].includes(e.key)) emit();
  };

  window.addEventListener("auth:changed", onAuthChanged);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener("auth:changed", onAuthChanged);
    window.removeEventListener("storage", onStorage);
  };
}

export function isAdminUser(user) {
  if (!user) return false;
  if (user.isAdmin === true) return true;
  if (user.role === "admin") return true;

  try {
    const env = typeof import.meta !== "undefined" ? import.meta.env : {};
    const list = (env?.PUBLIC_ADMIN_EMAILS || env?.PUBLIC_ADMIN_EMAIL || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const email = String(user.email || "").trim().toLowerCase();
    if (email && list.includes(email)) return true;
  } catch {}

  return false;
}

// ------------------------
// API fetch
// ------------------------

function normalizeApiPath(path) {
  if (!path) return `${API_BASE}`;
  if (/^https?:\/\//i.test(path)) return path;
  if (path === API_BASE || path.startsWith(`${API_BASE}/`)) return path;
  if (path.startsWith("/")) return `${API_BASE}${path}`;
  return `${API_BASE}/${path}`;
}

export async function apiFetch(path, opts = {}) {
  const url = normalizeApiPath(path);

  const headers = { ...(opts.headers || {}) };
  const hasBody = opts.body !== undefined && opts.body !== null;

  const isFormData =
    isBrowser() && typeof FormData !== "undefined" && opts.body instanceof FormData;

  let body = opts.body;

  if (hasBody && !isFormData && typeof opts.body === "object") {
    if (!headers["Content-Type"]) headers["Content-Type"] = "application/json; charset=utf-8";
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(url, {
    method: opts.method || (hasBody ? "POST" : "GET"),
    credentials: "include",
    ...opts,
    headers,
    body,
  });

  const ct = res.headers.get("content-type") || "";
  const isJson = ct.includes("application/json");

  let data = null;
  try {
    data = isJson ? await res.json() : await res.text();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const err = new Error(`API ${res.status} ${res.statusText}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

// ------------------------
// Auth endpoints (sin Firebase)
// ------------------------

export async function signInWithGoogleBackend(payload) {
  return apiFetch("/auth/google", { method: "POST", body: payload });
}

export async function signOutBackend() {
  try {
    await apiFetch("/auth/logout", { method: "POST" });
  } finally {
    clearCurrentUser();
  }
}

// ------------------------
// Servicios / Buscar / Destacados
// ------------------------

export async function getDestacados(limit = 18) {
  try {
    return await apiFetch(`/servicios/destacados${qs({ limit })}`);
  } catch (e) {
    return apiFetch(`/destacados${qs({ limit })}`);
  }
}

export async function getFeatured(limit = 18) {
  try {
    return await apiFetch(`/featured${qs({ limit })}`);
  } catch (e) {
    return getDestacados(limit);
  }
}

export async function buscarServicios(params = {}) {
  return apiFetch(`/servicios/buscar${qs(params)}`);
}

export async function listarServicios(params = {}) {
  return apiFetch(`/servicios${qs(params)}`);
}

export async function getServicioById(id) {
  if (!id) throw new Error("getServicioById: id requerido");
  return apiFetch(`/servicios/${encodeURIComponent(id)}`);
}

export async function crearServicio(payload) {
  return apiFetch("/servicios", { method: "POST", body: payload });
}

export async function actualizarServicio(id, payload) {
  if (!id) throw new Error("actualizarServicio: id requerido");
  return apiFetch(`/servicios/${encodeURIComponent(id)}`, { method: "PUT", body: payload });
}

export async function borrarServicio(id) {
  if (!id) throw new Error("borrarServicio: id requerido");
  return apiFetch(`/servicios/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// ------------------------
// Panel usuario / Admin helpers
// ------------------------

export async function misServicios(params = {}) {
  return apiFetch(`/usuario/servicios${qs(params)}`);
}

export async function misFavoritos(params = {}) {
  try {
    return await apiFetch(`/usuario/favoritos${qs(params)}`);
  } catch (e) {
    return apiFetch(`/favoritos${qs(params)}`);
  }
}

export async function adminListServicios(params = {}) {
  return apiFetch(`/admin/servicios${qs(params)}`);
}

export async function adminAprobarServicio(id, aprobado = true) {
  if (!id) throw new Error("adminAprobarServicio: id requerido");
  return apiFetch(`/admin/servicios/${encodeURIComponent(id)}/estado`, {
    method: "POST",
    body: { aprobado },
  });
}

// ------------------------
// Favoritos (ServicioCard / FavoritosIsland)
// ------------------------

export async function addFavorito(servicioId) {
  if (!servicioId) throw new Error("addFavorito: servicioId requerido");
  try {
    return await apiFetch("/favoritos", { method: "POST", body: { servicioId } });
  } catch (e) {
    return apiFetch("/usuario/favoritos", { method: "POST", body: { servicioId } });
  }
}

export async function removeFavorito(servicioId) {
  if (!servicioId) throw new Error("removeFavorito: servicioId requerido");
  try {
    return await apiFetch(`/favoritos/${encodeURIComponent(servicioId)}`, { method: "DELETE" });
  } catch (e) {
    return apiFetch(`/usuario/favoritos/${encodeURIComponent(servicioId)}`, { method: "DELETE" });
  }
}

// ------------------------
// Localidades + Geocoding (LocationPickerModal)
// ------------------------

export async function buscarLocalidades(texto, limit = 8) {
  const qText = String(texto || "").trim();
  if (!qText) return [];

  try {
    const res = await apiFetch(`/localidades${qs({ texto: qText, limit })}`);
    return res;
  } catch {
    const items = await geocodeES(qText, limit);
    return items.map((it) => ({
      label: it.displayName,
      nombre: it.displayName,
      lat: it.lat,
      lon: it.lon,
      address: it.address || null,
    }));
  }
}

export async function geocodeES(query, limit = 5) {
  const qText = String(query || "").trim();
  if (!qText) return [];

  const url =
    `https://nominatim.openstreetmap.org/search` +
    qs({
      format: "json",
      addressdetails: 1,
      limit,
      countrycodes: "es",
      q: qText,
    });

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "es",
    },
  });

  if (!res.ok) return [];
  const json = await res.json();
  if (!Array.isArray(json)) return [];

  return json.map((x) => ({
    lat: Number(x.lat),
    lon: Number(x.lon),
    displayName: x.display_name || qText,
    address: x.address || null,
    raw: x,
  }));
}

export async function reverseGeocodeES(lat, lon) {
  const url =
    `https://nominatim.openstreetmap.org/reverse` +
    qs({
      format: "json",
      addressdetails: 1,
      lat,
      lon,
    });

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "es",
    },
  });

  if (!res.ok) return null;
  const json = await res.json();
  return {
    lat: Number(json?.lat),
    lon: Number(json?.lon),
    displayName: json?.display_name || "",
    address: json?.address || null,
    raw: json,
  };
}

// ------------------------
// ALIASES (lo que te está faltando en el build)
// ------------------------

// SearchServiciosIsland.tsx espera estos nombres:
export async function getServicios(params = {}) {
  return listarServicios(params);
}

export async function getFavoritos(params = {}) {
  return misFavoritos(params);
}
