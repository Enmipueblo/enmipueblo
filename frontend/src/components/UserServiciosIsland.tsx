import React, { useEffect, useRef, useState } from "react";
import { getUserServicios, deleteServicio } from "../lib/api-utils.js";
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

  // ✅ para destacados (pueden venir o no)
  destacado?: boolean;
  destacadoHome?: boolean;
  destacadoHasta?: string | Date | null;
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

const UserServiciosIsland: React.FC = () => {
  const [user, setUser] = useState<any | null | undefined>(undefined);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [togglingId, setTogglingId] = useState<string | null>(null);

  const lastLoadTsRef = useRef<number>(0);
  const loadReqRef = useRef<number>(0);

  // ================================
  // USUARIO
  // ================================
  useEffect(() => {
    const unsub = onUserStateChange((u: any) => setUser(u));
    return () => unsub && unsub();
  }, []);

  // ================================
  // HELPERS
  // ================================
  const buildServiceUrl = (id: string) => {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/servicio?id=${encodeURIComponent(id)}`;
    }
    return `/servicio?id=${encodeURIComponent(id)}`;
  };

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

  // ================================
  // CARGAR SERVICIOS DEL USUARIO
  // ================================
  const cargar = async (pageNum: number, opts?: { force?: boolean }) => {
    if (!user?.email) return;

    const force = !!opts?.force;
    const now = Date.now();
    const TTL = 60 * 1000;

    if (!force && lastLoadTsRef.current && now - lastLoadTsRef.current < TTL) {
      return;
    }

    const reqId = ++loadReqRef.current;

    try {
      setLoading(true);
      setErrorMsg(null);

      const res = await getUserServicios(user.email, pageNum, PAGE_SIZE);

      if (reqId !== loadReqRef.current) return;

      if ((res as any)?.error) {
        console.error("Error respuesta getUserServicios:", res);
        setServicios([]);
        setTotalItems(0);
        setErrorMsg("No pudimos cargar tus servicios. Vuelve a iniciar sesión e inténtalo de nuevo.");
        return;
      }

      setServicios((res as any).data || []);
      setTotalItems((res as any).totalItems || 0);
      lastLoadTsRef.current = Date.now();
    } catch (err) {
      console.error("Error cargando servicios usuario:", err);
      if (reqId !== loadReqRef.current) return;
      setErrorMsg("Error al cargar tus servicios.");
    } finally {
      if (reqId === loadReqRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.email) return;
    cargar(page, { force: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, page]);

  useEffect(() => {
    if (!user?.email) return;

    const onFocus = () => cargar(page, { force: true });
    const onVis = () => {
      if (document.visibilityState === "visible") cargar(page, { force: true });
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, page]);

  // ================================
  // ACCIONES
  // ================================
  const handleDelete = async (id: string) => {
    if (!confirm("¿Seguro que quieres eliminar este servicio?")) return;

    const prevServicios = servicios;
    const prevTotal = totalItems;

    setServicios((prev) => prev.filter((s) => s._id !== id));
    setTotalItems((t) => Math.max(0, t - 1));

    try {
      await deleteServicio(id);

      const nextTotal = Math.max(0, prevTotal - 1);
      const totalPages = Math.max(1, Math.ceil(nextTotal / PAGE_SIZE));
      if (page > totalPages) setPage(totalPages);
    } catch (err) {
      console.error("Error al eliminar servicio:", err);
      setServicios(prevServicios);
      setTotalItems(prevTotal);
      alert("No se pudo eliminar el servicio. Inténtalo de nuevo.");
    }
  };

  const handleEditClick = (id: string) => {
    if (typeof window !== "undefined") {
      window.location.href = `/editar-servicio?id=${encodeURIComponent(id)}`;
    }
  };

  const handleShare = async (servicio: Servicio) => {
    const url = buildServiceUrl(servicio._id);
    const text = `${servicio.nombre} - ${servicio.oficio || "Servicio en tu pueblo"} en EnMiPueblo`;

    try {
      if (typeof navigator !== "undefined" && (navigator as any).share) {
        await (navigator as any).share({ title: servicio.nombre, text, url });
        return;
      }

      if (typeof window !== "undefined") {
        const shareUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(
          text
        )}`;
        window.open(shareUrl, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      console.warn("Usuario canceló compartir o error en share:", err);
    }
  };

  const toggleFeatured = async (servicio: Servicio) => {
    const token = getToken();
    if (!token) {
      alert("Primero inicia sesión (botón 'Iniciar sesión').");
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
        // 402 -> no PRO
        if (res.status === 402) {
          alert("Para destacar necesitas PRO activo. (Luego lo conectamos con Stripe)");
          return;
        }
        console.error("toggleFeatured error:", res.status, json);
        alert(json?.error || "No se pudo cambiar el destacado.");
        return;
      }

      const updated = json?.data;
      if (updated?._id) {
        setServicios((prev) => prev.map((x) => (x._id === updated._id ? { ...(x as any), ...(updated as any) } : x)));
      } else {
        // fallback: recargar
        await cargar(page, { force: true });
      }
    } catch (e) {
      console.error("toggleFeatured exception:", e);
      alert("Error de red al cambiar destacado.");
    } finally {
      setTogglingId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  // ================================
  // RENDER
  // ================================
  if (user === undefined) {
    return <div className="text-center py-16 text-gray-500 animate-pulse">Cargando…</div>;
  }

  if (!user) {
    return <div className="text-center py-16 text-emerald-700">Debes iniciar sesión para ver tus anuncios.</div>;
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
          onClick={() => cargar(page, { force: true })}
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
          onClick={() => cargar(page, { force: true })}
          className="text-xs px-3 py-1.5 rounded-xl border border-emerald-200 bg-white hover:bg-emerald-50 text-emerald-800 font-semibold"
        >
          Actualizar
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 place-items-stretch">
        {servicios.map((s) => {
          const locationParts = [s.pueblo || "", s.provincia || "", s.comunidad || ""].filter(Boolean).join(", ");
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
                <button
                  type="button"
                  onClick={() => handleShare(s)}
                  className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900 font-semibold"
                >
                  <span className="text-xs">↗</span>
                  <span>Compartir</span>
                </button>
              </div>

              <div className="absolute bottom-3 right-3 flex gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition">
                <button
                  type="button"
                  onClick={() => toggleFeatured(s)}
                  disabled={togglingId === s._id}
                  className={`text-white text-xs px-3 py-1 rounded-lg shadow ${
                    featured ? "bg-yellow-600 hover:bg-yellow-700" : "bg-slate-900 hover:bg-slate-800"
                  } ${togglingId === s._id ? "opacity-60 cursor-not-allowed" : ""}`}
                  title={featured ? "Quitar destacado" : "Destacar (aparece arriba)"}
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
