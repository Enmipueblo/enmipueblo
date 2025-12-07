// src/lib/api-utils.js

// ----------------------------
// Base URL
// ----------------------------
const BASE = import.meta.env.PUBLIC_BACKEND_URL || "";
const API = BASE.endsWith("/api") ? BASE : `${BASE}/api`;

// ----------------------------
// Helper interno: obtener token Firebase (si hay usuario)
//  - Solo en navegador (window definido)
//  - Carga firebase y auth de forma dinámica para no romper SSR
// ----------------------------
async function getIdTokenIfLoggedIn() {
  if (typeof window === "undefined") return null;

  try {
    // Aseguramos que se inicialice Firebase App
    await import("./firebase.js");
    const { getAuth } = await import("firebase/auth");

    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) return null;

    return await user.getIdToken();
  } catch (err) {
    console.warn("No se pudo obtener token de Firebase:", err);
    return null;
  }
}

// ----------------------------
// Helper genérico para requests
// ----------------------------
async function request(url, options = {}) {
  try {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };

    // Añadir Authorization si el usuario está logueado
    const token = await getIdTokenIfLoggedIn();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(url, {
      ...options,
      headers,
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
// AHORA usa /api/servicios
// ----------------------------
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

// Formato flexible:
//  - removeFavorito(id)
//  - removeFavorito(usuarioEmail, servicioId)
export async function removeFavorito(arg1, arg2) {
  if (!arg2) {
    const id = arg1;
    return await request(`${API}/favorito/${id}`, {
      method: "DELETE",
    });
  }

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
  return await request(
    `${API}/localidades/buscar?${params.toString()}`
  );
}

// ----------------------------
// Crear servicio (JSON puro)
// ----------------------------
export async function crearServicio(payload) {
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

// =====================================================
// 🛡️ Funciones ADMIN (panel de moderación)
// =====================================================

// Lista de servicios para el panel admin
export async function adminGetServicios(params = {}) {
  const q = new URLSearchParams();

  if (params.estado) q.append("estado", params.estado);
  if (typeof params.destacado !== "undefined" && params.destacado !== "") {
    q.append("destacado", String(params.destacado));
  }
  if (params.texto) q.append("texto", params.texto);
  if (params.pueblo) q.append("pueblo", params.pueblo);

  q.append("page", params.page || 1);
  q.append("limit", params.limit || 20);

  return await request(`${API}/admin/servicios?${q.toString()}`);
}

// Destacar un servicio X días (por defecto 7)
export async function adminDestacarServicio(id, dias = 7) {
  return await request(`${API}/admin/servicios/${id}/destacar`, {
    method: "POST",
    body: JSON.stringify({ dias }),
  });
}

// Cambiar estado del servicio: activo | pausado | pendiente | eliminado
export async function adminCambiarEstadoServicio(id, estado) {
  return await request(`${API}/admin/servicios/${id}/estado`, {
    method: "POST",
    body: JSON.stringify({ estado }),
  });
}

// Marcar servicio como revisado
export async function adminMarcarRevisado(id) {
  return await request(`${API}/admin/servicios/${id}/revisar`, {
    method: "POST",
  });
}
