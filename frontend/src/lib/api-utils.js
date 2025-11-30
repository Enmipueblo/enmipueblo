// src/lib/api-utils.js

// ----------------------------
// Base URL
// ----------------------------
const BASE = import.meta.env.PUBLIC_BACKEND_URL || "";
const API = BASE.endsWith("/api") ? BASE : `${BASE}/api`;

// ----------------------------
// Helper genérico para requests
// ----------------------------
async function request(url, options = {}) {
  try {
    const res = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
      },
      ...options,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status} → ${text}`);
    }

    return res.json();
  } catch (err) {
    console.error("❌ Request error:", err);
    return { error: err.message || "Error de red" };
  }
}

// ----------------------------
// Servicios (BÚSQUEDA GENERAL /buscar)
// ----------------------------
// AHORA usa /api/servicios (no /system/buscar)
export async function getServicios(params = {}) {
  const q = new URLSearchParams();

  if (params.texto) q.append("texto", params.texto);
  if (params.categoria) q.append("categoria", params.categoria);
  if (params.pueblo) q.append("pueblo", params.pueblo);
  if (params.provincia) q.append("provincia", params.provincia);
  if (params.comunidad) q.append("comunidad", params.comunidad);

  q.append("page", params.page || 1);
  q.append("limit", params.limit || 12);

  return await request(`${API}/servicios?${q.toString()}`);
}

// ----------------------------
// Detalle de servicio
// ----------------------------
export async function getServicio(id) {
  return await request(`${API}/servicios/${id}`);
}

// ----------------------------
// Mis anuncios (panel usuario)
// ----------------------------
export async function getUserServicios(email, page = 1, limit = 12) {
  const q = new URLSearchParams({ email, page, limit });
  return await request(`${API}/servicios?${q.toString()}`);
}

// ----------------------------
// Favoritos
// ----------------------------
export async function getFavoritos(email) {
  return await request(
    `${API}/favorito?email=${encodeURIComponent(email)}`
  );
}

export async function addFavorito(usuarioEmail, servicioId) {
  return await request(`${API}/favorito`, {
    method: "POST",
    body: JSON.stringify({ usuarioEmail, servicioId }),
  });
}

// Formato flexible para no romper nada:
//  - removeFavorito(id)
//  - removeFavorito(usuarioEmail, servicioId)  (por compatibilidad
//    con la versión que usaba email + servicioId)
export async function removeFavorito(arg1, arg2) {
  // Caso 1: removeFavorito(id)
  if (!arg2) {
    const id = arg1;
    return await request(`${API}/favorito/${id}`, {
      method: "DELETE",
    });
  }

  // Caso 2: removeFavorito(usuarioEmail, servicioId)
  const usuarioEmail = arg1;
  const servicioId = arg2;

  const res = await getFavoritos(usuarioEmail);
  const lista = Array.isArray(res) ? res : res.data || [];

  const favObj = lista.find(
    (f) =>
      String(f.servicio?._id || f.servicioId?._id || f.servicio) ===
      String(servicioId)
  );

  if (!favObj) {
    return { ok: true, mensaje: "No estaba en favoritos" };
  }

  return await request(`${API}/favorito/${favObj._id}`, {
    method: "DELETE",
  });
}

// ----------------------------
// Localidades (autocomplete)
// ----------------------------
export async function buscarLocalidades(q) {
  const params = new URLSearchParams({ q });
  return await request(`${API}/localidades/buscar?${params.toString()}`);
}

// ----------------------------
// Crear servicio (JSON puro)
// ----------------------------
export async function crearServicio(payload) {
  // payload es JSON (ya vienen las URLs de fotos/videos)
  return await request(`${API}/servicios`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ----------------------------
// Actualizar servicio
// ----------------------------
export async function updateServicio(id, payload) {
  return await request(`${API}/servicios/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

// ----------------------------
// Eliminar servicio
// ----------------------------
export async function deleteServicio(id) {
  return await request(`${API}/servicios/${id}`, {
    method: "DELETE",
  });
}
