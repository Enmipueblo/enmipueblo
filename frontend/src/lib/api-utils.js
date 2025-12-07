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
export async function buscarLocalidades(qStr) {
  const params = new URLSearchParams({ q: qStr });
  return await request(
    `${API}/localidades/buscar?${params.toString()}`
  );
}

// ----------------------------
// CRUD SERVICIOS (usuario)
// ----------------------------
export async function crearServicio(payload) {
  return await request(`${API}/servicios`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateServicio(id, payload) {
  return await request(`${API}/servicios/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteServicio(id) {
  return await request(`${API}/servicios/${id}`, {
    method: "DELETE",
  });
}

// ----------------------------
// ADMIN: gestión de servicios
// ----------------------------
export async function adminGetServicios(params = {}) {
  const q = new URLSearchParams();

  if (params.texto) q.append("texto", params.texto);
  if (params.estado) q.append("estado", params.estado);
  if (params.pueblo) q.append("pueblo", params.pueblo);
  if (typeof params.destacado === "boolean") {
    q.append("destacado", params.destacado ? "true" : "false");
  }

  q.append("page", params.page || 1);
  q.append("limit", params.limit || 20);

  return await request(`${API}/admin/servicios?${q.toString()}`);
}

export async function adminDestacarServicio(id, dias = 7) {
  return await request(`${API}/admin/servicios/${id}/destacar`, {
    method: "POST",
    body: JSON.stringify({ dias }),
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
