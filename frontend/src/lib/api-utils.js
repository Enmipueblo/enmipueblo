// frontend/src/lib/api-utils.js
// Capa única de API + compatibilidad de nombres antiguos
// Objetivo: que NO vuelva a fallar el build por exports faltantes.

// ------------------------
// helpers
// ------------------------
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

function normalizeApiPath(path) {
  if (!path) return `${API_BASE}`;
  if (/^https?:\/\//i.test(path)) return path;
  if (path === API_BASE || path.startsWith(`${API_BASE}/`)) return path;
  if (path.startsWith("/")) return `${API_BASE}${path}`;
  return `${API_BASE}/${path}`;
}

async function tryApi(paths, opts) {
  let lastErr = null;
  for (const p of paths) {
    try {
      return await apiFetch(p, opts);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("API error");
}

// ------------------------
// User state (SIN Firebase)
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
    if (user) window.localStorage.setItem("enmipueblo_user", JSON.stringify(user));
    else window.localStorage.removeItem("enmipueblo_user");
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
    if (!e?.key) return;
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
// Servicios / Buscar / Destacados
// ------------------------
export async function getDestacados(limit = 18) {
  return tryApi(
    [
      `/servicios/destacados${qs({ limit })}`,
      `/destacados${qs({ limit })}`,
      `/featured${qs({ limit })}`,
    ],
    {}
  );
}

export async function listarServicios(params = {}) {
  return tryApi([`/servicios${qs(params)}`, `/servicios/list${qs(params)}`], {});
}

export async function buscarServicios(params = {}) {
  return tryApi(
    [`/servicios/buscar${qs(params)}`, `/buscar${qs(params)}`, `/search${qs(params)}`],
    {}
  );
}

export async function getServicioById(id) {
  if (!id) throw new Error("getServicioById: id requerido");
  return tryApi(
    [
      `/servicios/${encodeURIComponent(id)}`,
      `/servicio/${encodeURIComponent(id)}`,
      `/services/${encodeURIComponent(id)}`,
    ],
    {}
  );
}

export async function getServicioRelacionadosById(id, limit = 8) {
  if (!id) return [];
  try {
    return await tryApi(
      [
        `/servicios/${encodeURIComponent(id)}/relacionados${qs({ limit })}`,
        `/servicios/${encodeURIComponent(id)}/related${qs({ limit })}`,
        `/servicios/relacionados${qs({ id, limit })}`,
        `/servicios/related${qs({ id, limit })}`,
        `/relacionados${qs({ servicioId: id, limit })}`,
      ],
      {}
    );
  } catch {
    return [];
  }
}

export async function crearServicio(payload) {
  return tryApi([`/servicios`, `/servicio`], { method: "POST", body: payload });
}

export async function actualizarServicio(id, payload) {
  if (!id) throw new Error("actualizarServicio: id requerido");
  return tryApi(
    [`/servicios/${encodeURIComponent(id)}`, `/servicio/${encodeURIComponent(id)}`],
    { method: "PUT", body: payload }
  );
}

export async function borrarServicio(id) {
  if (!id) throw new Error("borrarServicio: id requerido");
  return tryApi(
    [`/servicios/${encodeURIComponent(id)}`, `/servicio/${encodeURIComponent(id)}`],
    { method: "DELETE" }
  );
}

// ------------------------
// Favoritos
// ------------------------
export async function misFavoritos(params = {}) {
  return tryApi([`/usuario/favoritos${qs(params)}`, `/favoritos${qs(params)}`], {});
}

export async function addFavorito(servicioId) {
  if (!servicioId) throw new Error("addFavorito: servicioId requerido");
  return tryApi([`/favoritos`, `/usuario/favoritos`], {
    method: "POST",
    body: { servicioId },
  });
}

export async function removeFavorito(servicioId) {
  if (!servicioId) throw new Error("removeFavorito: servicioId requerido");
  return tryApi(
    [
      `/favoritos/${encodeURIComponent(servicioId)}`,
      `/usuario/favoritos/${encodeURIComponent(servicioId)}`,
    ],
    { method: "DELETE" }
  );
}

// ------------------------
// Panel usuario / Admin
// ------------------------
export async function misServicios(params = {}) {
  return tryApi([`/usuario/servicios${qs(params)}`, `/mis-servicios${qs(params)}`], {});
}

export async function adminListServicios(params = {}) {
  return tryApi([`/admin/servicios${qs(params)}`, `/admin/services${qs(params)}`], {});
}

export async function adminAprobarServicio(id, aprobado = true) {
  if (!id) throw new Error("adminAprobarServicio: id requerido");
  return tryApi(
    [
      `/admin/servicios/${encodeURIComponent(id)}/estado`,
      `/admin/servicios/${encodeURIComponent(id)}/status`,
    ],
    { method: "POST", body: { aprobado } }
  );
}

// ------------------------
// Localidades + Geocoding
// ------------------------
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
    headers: { Accept: "application/json", "Accept-Language": "es" },
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

export async function buscarLocalidades(texto, limit = 8) {
  const qText = String(texto || "").trim();
  if (!qText) return [];

  try {
    return await tryApi([`/localidades${qs({ texto: qText, limit })}`], {});
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

// ------------------------
// COMPAT: aliases que usan los componentes viejos
// ------------------------

// destacados/featured
export async function getFeatured(limit = 18) {
  return getDestacados(limit);
}
export async function getServiciosDestacados(limit = 18) {
  return getDestacados(limit);
}

// servicios list/buscar
export async function getServicios(params = {}) {
  return listarServicios(params);
}
export async function searchServicios(params = {}) {
  return buscarServicios(params);
}

// servicio detalle + relacionados
export async function getServicio(id) {
  return getServicioById(id);
}
export async function getServicioRelacionados(id, limit = 8) {
  return getServicioRelacionadosById(id, limit);
}
export async function getServiciosRelacionados(id, limit = 8) {
  return getServicioRelacionadosById(id, limit);
}

// favoritos
export async function getFavoritos(params = {}) {
  return misFavoritos(params);
}

// CRUD aliases comunes
export async function crearAnuncio(payload) {
  return crearServicio(payload);
}
export async function editarServicio(id, payload) {
  return actualizarServicio(id, payload);
}
export async function eliminarServicio(id) {
  return borrarServicio(id);
}

// ✅ ESTE era el error nuevo
export async function deleteServicio(id) {
  return borrarServicio(id);
}

// extras típicos (para cortar futuros errores por nombres alternativos)
export async function removeServicio(id) {
  return borrarServicio(id);
}
export async function updateServicio(id, payload) {
  return actualizarServicio(id, payload);
}
export async function putServicio(id, payload) {
  return actualizarServicio(id, payload);
}
export async function getUserServicios(params = {}) {
  return misServicios(params);
}
export async function getMisServicios(params = {}) {
  return misServicios(params);
}
export async function getAdminServicios(params = {}) {
  return adminListServicios(params);
}
export async function aprobarServicio(id, aprobado = true) {
  return adminAprobarServicio(id, aprobado);
}
