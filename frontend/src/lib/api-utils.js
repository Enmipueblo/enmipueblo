// frontend/src/lib/api-utils.js

// ----------------------------
// Base URL
// ----------------------------
const BASE = import.meta.env.PUBLIC_BACKEND_URL || "";
const API = BASE.endsWith("/api") ? BASE : `${BASE}/api`;

// ----------------------------
// Helper interno: obtener token Firebase (si hay usuario)
// ----------------------------
async function getIdTokenIfLoggedIn() {
  if (typeof window === "undefined") return null;

  try {
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
// ----------------------------
export async function getServicios(params = {}) {
  const q = new URLSearchParams();

  if (params.texto) q.append("texto", params.texto);
  if (params.categoria) q.append("categoria", params.categoria);
  if (params.pueblo) q.append("pueblo", params.pueblo);
  if (params.provincia) q.append("provincia", params.provincia);
  if (params.comunidad) q.append("comunidad", params.comunidad);
  if (params.estado) q.append("estado", params.estado);
  if (typeof params.destacado !== "undefined") {
    q.append("destacado", String(params.destacado));
  }
  if (typeof params.destacadoHome !== "undefined") {
    q.append("destacadoHome", String(params.destacadoHome));
  }

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

// ===================================================
// FUNCIONES ADMIN
// ===================================================
export async function adminGetServicios(filters = {}) {
  const q = new URLSearchParams();

  if (filters.texto) q.append("texto", filters.texto);
  if (filters.estado) q.append("estado", filters.estado);
  if (filters.pueblo) q.append("pueblo", filters.pueblo);
  if (typeof filters.destacado !== "undefined") {
    q.append("destacado", String(filters.destacado));
  }
  if (typeof filters.destacadoHome !== "undefined") {
    q.append("destacadoHome", String(filters.destacadoHome));
  }

  q.append("page", filters.page || 1);
  q.append("limit", filters.limit || 20);

  return await request(`${API}/admin/servicios?${q.toString()}`);
}

// activo = true → destacar X días
// activo = false → quitar destacado
export async function adminDestacarServicio(
  id,
  activo = true,
  dias = 30
) {
  return await request(`${API}/admin/servicios/${id}/destacar`, {
    method: "POST",
    body: JSON.stringify({ activo, dias }),
  });
}

export async function adminCambiarEstadoServicio(id, estado) {
  return await request(`${API}/admin/servicios/${id}/estado`, {
    method: "POST",
    body: JSON.stringify({ estado }),
  });
}

export async function adminMarcarRevisado(id) {
  return await request(`${API}/admin/servicios/${id}/revisado`, {
    method: "POST",
  });
}

// Destacar en portada (home)
export async function adminDestacarHomeServicio(id, activo = true) {
  return await request(
    `${API}/admin/servicios/${id}/destacar-home`,
    {
      method: "POST",
      body: JSON.stringify({ activo }),
    }
  );
}
