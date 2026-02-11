import React, { useEffect, useMemo, useState } from "react";

const TOKEN_KEY = "enmi_google_id_token_v1";

type Servicio = {
  _id: string;
  nombre?: string;
  oficio?: string;
  contacto?: string;
  usuarioEmail?: string;
  estado?: string;
  revisado?: boolean;
  destacado?: boolean;
  destacadoHome?: boolean;
  destacadoHasta?: string | Date | null;
  pueblo?: string;
  provincia?: string;
  comunidad?: string;
  creadoEn?: string | Date;
};

function getToken() {
  try {
    return String(localStorage.getItem(TOKEN_KEY) || "");
  } catch {
    return "";
  }
}

function isActiveFeatured(s: Servicio) {
  const any = !!(s.destacado || s.destacadoHome);
  if (!any) return false;
  if (!s.destacadoHasta) return false;
  const d = new Date(s.destacadoHasta as any);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() > Date.now();
}

export default function AdminPanelServiciosIsland() {
  const [token, setToken] = useState<string>("");
  const [checking, setChecking] = useState(true);
  const [isAdm, setIsAdm] = useState(false);

  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("");
  const [revisado, setRevisado] = useState<"" | "true" | "false">("");

  const [page, setPage] = useState(1);
  const [data, setData] = useState<Servicio[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setToken(getToken());
  }, []);

  async function checkAdmin(t: string) {
    setChecking(true);
    setErr(null);

    if (!t) {
      setIsAdm(false);
      setChecking(false);
      return;
    }

    try {
      const res = await fetch("/api/admin2/me", {
        headers: { Authorization: `Bearer ${t}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setIsAdm(false);
        setErr(json?.error || "No se pudo validar admin.");
        return;
      }
      setIsAdm(!!json?.isAdmin);
      if (!json?.isAdmin) setErr("Sin permisos de administrador.");
    } catch (e) {
      console.error(e);
      setIsAdm(false);
      setErr("Error de red validando admin.");
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    checkAdmin(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const listUrl = useMemo(() => {
    const u = new URL("/api/admin2/servicios", window.location.origin);
    u.searchParams.set("page", String(page));
    u.searchParams.set("limit", "60");
    if (q.trim()) u.searchParams.set("q", q.trim());
    if (estado) u.searchParams.set("estado", estado);
    if (revisado) u.searchParams.set("revisado", revisado);
    return u.toString();
  }, [page, q, estado, revisado]);

  async function load() {
    if (!token) return;
    setLoading(true);
    setErr(null);

    try {
      const res = await fetch(listUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(json?.error || "Error cargando servicios.");
        setData([]);
        return;
      }
      setData(json?.data || []);
      setTotalPages(Math.max(1, Number(json?.totalPages || 1)));
    } catch (e) {
      console.error(e);
      setErr("Error de red cargando servicios.");
      setData([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token || !isAdm) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isAdm, listUrl]);

  async function patchServicio(id: string, patch: any) {
    const res = await fetch(`/api/admin2/servicios/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(patch),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
    return json?.data as Servicio;
  }

  async function toggle(id: string, field: "revisado" | "destacado" | "destacadoHome") {
    const s = data.find((x) => x._id === id);
    if (!s) return;
    const next = !(s as any)[field];
    try {
      const updated = await patchServicio(id, { [field]: next });
      setData((prev) => prev.map((x) => (x._id === id ? { ...x, ...updated } : x)));
    } catch (e: any) {
      alert(e?.message || "No se pudo actualizar");
    }
  }

  // 👇 OJO: renombrada para no chocar con setEstado (useState)
  async function setEstadoServicio(id: string, nextEstado: string) {
    try {
      const updated = await patchServicio(id, { estado: nextEstado });
      setData((prev) => prev.map((x) => (x._id === id ? { ...x, ...updated } : x)));
    } catch (e: any) {
      alert(e?.message || "No se pudo actualizar estado");
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      <div className="rounded-3xl border border-slate-200 bg-white shadow-xl p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">Panel Admin</h1>
            <p className="text-sm text-slate-600">
              Activa, revisa y destaca servicios (búsqueda y portada).
            </p>
          </div>

          {!token ? (
            <button
              className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
              onClick={() => (window as any).showAuthModal && (window as any).showAuthModal()}
            >
              Iniciar sesión
            </button>
          ) : (
            <button
              className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50"
              onClick={() => load()}
              disabled={loading}
            >
              {loading ? "Actualizando..." : "Actualizar"}
            </button>
          )}
        </div>

        {checking && <div className="mt-6 text-sm text-slate-600">Validando permisos…</div>}

        {!checking && token && !isAdm && (
          <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
            {err || "Sin permisos de administrador."}
          </div>
        )}

        {!checking && !token && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-800">
            Inicia sesión para acceder al panel.
          </div>
        )}

        {!checking && token && isAdm && (
          <>
            <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-3">
              <input
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm"
                placeholder="Buscar (nombre, email, pueblo...)"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
              />

              <select
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm"
                value={estado}
                onChange={(e) => {
                  setEstado(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Estado: todos</option>
                <option value="activo">activo</option>
                <option value="inactivo">inactivo</option>
              </select>

              <select
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm"
                value={revisado}
                onChange={(e) => {
                  setRevisado(e.target.value as any);
                  setPage(1);
                }}
              >
                <option value="">Revisado: todos</option>
                <option value="true">solo revisados</option>
                <option value="false">solo NO revisados</option>
              </select>

              <div className="flex items-center justify-end gap-2">
                <button
                  className="rounded-2xl border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50"
                  onClick={() => {
                    setQ("");
                    setEstado("");
                    setRevisado("");
                    setPage(1);
                  }}
                >
                  Limpiar
                </button>
              </div>
            </div>

            {err && <div className="mt-6 text-sm text-red-600">{err}</div>}

            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-600">
                    <th className="py-2 pr-3">Servicio</th>
                    <th className="py-2 pr-3">Dueño</th>
                    <th className="py-2 pr-3">Estado</th>
                    <th className="py-2 pr-3">Revisado</th>
                    <th className="py-2 pr-3">Destacar</th>
                    <th className="py-2 pr-3">Portada</th>
                    <th className="py-2 pr-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((s) => {
                    const owner = String(s.usuarioEmail || s.contacto || "");
                    const feat = isActiveFeatured(s);

                    return (
                      <tr key={s._id} className="border-t border-slate-100">
                        <td className="py-3 pr-3">
                          <div className="font-semibold text-slate-900">{s.nombre || "(sin nombre)"}</div>
                          <div className="text-xs text-slate-500">
                            {(s.pueblo || "")}
                            {s.provincia ? `, ${s.provincia}` : ""}
                            {s.comunidad ? `, ${s.comunidad}` : ""}
                          </div>
                          {feat && (
                            <div className="mt-1 inline-flex items-center rounded-full bg-yellow-100 px-3 py-1 text-[11px] font-extrabold text-yellow-900 border border-yellow-200">
                              ⭐ destacado activo
                            </div>
                          )}
                        </td>

                        <td className="py-3 pr-3 text-slate-700">{owner || "-"}</td>

                        <td className="py-3 pr-3">
                          <span className="rounded-full border border-slate-200 px-3 py-1 text-xs">
                            {s.estado || "-"}
                          </span>
                        </td>

                        <td className="py-3 pr-3">
                          <button
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              s.revisado ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-800"
                            }`}
                            onClick={() => toggle(s._id, "revisado")}
                          >
                            {s.revisado ? "Sí" : "No"}
                          </button>
                        </td>

                        <td className="py-3 pr-3">
                          <button
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              s.destacado ? "bg-yellow-600 text-white" : "bg-slate-200 text-slate-800"
                            }`}
                            onClick={() => toggle(s._id, "destacado")}
                          >
                            {s.destacado ? "Sí ⭐" : "No"}
                          </button>
                        </td>

                        <td className="py-3 pr-3">
                          <button
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              s.destacadoHome ? "bg-fuchsia-600 text-white" : "bg-slate-200 text-slate-800"
                            }`}
                            onClick={() => toggle(s._id, "destacadoHome")}
                          >
                            {s.destacadoHome ? "Sí 🏠" : "No"}
                          </button>
                        </td>

                        <td className="py-3 pr-3">
                          <div className="flex gap-2">
                            <button
                              className="rounded-full bg-emerald-600 text-white px-3 py-1 text-xs font-semibold hover:bg-emerald-700"
                              onClick={() => setEstadoServicio(s._id, "activo")}
                            >
                              Activar
                            </button>
                            <button
                              className="rounded-full bg-slate-800 text-white px-3 py-1 text-xs font-semibold hover:bg-slate-900"
                              onClick={() => setEstadoServicio(s._id, "inactivo")}
                            >
                              Desactivar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {!loading && !data.length && (
                <div className="py-10 text-center text-slate-600">No hay resultados.</div>
              )}
            </div>

            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-3">
                <button
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </button>

                <span className="text-sm font-semibold">
                  Página {page} / {totalPages}
                </span>

                <button
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Siguiente
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
