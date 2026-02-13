import React, { useEffect, useRef, useState } from "react";
import { deleteServicio } from "../lib/api-utils.js";
import { onUserStateChange } from "../lib/firebase.js";

const PAGE_SIZE = 12;
const TOKEN_KEY = "enmi_google_id_token_v1";

type Servicio = {
  _id: string;
  nombre: string;
  oficio?: string;
  descripcion?: string;
  categoria?: string;
  pueblo?: string;
  provincia?: string;
  comunidad?: string;
  imagenes?: string[];
  creadoEn?: string | Date;

  destacado?: boolean;
  destacadoHome?: boolean;
  destacadoHasta?: string | Date | null;

  estado?: string;
  revisado?: boolean;
};

function getToken(): string {
  try {
    if (typeof window === "undefined") return "";
    return String(window.localStorage.getItem(TOKEN_KEY) || "");
  } catch {
    return "";
  }
}

function isFeaturedActive(s: Servicio): boolean {
  const anyFlag = !!(s.destacado || s.destacadoHome);
  if (!anyFlag) return false;
  if (!s.destacadoHasta) return false;
  const d = new Date(s.destacadoHasta as any);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() > Date.now();
}

function formatUntil(s: Servicio): string {
  if (!s.destacadoHasta) return "";
  const d = new Date(s.destacadoHasta as any);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

async function fetchMisServicios(page: number, limit: number) {
  const token = getToken();
  if (!token) throw new Error("NO_TOKEN");

  const url = new URL("/api/servicios/mios", window.location.origin);
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(limit));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json;
}

