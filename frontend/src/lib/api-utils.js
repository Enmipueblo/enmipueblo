// frontend/src/lib/api-utils.js
import { auth } from "./firebase.js";

/**
 * Base:
 * - PUBLIC_API_URL: ej "https://api-xxxx..." (SIN /api)
 * - o PUBLIC_BACKEND_URL="/api" en prod
 */
const RAW_BASE =
  import.meta.env.PUBLIC_API_URL ||
  import.meta.env.PUBLIC_BACKEND_URL ||
  import.meta.env.PUBLIC_BACKEND ||
  "";

const BASE = String(RAW_BASE || "").replace(/\/$/, "");
const API_BASE = !BASE ? "/api" : BASE.endsWith("/api") ? BASE : `${BASE}/api`;

function qs(params = {}) {
  const u = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    u.set(k, String(v));
  });
  const s = u.toString();
  return s ? `?${s}` : "";
}

// ======================
// AUTH TOKEN (Firebase)
// ======================
async function getFirebaseToken(forceRefresh = false) {
  try {
    const u = auth?.currentUser;
    if (!u?.getIdToken) return null;
    return await u.getIdToken(!!forceRefresh);
  } catch {
    return null;
  }
}

async function _fetchJson(url, opts = {}) {
  const forceRefreshToken = !!opts.forceRefreshToken;
  const token = await getFirebaseToken(forceRefreshToken);

  const headers = new Headers(opts.headers || {});
  if (!headers.has("Content-Type") && opts.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(url, {
    credentials: "include",
    ...opts,
    headers,
  });

  let out = null;
  try {
    out = await res.json();
  } catch {
    out = null;
  }

  if (!res.ok) {
    const msg = out?.error || out?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return out;
}

// ======================
// SERVICIOS (público + usuario)
// ======================
export async function getServicios(params = {}) {
  return _fetchJson(`${API_BASE}/servicios${qs(params)}`);
}

export async function getServicio(id) {
  if (!id) throw new Error("Falta id");
  return _fetchJson(`${API_BASE}/servicios/${encodeURIComponent(id)}`);
}

// compat: componentes viejos
export const getServicioById = getServicio;

export async function crearServicio(data) {
  return _fetchJson(`${API_BASE}/servicios`, {
    method: "POST",
    body: JSON.stringify(data || {}),
    forceRefreshToken: true,
  });
}

export async function actualizarServicio(id, data) {
  if (!id) throw new Error("Falta id");
  return _fetchJson(`${API_BASE}/servicios/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(data || {}),
    forceRefreshToken: true,
  });
}

// compat
export const updateServicio = actualizarServicio;

export async function eliminarServicio(id) {
  if (!id) throw new Error("Falta id");
  return _fetchJson(`${API_BASE}/servicios/${encodeURIComponent(id)}`, {
    method: "DELETE",
    forceRefreshToken: true,
  });
}

// “mis anuncios”
export async function getUserServicios(email, page = 1, limit = 12, estado) {
  return _fetchJson(`${API_BASE}/servicios${qs({ mine: 1, page, limit, estado })}`, {
    forceRefreshToken: true,
  });
}

// ======================
// RELACIONADOS
// ======================
export async function getServicioRelacionados(id) {
  if (!id) throw new Error("Falta id");
  return _fetchJson(`${API_BASE}/servicios/relacionados/${encodeURIComponent(id)}`);
}

// ======================
// FAVORITOS
// ======================
export async function getFavoritos(email) {
  return _fetchJson(`${API_BASE}/favorito`, { forceRefreshToken: true });
}

export async function addFavorito(usuarioEmail, servicioId) {
  return _fetchJson(`${API_BASE}/favorito`, {
    method: "POST",
    body: JSON.stringify({ servicioId }),
    forceRefreshToken: true,
  });
}

export async function removeFavorito(usuarioEmail, servicioId) {
  return _fetchJson(`${API_BASE}/favorito`, {
    method: "DELETE",
    body: JSON.stringify({ servicioId }),
    forceRefreshToken: true,
  });
}

// ======================
// LOCALIDADES
// ======================
export async function buscarLocalidades(q) {
  return _fetchJson(`${API_BASE}/localidades/buscar${qs({ q })}`);
}

// ======================
// GEO (cache suave navegador)
// ======================
const GEO_CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 días

function geoCacheKey(texto) {
  return `geo_es_v1:${String(texto || "").trim().toLowerCase()}`;
}

export async function geocodeES(texto) {
  const t = String(texto || "").trim();
  if (!t) return null;

  if (typeof window !== "undefined") {
    const key = geoCacheKey(t);
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const j = JSON.parse(raw);
        if (j?.ts && Date.now() - j.ts < GEO_CACHE_TTL && j?.lat && j?.lng) return j;
      }
    } catch {}
  }

  const url =
    `https://nominatim.openstreetmap.org/search?` +
    new URLSearchParams({
      q: t,
      format: "json",
      limit: "1",
      countrycodes: "es",
    }).toString();

  const res = await fetch(url, { headers: { "Accept-Language": "es" } });
  if (!res.ok) return null;

  const arr = await res.json();
  const first = arr?.[0];
  if (!first?.lat || !first?.lon) return null;

  const out = { ts: Date.now(), lat: Number(first.lat), lng: Number(first.lon) };

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(geoCacheKey(t), JSON.stringify(out));
    } catch {}
  }

  return out;
}

// ======================
// ADMIN
// ======================
export async function adminMe() {
  return _fetchJson(`${API_BASE}/admin/me`, { forceRefreshToken: true });
}

export async function adminGetServicios(params = {}) {
  return _fetchJson(`${API_BASE}/admin/servicios${qs(params)}`, { forceRefreshToken: true });
}

export async function adminCambiarEstadoServicio(id, estado) {
  if (!id) throw new Error("Falta id");
  return _fetchJson(`${API_BASE}/admin/servicios/${encodeURIComponent(id)}/estado`, {
    method: "PATCH",
    body: JSON.stringify({ estado }),
    forceRefreshToken: true,
  });
}

/**
 * ✅ FIX 1970:
 * - Si destacás y pasás "30" => se convierte a fecha (hoy + 30 días)
 * - Si pasás un ISO string => se usa tal cual
 */
export async function adminDestacarServicio(id, destacado, daysOrHasta = 30) {
  if (!id) throw new Error("Falta id");

  const d = !!destacado;
  let destacadoHasta = null;

  if (d) {
    if (typeof daysOrHasta === "number" && Number.isFinite(daysOrHasta)) {
      const ms = Math.max(daysOrHasta, 1) * 24 * 60 * 60 * 1000;
      destacadoHasta = new Date(Date.now() + ms).toISOString();
    } else if (typeof daysOrHasta === "string" && daysOrHasta.trim()) {
      destacadoHasta = daysOrHasta.trim();
    } else {
      destacadoHasta = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    }
  }

  return _fetchJson(`${API_BASE}/admin/servicios/${encodeURIComponent(id)}/destacar`, {
    method: "PATCH",
    body: JSON.stringify({ destacado: d, destacadoHasta }),
    forceRefreshToken: true,
  });
}

export async function adminMarcarRevisado(id, revisado) {
  if (!id) throw new Error("Falta id");
  return _fetchJson(`${API_BASE}/admin/servicios/${encodeURIComponent(id)}/revisado`, {
    method: "PATCH",
    body: JSON.stringify({ revisado: !!revisado }),
    forceRefreshToken: true,
  });
}

export async function adminDestacarHomeServicio(id, destacadoHome) {
  if (!id) throw new Error("Falta id");
  return _fetchJson(`${API_BASE}/admin/servicios/${encodeURIComponent(id)}/destacar-home`, {
    method: "PATCH",
    body: JSON.stringify({ destacadoHome: !!destacadoHome }),
    forceRefreshToken: true,
  });
}

// compat
export const adminSetEstadoServicio = adminCambiarEstadoServicio;

export async function adminEliminarServicio(id) {
  return adminCambiarEstadoServicio(id, "eliminado");
}

// ======================
// ALIASES (compatibilidad nombres antiguos)
// ======================
export const deleteServicio = eliminarServicio;
