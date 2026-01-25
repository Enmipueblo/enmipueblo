import React, { useEffect, useMemo, useRef, useState } from "react";
import {
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
 * ✅ Etapa 1 (rápida): whitelist por email.
 * IMPORTANTE: esto NO es seguridad real (solo UI). La seguridad real debe estar en el backend.
 * De momento te devuelve el acceso al panel aunque el claim todavía no exista.
 */
const ADMIN_EMAILS = ["serviciosenmipueblo@gmail.com"].map((x) => x.toLowerCase());

const estados = [
  { value: "", label: "Todos" },
  { value: "activo", label: "Activos" },
  { value: "pendiente", label: "Pendientes" },
  { value: "pausado", label: "Pausados" },
  { value: "eliminado", label: "Eliminados" },
];

const AdminPanelIsland: React.FC = () => {
  const [user, setUser] = useState<AdminUser | null | undefined>(undefined);

  // admin calculado (no dependemos de user.isAdmin que no es estándar)
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

  // Calcular admin:
  // - compat: user.isAdmin (si existiera)
  // - whitelist por email
  // - claims.admin (o claims.role === "admin")
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

      // compat vieja
      if (user?.isAdmin === true) {
        if (alive) setIsAdmin(true);
        return;
      }

      const email = String(user?.email || "").toLowerCase();
      const byEmail = ADMIN_EMAILS.includes(email);

      // si no existe getIdTokenResult, al menos damos el byEmail
      const canGetToken =
        user && typeof user.getIdTokenResult === "function" && typeof user.getIdToken === "function";

      if (!canGetToken) {
        if (alive) setIsAdmin(byEmail);
        return;
      }

      try {
        // fuerza refresh de token por si cambiaste claims recientemente
        const tokenResult = await user.getIdTokenResult(true);
        const claims: any = tokenResult?.claims || {};
        const byClaim = !!claims.admin || String(claims.role || "").toLowerCase() === "admin";

        if (alive) setIsAdmin(byClaim || byEmail);
      } catch (e) {
        // si falla claims, nos quedamos con whitelist
        if (alive) setIsAdmin(byEmail);
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

    // Calculamos la fecha real (ISO) que el backend espera.
    const hastaIso = activar
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      : null;

    // optimistic
    if (activar) {
      updateServicioLocal(s._id, { destacado: true, destacadoHasta: hastaIso });
    } else {
      updateServicioLocal(s._id, { destacado: false, destacadoHasta: null });
    }

    try {
      setRowLoading(s._id, "destacar");
      await adminDestacarServicio(s._id, activar, hastaIso);
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

  const handleRevisar = async (id: string) => {
    const found = servicios.find((x) => x._id === id);
    const prev = found?.revisado;

    updateServicioLocal(id, { revisado: true });

    try {
      setRowLoading(id, "revisar");
      await adminMarcarRevisado(id);
    } catch (err) {
      console.error("Error al marcar revisado:", err);
      updateServicioLocal(id, { revisado: prev }); // rollback
      alert("No se pudo marcar como revisado.");
    } finally {
      setRowLoading(id, null);
    }
  };

  const handleDestacarHome = async (s: any) => {
    const activar = !s.destacadoHome;

    const msg = activar
      ? "¿Marcar este servicio como destacado en HOME?"
      : "¿Quitar el destacado HOME de este servicio?";
    if (!confirm(msg)) return;

    const prev = s.destacadoHome;

    updateServicioLocal(s._id, { destacadoHome: activar });

    try {
      setRowLoading(s._id, "destacarHome");
      await adminDestacarHomeServicio(s._id, activar);
    } catch (err) {
      console.error("Error al cambiar destacadoHome:", err);
      updateServicioLocal(s._id, { destacadoHome: prev });
      alert("No se pudo actualizar el destacadoHome.");
    } finally {
      setRowLoading(s._id, null);
    }
  };

  // UI states
  if (user === undefined || isAdmin === null) {
    return (
      <div className="p-6">
        <p className="text-gray-700">Cargando…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6">
        <p className="text-gray-700">Debes iniciar sesión para acceder al panel de administración.</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-6">
        <p className="text-gray-700">No tienes permisos para ver el panel de administración.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold">Panel Admin</h2>
        <button
          className="rounded bg-gray-200 px-3 py-2 text-sm hover:bg-gray-300"
          onClick={() => cargarListado()}
          disabled={loadingList}
        >
          {loadingList ? "Actualizando…" : "Refrescar"}
        </button>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-5">
        <input
          className="rounded border p-2"
          placeholder="Buscar texto…"
          value={fTexto}
          onChange={(e) => {
            setPage(1);
            setFTexto(e.target.value);
          }}
        />
        <select
          className="rounded border p-2"
          value={fEstado}
          onChange={(e) => {
            setPage(1);
            setFEstado(e.target.value);
          }}
        >
          {estados.map((x) => (
            <option key={x.value} value={x.value}>
              {x.label}
            </option>
          ))}
        </select>

        <input
          className="rounded border p-2"
          placeholder="Pueblo…"
          value={fPueblo}
          onChange={(e) => {
            setPage(1);
            setFPueblo(e.target.value);
          }}
        />

        <select
          className="rounded border p-2"
          value={fDestacado}
          onChange={(e) => {
            setPage(1);
            setFDestacado(e.target.value as any);
          }}
        >
          <option value="">Destacado (todos)</option>
          <option value="true">Solo destacados</option>
          <option value="false">No destacados</option>
        </select>

        <select
          className="rounded border p-2"
          value={fDestacadoHome}
          onChange={(e) => {
            setPage(1);
            setFDestacadoHome(e.target.value as any);
          }}
        >
          <option value="">Home (todos)</option>
          <option value="true">Solo home</option>
          <option value="false">No home</option>
        </select>
      </div>

      {error ? <p className="mb-4 text-red-600">{error}</p> : null}

      <div className="overflow-x-auto rounded border">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 text-left">Servicio</th>
              <th className="p-2 text-left">Pueblo</th>
              <th className="p-2 text-left">Estado</th>
              <th className="p-2 text-left">Revisado</th>
              <th className="p-2 text-left">Destacado</th>
              <th className="p-2 text-left">Home</th>
              <th className="p-2 text-left">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {servicios.map((s) => {
              const destHasta = s.destacadoHasta ? new Date(s.destacadoHasta) : null;
              const destAct = s.destacado && destHasta && destHasta.getTime() > Date.now();

              const busy = isRowBusy(s._id);

              return (
                <tr key={s._id} className="border-t">
                  <td className="p-2">
                    <div className="font-semibold">{s.nombre}</div>
                    <div className="text-gray-500">{s.oficio}</div>
                    <div className="text-gray-400">{s.usuarioEmail}</div>
                  </td>
                  <td className="p-2">{s.pueblo}</td>
                  <td className="p-2">{s.estado || "-"}</td>
                  <td className="p-2">{s.revisado ? "✅" : "—"}</td>
                  <td className="p-2">
                    {destAct ? (
                      <span className="rounded bg-yellow-100 px-2 py-1 text-yellow-800">
                        Sí (hasta {destHasta.toLocaleDateString()})
                      </span>
                    ) : (
                      <span className="text-gray-500">No</span>
                    )}
                  </td>
                  <td className="p-2">{s.destacadoHome ? "✅" : "—"}</td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="rounded bg-yellow-200 px-2 py-1 hover:bg-yellow-300 disabled:opacity-50"
                        disabled={busy}
                        onClick={() => handleDestacar(s)}
                        title="Destacar 30 días"
                      >
                        {busy && actionLoading[s._id] === "destacar"
                          ? "…"
                          : destAct
                            ? "Quitar destacado"
                            : "Destacar 30d"}
                      </button>

                      <button
                        className="rounded bg-indigo-200 px-2 py-1 hover:bg-indigo-300 disabled:opacity-50"
                        disabled={busy}
                        onClick={() => handleDestacarHome(s)}
                        title="Destacar en Home"
                      >
                        {busy && actionLoading[s._id] === "destacarHome"
                          ? "…"
                          : s.destacadoHome
                            ? "Quitar Home"
                            : "Home"}
                      </button>

                      <button
                        className="rounded bg-green-200 px-2 py-1 hover:bg-green-300 disabled:opacity-50"
                        disabled={busy}
                        onClick={() => handleEstado(s._id, "activo")}
                      >
                        Activo
                      </button>
                      <button
                        className="rounded bg-orange-200 px-2 py-1 hover:bg-orange-300 disabled:opacity-50"
                        disabled={busy}
                        onClick={() => handleEstado(s._id, "pendiente")}
                      >
                        Pendiente
                      </button>
                      <button
                        className="rounded bg-gray-200 px-2 py-1 hover:bg-gray-300 disabled:opacity-50"
                        disabled={busy}
                        onClick={() => handleEstado(s._id, "pausado")}
                      >
                        Pausar
                      </button>
                      <button
                        className="rounded bg-red-200 px-2 py-1 hover:bg-red-300 disabled:opacity-50"
                        disabled={busy}
                        onClick={() => handleEstado(s._id, "eliminado")}
                      >
                        Eliminar
                      </button>

                      {!s.revisado ? (
                        <button
                          className="rounded bg-blue-200 px-2 py-1 hover:bg-blue-300 disabled:opacity-50"
                          disabled={busy}
                          onClick={() => handleRevisar(s._id)}
                        >
                          {busy && actionLoading[s._id] === "revisar" ? "…" : "Marcar revisado"}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}

            {!loadingList && servicios.length === 0 ? (
              <tr>
                <td className="p-4 text-center text-gray-600" colSpan={7}>
                  No hay resultados.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          className="rounded bg-gray-200 px-3 py-2 text-sm hover:bg-gray-300 disabled:opacity-50"
          disabled={page <= 1 || loadingList}
          onClick={() => setPage((p) => Math.max(p - 1, 1))}
        >
          Anterior
        </button>

        <div className="text-sm text-gray-700">
          Página {page} / {totalPages}
        </div>

        <button
          className="rounded bg-gray-200 px-3 py-2 text-sm hover:bg-gray-300 disabled:opacity-50"
          disabled={page >= totalPages || loadingList}
          onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
};

export default AdminPanelIsland;