const UserServiciosIsland: React.FC = () => {
  const [user, setUser] = useState<any | null | undefined>(undefined);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadReqRef = useRef<number>(0);

  useEffect(() => {
    const unsub = onUserStateChange((u: any) => setUser(u));
    return () => unsub && unsub();
  }, []);

  const formatFecha = (value?: string | Date) => {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const cargar = async (pageNum: number) => {
    const reqId = ++loadReqRef.current;

    try {
      setLoading(true);
      setErrorMsg(null);

      const res = await fetchMisServicios(pageNum, PAGE_SIZE);
      if (reqId !== loadReqRef.current) return;

      setServicios(res?.data || []);
      setTotalItems(res?.totalItems || 0);
    } catch (err: any) {
      if (reqId !== loadReqRef.current) return;

      if (String(err?.message || "") === "NO_TOKEN") {
        setErrorMsg("Inicia sesión para ver tus servicios.");
      } else {
        console.error("Error cargando mis servicios:", err);
        setErrorMsg("Error al cargar tus servicios.");
      }
    } finally {
      if (reqId === loadReqRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    cargar(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, page]);

  const handleDelete = async (id: string) => {
    if (!confirm("¿Seguro que quieres eliminar este servicio?")) return;

    const prevServicios = servicios;
    const prevTotal = totalItems;

    setServicios((prev) => prev.filter((s) => s._id !== id));
    setTotalItems((t) => Math.max(0, t - 1));

    try {
      await deleteServicio(id);
      // recargar por seguridad
      await cargar(page);
    } catch (err) {
      console.error("Error al eliminar servicio:", err);
      setServicios(prevServicios);
      setTotalItems(prevTotal);
      alert("No se pudo eliminar el servicio. Inténtalo de nuevo.");
    }
  };

  const handleEditClick = (id: string) => {
    window.location.href = `/editar-servicio?id=${encodeURIComponent(id)}`;
  };

  const toggleFeatured = async (servicio: Servicio) => {
    const token = getToken();
    if (!token) {
      (window as any).showAuthModal && (window as any).showAuthModal();
      return;
    }

    const currently = isFeaturedActive(servicio);
    const nextEnabled = !currently;

    setTogglingId(servicio._id);

    try {
      const res = await fetch(`/api/featured/servicio/${encodeURIComponent(servicio._id)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled: nextEnabled }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(json?.error || "No se pudo cambiar el destacado.");
        return;
      }

      // refrescar
      await cargar(page);
    } catch (e) {
      console.error("toggleFeatured exception:", e);
      alert("Error de red al cambiar destacado.");
    } finally {
      setTogglingId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  if (user === undefined) {
    return <div className="text-center py-16 text-gray-500 animate-pulse">Cargando…</div>;
  }

  if (!user) {
    return (
      <div className="text-center py-16 text-emerald-700">
        Debes iniciar sesión para ver tus anuncios.
      </div>
    );
  }

  if (loading) {
    return <div className="text-center py-16 text-gray-500">Cargando tus servicios…</div>;
  }

  if (errorMsg) {
    return (
      <div className="text-center py-16 text-red-600">
        {errorMsg}
        <br />
        <button
          onClick={() => cargar(page)}
          className="mt-4 inline-block bg-emerald-600 text-white px-5 py-2 rounded-xl shadow hover:bg-emerald-700"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!servicios.length) {
    return (
      <div className="text-center py-16 text-gray-500">
        Aún no publicaste ningún servicio.
        <br />
        <a
          href="/ofrecer"
          className="inline-block mt-5 bg-emerald-600 text-white px-5 py-2 rounded-xl shadow hover:bg-emerald-700"
        >
          Publicar mi primer servicio
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => cargar(page)}
          className="text-xs px-3 py-1.5 rounded-xl border border-emerald-200 bg-white hover:bg-emerald-50 text-emerald-800 font-semibold"
        >
          Actualizar
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 place-items-stretch">
        {servicios.map((s) => {
          const locationParts = [s.pueblo || "", s.provincia || "", s.comunidad || ""]
            .filter(Boolean)
            .join(", ");

          const fecha = formatFecha(s.creadoEn);

          const featured = isFeaturedActive(s);
          const until = featured ? formatUntil(s) : "";

          return (
            <article
              key={s._id}
              className="relative w-full bg-white rounded-2xl shadow-md border border-emerald-100 overflow-hidden group flex flex-col"
            >
              <a href={`/servicio?id=${encodeURIComponent(s._id)}`}>
                {s.imagenes?.[0] ? (
                  <img
                    src={s.imagenes[0]}
                    alt={s.nombre}
                    className="h-40 w-full object-cover bg-emerald-50"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-40 w-full bg-gradient-to-br from-emerald-50 to-emerald-100 flex items-center justify-center text-emerald-700 text-sm font-semibold">
                    Sin foto
                  </div>
                )}
              </a>

              {featured && (
                <div className="absolute top-3 left-3 rounded-full bg-yellow-100 text-yellow-900 border border-yellow-200 px-3 py-1 text-[11px] font-extrabold shadow">
                  ⭐ Destacado {until ? `hasta ${until}` : ""}
                </div>
              )}

              <div className="p-4 flex-1 flex flex-col">
                <a href={`/servicio?id=${encodeURIComponent(s._id)}`}>
                  <h3 className="text-lg font-semibold text-emerald-800 line-clamp-1">{s.nombre}</h3>
                  {s.oficio && <p className="text-emerald-600 text-sm">{s.oficio}</p>}
                  {locationParts && <p className="mt-1 text-xs text-gray-500 line-clamp-1">{locationParts}</p>}
                  <p className="text-gray-600 text-sm line-clamp-2 mt-2">{s.descripcion}</p>
                </a>
              </div>

              <div className="px-4 pb-3 pt-1 border-t border-emerald-50 flex items-center justify-between text-[11px] text-gray-500">
                <span>{fecha && <>Publicado el {fecha}</>}</span>
              </div>

              <div className="absolute bottom-3 right-3 flex gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition">
                <button
                  type="button"
                  onClick={() => toggleFeatured(s)}
                  disabled={togglingId === s._id}
                  className={`text-white text-xs px-3 py-1 rounded-lg shadow ${
                    featured ? "bg-yellow-600 hover:bg-yellow-700" : "bg-slate-900 hover:bg-slate-800"
                  } ${togglingId === s._id ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  {togglingId === s._id ? "..." : featured ? "Quitar ⭐" : "Destacar ⭐"}
                </button>

                <button
                  type="button"
                  onClick={() => handleEditClick(s._id)}
                  className="bg-blue-600 text-white text-xs px-3 py-1 rounded-lg shadow hover:bg-blue-700"
                >
                  Editar
                </button>

                <button
                  onClick={() => handleDelete(s._id)}
                  className="bg-red-600 text-white text-xs px-3 py-1 rounded-lg shadow hover:bg-red-700"
                >
                  Eliminar
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex justify-center items-center gap-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 bg-emerald-600 disabled:bg-gray-300 text-white rounded-xl"
          >
            Anterior
          </button>

          <span className="font-semibold">
            Página {page} de {totalPages}
          </span>

          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-4 py-2 bg-emerald-600 disabled:bg-gray-300 text-white rounded-xl"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
};

export default UserServiciosIsland;
