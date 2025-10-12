// src/lib/api-utils.js

// Detecta si estamos en local (solo entonces permite usar BACKEND_URL)
function isLocalhost() {
  if (typeof window !== 'undefined') {
    return ['localhost', '127.0.0.1'].includes(window.location.hostname);
  }
  // Durante build no hay window; si no es producción, asumimos local
  return import.meta.env.MODE !== 'production';
}

// Solo usamos BASE externa si estamos en localhost.
// En producción SIEMPRE usamos rutas relativas (/api/...).
const BASE = isLocalhost()
  ? (
      (typeof window !== 'undefined' && window.BACKEND_URL) ||
      import.meta.env.PUBLIC_BACKEND_URL ||
      ''
    ).replace(/\/$/, '')
  : ''; // producción => mismo origen

function buildUrl(path) {
  // path llega como '/buscar?...', '/servicios?...', etc.
  return BASE ? `${BASE}/api${path}` : `/api${path}`;
}

// ------------------ 1) Listado general (búsqueda combinada) ------------------
export async function getServicios(
  q = '',
  localidad = '',
  categoria = '',
  page = 1,
  limit = 12,
) {
  try {
    const params = new URLSearchParams();
    if (q) params.append('q', q);
    if (localidad) params.append('localidad', localidad);
    if (categoria) params.append('categoria', categoria);
    params.append('page', String(page));
    params.append('limit', String(limit));
    const res = await fetch(buildUrl(`/buscar?${params.toString()}`));
    if (!res.ok) {
      console.error('getServicios: HTTP', res.status);
      return { data: [], page: 1, totalPages: 0, totalItems: 0 };
    }
    return await res.json();
  } catch (error) {
    console.error('getServicios: Error al cargar servicios:', error);
    return { data: [], page: 1, totalPages: 0, totalItems: 0 };
  }
}

// ------------------ 1b) Detalle de servicio ------------------
export async function getServicio(id) {
  if (!id) throw new Error('Falta id');
  const res = await fetch(buildUrl(`/servicio/${id}`));
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  return await res.json();
}

// ------------------ 2) Listado por usuario ("Mis anuncios") ------------------
export async function getUserServicios(
  userEmail,
  page = 1,
  limit = 12,
  query = '',
  categoria = '',
) {
  try {
    const params = new URLSearchParams();
    if (userEmail) params.append('email', userEmail);
    if (query) params.append('q', query);
    if (categoria) params.append('categoria', categoria);
    params.append('page', String(page));
    params.append('limit', String(limit));
    const res = await fetch(buildUrl(`/servicios?${params.toString()}`));
    if (!res.ok) {
      console.error('getUserServicios: HTTP', res.status);
      return { data: [], page: 1, totalPages: 0, totalItems: 0 };
    }
    return await res.json();
  } catch (error) {
    console.error('getUserServicios: Error al cargar servicios:', error);
    return { data: [], page: 1, totalPages: 0, totalItems: 0 };
  }
}

// ------------------ 3) Favoritos ------------------
export async function addFavorito(usuarioEmail, servicioId) {
  try {
    const res = await fetch(buildUrl(`/favoritos`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuarioEmail, servicioId }),
    });
    return await res.json();
  } catch (e) {
    return { error: e.message };
  }
}

export async function removeFavorito(favoritoId) {
  try {
    const res = await fetch(buildUrl(`/favoritos/${favoritoId}`), {
      method: 'DELETE',
    });
    return await res.json();
  } catch (e) {
    return { error: e.message };
  }
}

export async function getFavoritos(usuarioEmail) {
  try {
    const res = await fetch(
      buildUrl(`/favoritos?email=${encodeURIComponent(usuarioEmail)}`),
    );
    if (!res.ok) return [];
    const { data } = await res.json();
    return data || [];
  } catch {
    return [];
  }
}

// ------------------ 4) CRUD de servicios ------------------
export async function deleteServicio(servicioId) {
  try {
    const res = await fetch(buildUrl(`/servicio/${servicioId}`), {
      method: 'DELETE',
    });
    return await res.json();
  } catch (e) {
    return { error: e.message };
  }
}

export async function updateServicio(servicioId, data) {
  try {
    const res = await fetch(buildUrl(`/servicio/${servicioId}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await res.json();
  } catch (e) {
    return { error: e.message };
  }
}

// ------------------ 5) Localidades (autocomplete) ------------------
export async function getLocalidades() {
  try {
    const res = await fetch(buildUrl(`/localidades`));
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}
