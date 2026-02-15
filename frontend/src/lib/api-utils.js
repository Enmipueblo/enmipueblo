// frontend/src/lib/api-utils.js
//
// Utilidades para llamadas al backend + estado de usuario.
// Importante: este archivo NO debe depender de Firebase.
// La app puede guardar el usuario en localStorage y/o manejar cookies de sesión.
// Este helper intenta ser tolerante y no romper el build SSR.

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

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

/**
 * Suscripción simple al “estado de usuario”.
 * - Llama inmediatamente con el usuario actual.
 * - Reacciona a eventos `auth:changed` (que disparamos al login/logout).
 * - También escucha `storage` por si cambia en otra pestaña.
 *
 * Devuelve: función `unsubscribe()`.
 */
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

/**
 * Heurística admin:
 * - user.isAdmin === true
 * - user.role === "admin"
 * - email incluido en PUBLIC_ADMIN_EMAILS (coma-separado) si existe
 */
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

function normalizeApiPath(path) {
  if (!path) return "/api";
  // si ya viene full URL, lo dejamos
  if (/^https?:\/\//i.test(path)) return path;

  // si ya empieza con /api lo dejamos
  if (path.startsWith("/api/") || path === "/api") return path;

  // si empieza con /, lo prefixeamos con /api
  if (path.startsWith("/")) return `/api${path}`;

  // si no empieza con /, lo hacemos /api/...
  return `/api/${path}`;
}

/**
 * apiFetch:
 * - prefija rutas a /api/*
 * - manda cookies (credentials: "include")
 * - JSON por defecto
 */
export async function apiFetch(path, opts = {}) {
  const url = normalizeApiPath(path);

  const headers = new Headers(opts.headers || {});
  const hasBody = opts.body !== undefined && opts.body !== null;

  // Si body es objeto (y no FormData), mandamos JSON
  const isFormData = isBrowser() && typeof FormData !== "undefined" && opts.body instanceof FormData;
  let body = opts.body;

  if (hasBody && !isFormData && typeof opts.body === "object") {
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json; charset=utf-8");
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(url, {
    method: opts.method || (hasBody ? "POST" : "GET"),
    credentials: "include",
    ...opts,
    headers,
    body,
  });

  // Intentamos parsear JSON si corresponde
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
