// frontend/src/components/AdminPanelIsland.tsx
import React, { useEffect, useState } from "react";
import {
  adminGetServicios,
  adminDestacarServicio,
  adminCambiarEstadoServicio,
  adminMarcarRevisado,
} from "../lib/api-utils.js";
import { onUserStateChange } from "../lib/firebase.js";

type AdminUser = any; // FirebaseUser extendido con .isAdmin
type Servicio = any;

const PAGE_SIZE = 20;

const estados = [
  { value: "", label: "Todos" },
  { value: "activo", label: "Activos" },
  { value: "pendiente", label: "Pendientes" },
  { value: "pausado", label: "Pausados" },
  { value: "eliminado", label: "Eliminados" },
];

const AdminPanelIsland: React.FC = () => {
  const [user, setUser] = useState<AdminUser | null | undefined>(undefined);

  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const [fTexto, setFTexto] = useState("");
  const [fEstado, setFEstado] = useState("");
  const [fPueblo, setFPueblo] = useState("");
  const [fDestacado, setFDestacado] = useState<"" | "true" | "false">("");

  // clave para forzar recarga sin cambiar página/filtros
  const [reloadKey, setReloadKey] = useState(0);

  // ===========================
  // 1. User admin
  // ===========================
  useEffect(() => {
    const unsub = onUserStateChange((u) => setUser(u));
    return () => unsub?.();
  }, []);

  // ===========================
  // 2. Cargar servicios
  // ===========================
  useEffect(() => {
    if (!user || !user.isAdmin) return;

    const load = async () => {
      setLoading(true);
      setError("");

      try {
        const res = await adminGetServicios({
          texto: fTexto || undefined,
          estado: fEstado || undefined,
          pueblo: fPueblo || undefined,
          destacado: fDestacado === "" ? undefined : fDestacado === "true",
          page,
          limit: PAGE_SIZE,
        });

        setServicios(res.data || []);
        setTotalPages(res.totalPages || 1);
      } catch (err: any) {
        console.error("Error cargando servicios admin:", err);
        setError(err?.message || "Error cargando listado de servicios.");
      } finally {
        setLoading(false);
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, page, fTexto, fEstado, fPueblo, fDestacado, reloadKey]);

  const recargar = () => {
    // fuerza que el useEffect vuelva a pedir datos
    setReloadKey((k) => k + 1);
  };

  // ===========================
  // 3. Acciones admin
  // ===========================
  const handleDestacar = async (id: string) => {
    if (!confirm("¿Destacar este servicio durante 7 días?")) return;

    try {
      setLoading(true);
      await adminDestacarServicio(id, 7);
      recargar();
    } catch (err) {
      console.error("Error al destacar servicio:", err);
      alert("No se pudo destacar el servicio.");
    } finally {
      setLoading(false);
    }
  };

  const handleEstado = async (id: string, estado: string) => {
    let mensaje = "";
    if (estado === "activo") mensaje = "¿Marcar como ACTIVO?";
    if (estado === "pausado") mensaje = "¿Pausar este servicio?";
    if (estado === "pendiente") mensaje = "¿Marcar como PENDIENTE de revisión?";
    if (estado === "eliminado")
      mensaje = "¿Marcar como ELIMINADO (no se mostrará público)?";

    if (!confirm(mensaje || "¿Cambiar estado del servicio?")) return;

    try {
      setLoading(true);
      await adminCambiarEstadoServicio(id, estado);
      recargar();
    } catch (err) {
      console.error("Error al cambiar estado:", err);
      alert("No se pudo actualizar el estado.");
    } finally {
      setLoading(false);
    }
  };

  const handleRevisar = async (id: string) => {
    try {
      setLoading(true);
      await adminMarcarRevisado(id);
      recargar();
    } catch (err) {
      console.error("Error al marcar revisado:", err);
      alert("No se pudo marcar como revisado.");
    } finally {
      setLoading(false);
    }
  };

  // ===========================
  // 4. Estados de usuario
  // ===========================
  if (user === undefined) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <p className="text-emerald-700 animate-pulse">
          Comprobando permisos…
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center">
        <h2 className="text-2xl font-bold text-emerald-800 mb-3">
          Necesitas iniciar sesión
        </h2>
        <p className="text-gray-600 mb-4 max-w-md">
          Este panel es solo para el equipo de EnMiPueblo. Inicia sesión con
          una cuenta autorizada.
        </p>
        <button
          className="bg-emerald-600 text-white px-6 py-3 rounded-xl shadow hover:bg-emerald-700"
          onClick={() =>
            (window as any).showAuthModal &&
            (window as any).showAuthModal()
          }
        >
          Iniciar sesión
        </button>
      </div>
    );
  }

  if (!user.isAdmin) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <h2 className="text-2xl font-bold text-emerald-800 mb-3">
          Sin permisos de administrador
        </h2>
        <p className="text-gray-600 max-w-md">
          Tu cuenta está activa pero no tiene permisos de administración. Si
          crees que es un error, ponte en contacto con{" "}
          <a
            href="mailto:serviciosenmipueblo@gmail.com"
            className="text-emerald-700 underline"
          >
            serviciosenmipueblo@gmail.com
          </a>
          .
        </p>
      </div>
    );
  }

  // ===========================
  // 5. Render panel
  // ===========================
  return (
    <div className="min-h-[80vh] w-full flex items-start justify-center bg-gradient-to-br from-emerald-50 via-white to-emerald-50 py-8">
      <div className="w-full max-w-6xl bg-white rounded-3xl shadow-2xl border border-emerald-100 p-6 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-emerald-900">
              Panel de administración
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Revisa, destaca y modera anuncios publicados en EnMiPueblo.
            </p>
          </div>
          <div className="text-xs text-gray-500">
            Sesión:{" "}
            <span className="font-semibold text-emerald-700">
              {user.email}
            </span>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-emerald-50/70 border border-emerald-100 rounded-2xl p-4 md:p-5 space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Buscar
              </label>
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

            <div className="w-full md:w-40">
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Estado
              </label>
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

            <div className="w-full md:w-40">
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Destacados
              </label>
              <select
                value={fDestacado}
                onChange={(e) => {
                  setFDestacado(e.target.value as any);
                  setPage(1);
                }}
                className="w-full border border-emerald-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Todos</option>
                <option value="true">Solo destacados</option>
                <option value="false">No destacados</option>
              </select>
            </div>

            <div className="w-full md:w-40">
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Pueblo
              </label>
              <input
                type="text"
                value={fPueblo}
                onChange={(e) => {
                  setFPueblo(e.target.value);
                  setPage(1);
                }}
                placeholder="Pueblo exacto"
                className="w-full border border-emerald-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto rounded-2xl border border-emerald-100">
          <table className="min-w-full text-sm">
            <thead className="bg-emerald-900 text-emerald-50">
              <tr>
                <th className="text-left px-3 py-2">Servicio</th>
                <th className="text-left px-3 py-2">Ubicación</th>
                <th className="text-left px-3 py-2">Usuario</th>
                <th className="text-left px-3 py-2">Estado</th>
                <th className="text-left px-3 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-emerald-50">
              {loading && (
                <tr>
                  <td
                    colSpan={5}
                    className="text-center px-4 py-6 text-gray-500"
                  >
                    Cargando servicios…
                  </td>
                </tr>
              )}

              {!loading && !servicios.length && (
                <tr>
                  <td
                    colSpan={5}
                    className="text-center px-4 py-6 text-gray-500"
                  >
                    No hay servicios que coincidan con los filtros.
                  </td>
                </tr>
              )}

              {!loading &&
                servicios.map((s: any) => {
                  const creado = s.creadoEn ? new Date(s.creadoEn) : null;

                  const creadoStr = creado
                    ? creado.toLocaleDateString("es-ES", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "2-digit",
                      })
                    : "-";

                  const isDestacado = !!s.destacado;
                  const destHasta = s.destacadoHasta
                    ? new Date(s.destacadoHasta)
                    : null;

                  const destAct =
                    isDestacado &&
                    destHasta &&
                    destHasta.getTime() > Date.now();

                  return (
                    <tr key={s._id} className="hover:bg-emerald-50/40">
                      <td className="px-3 py-3 align-top">
                        <a
                          href={`/servicio?id=${encodeURIComponent(s._id)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-emerald-800 hover:underline"
                        >
                          {s.nombre}
                        </a>
                        <div className="text-xs text-emerald-600">
                          {s.oficio}
                        </div>
                        <div className="text-[11px] text-gray-500 mt-1">
                          {creadoStr}
                        </div>
                      </td>

                      <td className="px-3 py-3 align-top text-xs text-gray-700">
                        <div>{s.pueblo}</div>
                        {s.provincia && <div>{s.provincia}</div>}
                        {s.comunidad && (
                          <div className="text-gray-500">{s.comunidad}</div>
                        )}
                      </td>

                      <td className="px-3 py-3 align-top text-xs text-gray-700 max-w-[160px]">
                        <div className="truncate" title={s.usuarioEmail}>
                          {s.usuarioEmail}
                        </div>
                        {s.contacto && (
                          <div className="text-gray-500 truncate text-[11px] mt-0.5">
                            {s.contacto}
                          </div>
                        )}
                      </td>

                      <td className="px-3 py-3 align-top text-xs">
                        <div
                          className={`inline-flex items-center px-2 py-1 rounded-full text-[11px] font-semibold ${
                            s.estado === "activo"
                              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                              : s.estado === "pausado"
                              ? "bg-yellow-50 text-yellow-800 border border-yellow-200"
                              : s.estado === "pendiente"
                              ? "bg-orange-50 text-orange-800 border border-orange-200"
                              : "bg-red-50 text-red-700 border border-red-200"
                          }`}
                        >
                          {s.estado || "sin estado"}
                        </div>

                        <div className="mt-2 space-y-1">
                          {destAct ? (
                            <div className="text-[11px] text-emerald-700">
                              ⭐ Destacado hasta{" "}
                              {destHasta?.toLocaleDateString("es-ES")}
                            </div>
                          ) : isDestacado ? (
                            <div className="text-[11px] text-gray-500">
                              ⭐ Destacado caducado
                            </div>
                          ) : null}

                          {s.revisado ? (
                            <div className="text-[11px] text-gray-500">
                              ✅ Revisado
                            </div>
                          ) : (
                            <div className="text-[11px] text-orange-700">
                              ⏳ Sin revisar
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="px-3 py-3 align-top text-xs">
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            onClick={() => handleDestacar(s._id)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold"
                          >
                            Destacar 7 días
                          </button>

                          {s.estado !== "activo" && (
                            <button
                              type="button"
                              onClick={() => handleEstado(s._id, "activo")}
                              className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-semibold"
                            >
                              Marcar activo
                            </button>
                          )}

                          {s.estado !== "pausado" && (
                            <button
                              type="button"
                              onClick={() => handleEstado(s._id, "pausado")}
                              className="px-3 py-1.5 rounded-lg bg-yellow-50 hover:bg-yellow-100 text-yellow-800 border border-yellow-200 text-[11px] font-semibold"
                            >
                              Pausar
                            </button>
                          )}

                          {s.estado !== "pendiente" && (
                            <button
                              type="button"
                              onClick={() => handleEstado(s._id, "pendiente")}
                              className="px-3 py-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-800 border border-orange-200 text-[11px] font-semibold"
                            >
                              Pendiente
                            </button>
                          )}

                          {s.estado !== "eliminado" && (
                            <button
                              type="button"
                              onClick={() => handleEstado(s._id, "eliminado")}
                              className="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-[11px] font-semibold"
                            >
                              Marcar eliminado
                            </button>
                          )}

                          {!s.revisado && (
                            <button
                              type="button"
                              onClick={() => handleRevisar(s._id)}
                              className="px-3 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 text-[11px] font-semibold"
                            >
                              Marcar revisado
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="mt-4 flex justify-center items-center gap-4 text-sm">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className="px-4 py-2 rounded-xl bg-emerald-600 disabled:bg-gray-300 text-white font-semibold"
            >
              Anterior
            </button>

            <span className="font-semibold text-gray-700">
              Página {page} de {totalPages}
            </span>

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="px-4 py-2 rounded-xl bg-emerald-600 disabled:bg-gray-300 text-white font-semibold"
            >
              Siguiente
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanelIsland;
