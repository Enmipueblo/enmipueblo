// frontend/src/components/AdminPanelServiciosIsland.tsx
import React, { useEffect, useMemo, useState } from "react";
import { adminListServicios, adminPatchServicio, isAdminUser, onUserStateChange } from "../lib/api-utils.js";

type Servicio = {
  _id?: string;
  id?: string;
  titulo?: string;
  nombre?: string;
  descripcion?: string;
  categoria?: string;
  estado?: string; // pendiente | aprobado | rechazado
  destacado?: boolean;
  destacadoHome?: boolean;
};

function cx(...p: Array<string | false | null | undefined>) {
  return p.filter(Boolean).join(" ");
}

export default function AdminPanelServiciosIsland() {
  const [user, setUser] = useState<any>(null);
  const [admin, setAdmin] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<string>("");

  useEffect(() => {
    const off = onUserStateChange(async (u) => {
      setUser(u);
      if (!u) {
        setAdmin(false);
        setLoading(false);
        return;
      }
      const ok = await isAdminUser(u);
      setAdmin(ok);
      setLoading(false);
    });
    return () => off && off();
  }, []);

  const load = async () => {
    setError("");
    setLoading(true);
    try {
      const res: any = await adminListServicios({
        q: q.trim() || undefined,
        estado: estado || undefined,
      });

      // backend típico: { ok, data } o { servicios }
      const data =
        Array.isArray(res?.data) ? res.data :
        Array.isArray(res?.servicios) ? res.servicios :
        Array.isArray(res) ? res :
        [];

      setServicios(data);
    } catch (e: any) {
      setError(e?.message || "Error cargando servicios");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && admin) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, admin]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return servicios.filter((s) => {
      const text = `${s.titulo || s.nombre || ""} ${s.descripcion || ""} ${s.categoria || ""}`.toLowerCase();
      if (qq && !text.includes(qq)) return false;
      if (estado && (s.estado || "") !== estado) return false;
      return true;
    });
  }, [servicios, q, estado]);

  const card = "rounded-3xl border shadow-[0_18px_50px_-46px_rgba(0,0,0,0.45)]";
  const cardStyle: React.CSSProperties = { borderColor: "var(--sb-border)", background: "var(--sb-card2)" };

  const btnBase =
    "inline-flex items-center justify-center rounded-2xl px-4 py-2.5 font-extrabold transition active:opacity-95 focus:outline-none focus:ring-2 focus:ring-[rgba(196,91,52,0.25)]";
  const btnPrimary = cx(btnBase, "bg-[var(--sb-accent)] text-white border border-[color:var(--sb-border)]");
  const btnGhost = cx(btnBase, "bg-white/60 text-[var(--sb-ink)] border border-[color:var(--sb-border)] hover:bg-white");

  const badge = (kind: "ok" | "warn" | "muted", text: string) => {
    const base = "inline-flex items-center rounded-xl border px-2.5 py-1 text-xs font-extrabold";
    if (kind === "ok") return <span className={cx(base, "bg-emerald-50 text-emerald-900 border-emerald-200")}>{text}</span>;
    if (kind === "warn") return <span className={cx(base, "bg-amber-50 text-amber-900 border-amber-200")}>{text}</span>;
    return <span className={cx(base, "bg-white/60 text-[var(--sb-ink2)]")} style={{ borderColor: "var(--sb-border)" }}>{text}</span>;
  };

  const patch = async (id: string, next: any) => {
    setError("");
    try {
      await adminPatchServicio(id, next);
      await load();
    } catch (e: any) {
      setError(e?.message || "No se pudo actualizar");
    }
  };

  if (loading) {
    return <div className="text-sm font-semibold" style={{ color: "var(--sb-muted)" }}>Cargando…</div>;
  }

  if (!user) {
    return (
      <div className={card} style={cardStyle}>
        <div className="p-6 sm:p-8">
          <div className="text-xl font-extrabold" style={{ color: "var(--sb-ink)" }}>Admin</div>
          <p className="mt-2" style={{ color: "var(--sb-ink2)" }}>Tenés que iniciar sesión.</p>
        </div>
      </div>
    );
  }

  if (!admin) {
    return (
      <div className={card} style={cardStyle}>
        <div className="p-6 sm:p-8">
          <div className="text-xl font-extrabold" style={{ color: "var(--sb-ink)" }}>Acceso denegado</div>
          <p className="mt-2" style={{ color: "var(--sb-ink2)" }}>Tu usuario no tiene permisos de administrador.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className={card} style={cardStyle}>
        <div className="p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xs font-extrabold tracking-widest uppercase" style={{ color: "var(--sb-muted)" }}>Gestión</div>
              <div className="mt-2 text-2xl sm:text-3xl font-extrabold" style={{ color: "var(--sb-ink)" }}>Servicios</div>
              <div className="mt-1" style={{ color: "var(--sb-ink2)" }}>Moderá, destacá y aprobá anuncios.</div>
            </div>
            <button className={btnPrimary} onClick={load} type="button">Recargar</button>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border bg-white/60 p-4 text-sm font-semibold" style={{ borderColor: "var(--sb-border)", color: "var(--sb-ink2)" }}>
              {error}
            </div>
          ) : null}

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div>
              <div className="text-xs font-extrabold tracking-widest uppercase" style={{ color: "var(--sb-muted)" }}>Buscar</div>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Título, descripción, categoría…"
                className="mt-2 w-full rounded-2xl border bg-white/65 px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-[rgba(196,91,52,0.20)]"
                style={{ borderColor: "var(--sb-border)", color: "var(--sb-ink)" }}
              />
            </div>

            <div>
              <div className="text-xs font-extrabold tracking-widest uppercase" style={{ color: "var(--sb-muted)" }}>Estado</div>
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
                className="mt-2 w-full rounded-2xl border bg-white/65 px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-[rgba(196,91,52,0.20)]"
                style={{ borderColor: "var(--sb-border)", color: "var(--sb-ink)" }}
              >
                <option value="">Todos</option>
                <option value="pendiente">Pendiente</option>
                <option value="aprobado">Aprobado</option>
                <option value="rechazado">Rechazado</option>
              </select>
            </div>

            <div className="flex items-end gap-2">
              <button className={btnGhost} onClick={() => { setQ(""); setEstado(""); }} type="button">Limpiar</button>
              <button className={btnPrimary} onClick={load} type="button">Aplicar</button>
            </div>
          </div>
        </div>
      </div>

      <div className={card} style={cardStyle}>
        <div className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead>
                <tr className="text-xs uppercase tracking-widest" style={{ color: "var(--sb-muted)" }}>
                  <th className="px-5 py-4">Servicio</th>
                  <th className="px-5 py-4">Estado</th>
                  <th className="px-5 py-4">Destacado</th>
                  <th className="px-5 py-4">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const id = String(s._id || s.id || "");
                  const st = String(s.estado || "pendiente");

                  return (
                    <tr key={id} className="border-t" style={{ borderColor: "var(--sb-border)" }}>
                      <td className="px-5 py-4">
                        <div className="font-extrabold" style={{ color: "var(--sb-ink)" }}>
                          {s.titulo || s.nombre || "Sin título"}
                        </div>
                        <div className="mt-1 text-sm" style={{ color: "var(--sb-ink2)" }}>
                          {(s.categoria ? `${s.categoria} • ` : "")}{(s.descripcion || "").slice(0, 120)}{(s.descripcion || "").length > 120 ? "…" : ""}
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        {st === "aprobado" ? badge("ok", "Aprobado") : st === "rechazado" ? badge("muted", "Rechazado") : badge("warn", "Pendiente")}
                      </td>

                      <td className="px-5 py-4">
                        {(s.destacado || s.destacadoHome) ? badge("ok", "Sí") : badge("muted", "No")}
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            className={btnGhost}
                            type="button"
                            onClick={() => patch(id, { destacadoHome: !(s.destacadoHome || false) })}
                          >
                            {s.destacadoHome ? "Quitar destacado" : "Hacer destacado"}
                          </button>

                          <button className={btnGhost} type="button" onClick={() => patch(id, { estado: "aprobado" })}>
                            Aprobar
                          </button>
                          <button className={btnGhost} type="button" onClick={() => patch(id, { estado: "rechazado" })}>
                            Rechazar
                          </button>
                          <button className={btnGhost} type="button" onClick={() => patch(id, { estado: "pendiente" })}>
                            Pendiente
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filtered.length === 0 ? (
                  <tr>
                    <td className="px-5 py-8 text-sm font-semibold" style={{ color: "var(--sb-ink2)" }} colSpan={4}>
                      No hay resultados.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}