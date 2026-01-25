import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  adminMe,
  adminGetServicios,
  adminDestacarServicio,
  adminCambiarEstadoServicio,
  adminMarcarRevisado,
  adminDestacarHomeServicio,
} from "../lib/api-utils.js";
import { onUserStateChange } from "../lib/firebase.js";

type AdminUser = any;
type Servicio = any;

const PAGE_SIZE = 20;

/**
 * Admin: la fuente de verdad es el BACKEND (/api/admin/me), porque es quien decide según ADMIN_EMAILS.
 * Este array queda solo como fallback si el endpoint no existiera (dev/entorno viejo).
 */
const ADMIN_EMAILS: string[] = [];

const estados = [
  { value: "", label: "Todos" },
  { value: "activo", label: "Activos" },
  { value: "pendiente", label: "Pendientes" },
  { value: "pausado", label: "Pausados" },
  { value: "eliminado", label: "Eliminados" },
];

const AdminPanelIsland: React.FC = () => {
  const [user, setUser] = useState<AdminUser | null | undefined>(undefined);

  // admin calculado (backend source of truth)
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState<string>("");

  const [fTexto, setFTexto] = useState("");
  const [fEstado, setFEstado] = useState("");
  const [fPueblo, setFPueblo] = useState("");
  const [fDestacado, setFDestacado] = useState<"" | "true" | "false">("");
  const [fDestacadoHome, setFDestacadoHome] = useState<"" | "true" | "false">("");

  // Loading por fila/acción
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({});

  const setRowLoading = (id: string, action: string | null) => {
    setActionLoading((prev) => {
      const next = { ...prev };
      if (!action) delete next[id];
      else next[id] = action;
      return next;
    });
  };

  const isRowBusy = (id: string) => !!actionLoading[id];

  // User
  useEffect(() => {
    const unsub = onUserStateChange((u: any) => setUser(u));
    return () => unsub?.();
  }, []);

  // Admin según backend (fuente de verdad):
  // - el backend calcula isAdmin por ADMIN_EMAILS
  // - el frontend solo pregunta a /api/admin/me y actúa en base a eso
  useEffect(() => {
    let alive = true;

    (async () => {
      if (user === undefined) {
        if (alive) setIsAdmin(null);
        return;
      }
      if (!user) {
        if (alive) setIsAdmin(false);
        return;
      }

      // mientras chequeamos
      if (alive) setIsAdmin(null);

      try {
        // refrescar token por si la sesión cambió
        if (typeof user.getIdToken === "function") {
          await user.getIdToken(true);
        }

        const me = await adminMe(); // { ok: true, user: { email, isAdmin, ... } }
        const ok = !!me?.user?.isAdmin;

        if (alive) setIsAdmin(ok);
      } catch (e) {
        // fallback: whitelist + claims (solo si /admin/me no existiera o hubiera un error raro)
        const email = String(user?.email || "").toLowerCase();
        const byEmail = ADMIN_EMAILS.includes(email);

        const canGetTokenResult = typeof user.getIdTokenResult === "function";
        if (!canGetTokenResult) {
          if (alive) setIsAdmin(byEmail);
          return;
        }

        try {
          const tokenResult = await user.getIdTokenResult(true);
          const claims: any = tokenResult?.claims || {};
          const byClaim = !!claims.admin || String(claims.role || "").toLowerCase() === "admin";
          if (alive) setIsAdmin(byClaim || byEmail);
        } catch {
          if (alive) setIsAdmin(byEmail);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [user]);

  const filtros = useMemo(() => {
    return {
      texto: fTexto || undefined,
      estado: fEstado || undefined,
      pueblo: fPueblo || undefined,
      destacado: fDestacado === "" ? undefined : fDestacado === "true",
      destacadoHome: fDestacadoHome === "" ? undefined : fDestacadoHome === "true",
      page,
      limit: PAGE_SIZE,
    };
  }, [fTexto, fEstado, fPueblo, fDestacado, fDestacadoHome, page]);

  const loadRef = useRef(0);

  const cargarListado = async () => {
    if (!user || !isAdmin) return;

    const reqId = ++loadRef.current;
    setLoadingList(true);
    setError("");

    try {
      const res = await adminGetServicios(filtros);
      if (reqId !== loadRef.current) return;

      setServicios(res.data || []);
      setTotalPages(res.totalPages || 1);
    } catch (err: any) {
      console.error("Error cargando servicios admin:", err);
      setError(err?.message || "Error cargando listado de servicios.");
    } finally {
      if (reqId === loadRef.current) setLoadingList(false);
    }
  };

  // Cargar servicios
  useEffect(() => {
    if (!user || !isAdmin) return;
    cargarListado();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isAdmin, filtros]);

  // Refresh suave al volver a la pestaña
  useEffect(() => {
    if (!user || !isAdmin) return;

    const onFocus = () => cargarListado();
    const onVis = () => {
      if (document.visibilityState === "visible") cargarListado();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isAdmin, filtros]);

  const updateServicioLocal = (id: string, patch: any) => {
    setServicios((prev) => prev.map((s) => (s._id === id ? { ...s, ...patch } : s)));
  };

  // Acciones admin (optimistic + rollback)
  const handleDestacar = async (s: any) => {
    const destHasta = s.destacadoHasta ? new Date(s.destacadoHasta) : null;
    const destAct = s.destacado && destHasta && destHasta.getTime() > Date.now();
    const activar = !destAct;

    const msg = activar
      ? "¿Destacar este servicio durante 30 días?"
      : "¿Quitar el destacado de este servicio?";
    if (!confirm(msg)) return;

    const prev = { destacado: s.destacado, destacadoHasta: s.destacadoHasta };

    // optimistic
    if (activar) {
      const hasta = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      updateServicioLocal(s._id, { destacado: true, destacadoHasta: hasta.toISOString() });
    } else {
      updateServicioLocal(s._id, { destacado: false, destacadoHasta: null });
    }

    try {
      setRowLoading(s._id, "destacar");
      await adminDestacarServicio(s._id, activar, 30);
    } catch (err) {
      console.error("Error al cambiar destacado:", err);
      updateServicioLocal(s._id, prev); // rollback
      alert("No se pudo actualizar el destacado.");
    } finally {
      setRowLoading(s._id, null);
    }
  };

  const handleEstado = async (id: string, estado: string) => {
    let mensaje = "";
    if (estado === "activo") mensaje = "¿Marcar como ACTIVO?";
    if (estado === "pausado") mensaje = "¿Pausar este servicio?";
    if (estado === "pendiente") mensaje = "¿Marcar como PENDIENTE de revisión?";
    if (estado === "eliminado") mensaje = "¿Eliminar / ocultar este servicio del público?";

    if (!confirm(mensaje || "¿Cambiar estado del servicio?")) return;

    const found = servicios.find((x) => x._id === id);
    const prevEstado = found?.estado;

    // optimistic
    updateServicioLocal(id, { estado });

    try {
      setRowLoading(id, "estado");
      await adminCambiarEstadoServicio(id, estado);
    } catch (err) {
      console.error("Error al cambiar estado:", err);
      updateServicioLocal(id, { estado: prevEstado }); // rollback
      alert("No se pudo actualizar el estado.");
    } finally {
      setRowLoading(id, null);
    }
  };

  const handleRevisado = async (s: any) => {
    const activar = !s.revisado;
    const msg = activar ? "¿Marcar como revisado?" : "¿Quitar marca de revisado?";
    if (!confirm(msg)) return;

    const prev = s.revisado;
    updateServicioLocal(s._id, { revisado: activar });

    try {
      setRowLoading(s._id, "revisado");
      await adminMarcarRevisado(s._id, activar);
    } catch (err) {
      console.error("Error al marcar revisado:", err);
      updateServicioLocal(s._id, { revisado: prev }); // rollback
      alert("No se pudo actualizar revisado.");
    } finally {
      setRowLoading(s._id, null);
    }
  };

  const handleDestacarHome = async (s: any) => {
    const activar = !s.destacadoHome;
    const msg = activar
      ? "¿Destacar este servicio en la portada (home)?"
      : "¿Quitar este servicio de la portada (home)?";
    if (!confirm(msg)) return;

    const prev = s.destacadoHome;
    updateServicioLocal(s._id, { destacadoHome: activar });

    try {
      setRowLoading(s._id, "home");
      await adminDestacarHomeServicio(s._id, activar);
    } catch (err) {
      console.error("Error al cambiar destacadoHome:", err);
      updateServicioLocal(s._id, { destacadoHome: prev }); // rollback
      alert("No se pudo actualizar destacado en portada.");
    } finally {
      setRowLoading(s._id, null);
    }
  };

  // Estados de usuario
  if (user === undefined || isAdmin === null) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <p className="text-emerald-700 animate-pulse">Comprobando permisos…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center">
        <h2 className="text-2xl font-bold text-emerald-800 mb-3">Necesitas iniciar sesión</h2>
        <p className="text-gray-600 mb-4 max-w-md">
          Este panel es solo para el equipo de EnMiPueblo. Inicia sesión con una cuenta autorizada.
        </p>
        <button
          className="bg-emerald-600 text-white px-6 py-3 rounded-xl shadow hover:bg-emerald-700"
          onClick={() => (window as any).showAuthModal && (window as any).showAuthModal()}
        >
          Iniciar sesión
        </button>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <h2 className="text-2xl font-bold text-emerald-800 mb-3">Sin permisos de administrador</h2>
        <p className="text-gray-600 max-w-md">
          Tu cuenta ({String(user.email || "sin email")}) está activa pero no tiene permisos de administración. Si
          crees que es un error, ponte en contacto con{" "}
          <a href="mailto:serviciosenmipueblo@gmail.com" className="text-emerald-700 underline">
            serviciosenmipueblo@gmail.com
          </a>
          .
        </p>
      </div>
    );
  }

  // Render panel
  return (
    <div className="min-h-[80vh] w-full flex items-start justify-center bg-gradient-to-br from-emerald-50 via-white to-emerald-50 py-8">
      <div className="w-full max-w-6xl bg-white rounded-3xl shadow-2xl border border-emerald-100 p-6 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-emerald-900">Panel de administración</h1>
            <p className="text-sm text-gray-600 mt-1">Revisa, destaca y modera anuncios publicados en EnMiPueblo.</p>
          </div>
          <div className="text-xs text-gray-500">
            Sesión: <span className="font-semibold text-emerald-700">{user.email}</span>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-emerald-50/70 border border-emerald-100 rounded-2xl p-4 md:p-5 space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Buscar</label>
              <input
                type="text"
                value={fTexto}
                onChange={(e) => {
                  setFTexto(e.target.value);
                  setPage(1);
                }}
                placeholder="Nombre, oficio, pueblo, email…"
                className="w-full border border-emerald-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="w-full md:w-36">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Estado</label>
              <select
                value={fEstado}
                onChange={(e) => {
                  setFEstado(e.target.value);
                  setPage(1);
                }}
                className="w-full border border-emerald-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {estados.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-full md:w-44">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Destacado</label>
              <select
                value={fDestacado}
                onChange={(e) => {
                  setFDestacado(e.target.value as any);
                  setPage(1);
                }}
                className="w-full border border-emerald-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Todos</option>
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
            </div>

            <div className="w-full md:w-44">
              <label className="block text-xs font-semibold text-gray-600 mb-1">En portada</label>
              <select
                value={fDestacadoHome}
                onChange={(e) => {
                  setFDestacadoHome(e.target.value as any);
                  setPage(1);
                }}
                className="w-full border border-emerald-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Todos</option>
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Pueblo</label>
              <input
                type="text"
                value={fPueblo}
                onChange={(e) => {
                  setFPueblo(e.target.value);
                  setPage(1);
                }}
                placeholder="Filtrar por pueblo…"
                className="w-full border border-emerald-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex items-end gap-3">
              <button
                className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl shadow hover:bg-emerald-700 disabled:opacity-60"
                onClick={() => cargarListado()}
                disabled={loadingList}
              >
                {loadingList ? "Cargando…" : "Actualizar"}
              </button>

              <button
                className="border border-emerald-200 text-emerald-800 px-5 py-2.5 rounded-xl hover:bg-emerald-50"
                onClick={() => {
                  setFTexto("");
                  setFEstado("");
                  setFPueblo("");
                  setFDestacado("");
                  setFDestacadoHome("");
                  setPage(1);
                }}
              >
                Limpiar
              </button>
            </div>
          </div>
        </div>

        {/* Error */}
        {error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4">
            {error}
          </div>
        ) : null}

        {/* Tabla */}
        <div className="overflow-x-auto border border-emerald-100 rounded-2xl">
          <table className="min-w-full text-sm">
            <thead className="bg-emerald-50 text-emerald-900">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Servicio</th>
                <th className="text-left px-4 py-3 font-semibold">Ubicación</th>
                <th className="text-left px-4 py-3 font-semibold">Estado</th>
                <th className="text-left px-4 py-3 font-semibold">Revisado</th>
                <th className="text-left px-4 py-3 font-semibold">Destacado</th>
                <th className="text-left px-4 py-3 font-semibold">Portada</th>
                <th className="text-right px-4 py-3 font-semibold">Acciones</th>
              </tr>
            </thead>

            <tbody>
              {loadingList ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                    Cargando…
                  </td>
                </tr>
              ) : servicios.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                    No hay servicios con estos filtros.
                  </td>
                </tr>
              ) : (
                servicios.map((s: any) => {
                  const destHasta = s.destacadoHasta ? new Date(s.destacadoHasta) : null;
                  const destVigente = s.destacado && destHasta && destHasta.getTime() > Date.now();

                  return (
                    <tr key={s._id} className="border-t border-emerald-50 hover:bg-emerald-50/40">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-emerald-900">{s.profesionalNombre || s.nombre}</div>
                        <div className="text-xs text-gray-500">{s.oficio || s.categoria || ""}</div>
                        <div className="text-xs text-gray-400 mt-1">{s.usuarioEmail || ""}</div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="text-gray-700">{s.pueblo || "-"}</div>
                        <div className="text-xs text-gray-500">{s.provincia || ""}</div>
                      </td>

                      <td className="px-4 py-3">
                        <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 border border-emerald-100 text-emerald-900">
                          {String(s.estado || "").toUpperCase()}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={
                            "inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border " +
                            (s.revisado
                              ? "bg-emerald-50 border-emerald-100 text-emerald-900"
                              : "bg-yellow-50 border-yellow-200 text-yellow-800")
                          }
                        >
                          {s.revisado ? "Sí" : "No"}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={
                            "inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border " +
                            (destVigente
                              ? "bg-emerald-50 border-emerald-100 text-emerald-900"
                              : "bg-gray-50 border-gray-200 text-gray-700")
                          }
                        >
                          {destVigente ? "Sí" : "No"}
                        </span>
                        {destVigente && destHasta ? (
                          <div className="text-[11px] text-gray-500 mt-1">
                            hasta {destHasta.toLocaleDateString()}
                          </div>
                        ) : null}
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={
                            "inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border " +
                            (s.destacadoHome
                              ? "bg-emerald-50 border-emerald-100 text-emerald-900"
                              : "bg-gray-50 border-gray-200 text-gray-700")
                          }
                        >
                          {s.destacadoHome ? "Sí" : "No"}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col md:flex-row justify-end gap-2">
                          <button
                            className="px-3 py-2 rounded-xl border border-emerald-200 hover:bg-emerald-50 text-emerald-800 disabled:opacity-60"
                            disabled={isRowBusy(s._id)}
                            onClick={() => handleRevisado(s)}
                          >
                            {actionLoading[s._id] === "revisado" ? "…" : s.revisado ? "No revisado" : "Revisado"}
                          </button>

                          <button
                            className="px-3 py-2 rounded-xl border border-emerald-200 hover:bg-emerald-50 text-emerald-800 disabled:opacity-60"
                            disabled={isRowBusy(s._id)}
                            onClick={() => handleDestacar(s)}
                          >
                            {actionLoading[s._id] === "destacar" ? "…" : destVigente ? "Quitar destacado" : "Destacar"}
                          </button>

                          <button
                            className="px-3 py-2 rounded-xl border border-emerald-200 hover:bg-emerald-50 text-emerald-800 disabled:opacity-60"
                            disabled={isRowBusy(s._id)}
                            onClick={() => handleDestacarHome(s)}
                          >
                            {actionLoading[s._id] === "home" ? "…" : s.destacadoHome ? "Quitar portada" : "En portada"}
                          </button>

                          <select
                            className="px-3 py-2 rounded-xl border border-emerald-200 bg-white text-emerald-900 disabled:opacity-60"
                            disabled={isRowBusy(s._id)}
                            value={s.estado || ""}
                            onChange={(e) => handleEstado(s._id, e.target.value)}
                          >
                            <option value="activo">ACTIVO</option>
                            <option value="pendiente">PENDIENTE</option>
                            <option value="pausado">PAUSADO</option>
                            <option value="eliminado">ELIMINADO</option>
                          </select>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        <div className="flex items-center justify-between pt-2">
          <div className="text-sm text-gray-600">
            Página <span className="font-semibold text-emerald-800">{page}</span> de{" "}
            <span className="font-semibold text-emerald-800">{totalPages}</span>
          </div>

          <div className="flex gap-2">
            <button
              className="px-4 py-2 rounded-xl border border-emerald-200 hover:bg-emerald-50 disabled:opacity-50"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loadingList}
            >
              ← Anterior
            </button>
            <button
              className="px-4 py-2 rounded-xl border border-emerald-200 hover:bg-emerald-50 disabled:opacity-50"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loadingList}
            >
              Siguiente →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPanelIsland;
