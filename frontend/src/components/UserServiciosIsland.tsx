import React, { useEffect, useState } from "react";
import { getUserServicios, deleteServicio } from "../lib/api-utils.js";
import { onUserStateChange } from "../lib/firebase.js";

const PAGE_SIZE = 12;

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
};

const UserServiciosIsland: React.FC = () => {
  const [user, setUser] = useState<any | null | undefined>(undefined);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
  const cargar = async (pageNum: number) => {
    if (!user?.email) return;
    try {
      setLoading(true);
      setErrorMsg(null);

      const res = await getUserServicios(user.email, pageNum, PAGE_SIZE);

      // Si el helper devolvió un error, mostramos mensaje
      if ((res as any)?.error) {
        console.error("Error respuesta getUserServicios:", res);
        setServicios([]);
        setTotalItems(0);
        setErrorMsg(
          "No pudimos cargar tus servicios. Vuelve a iniciar sesión e inténtalo de nuevo."
        );
        return;
      }

      setServicios((res as any).data || []);
      setTotalItems((res as any).totalItems || 0);
    } catch (err) {
      console.error("Error cargando servicios usuario:", err);
      setErrorMsg("Error al cargar tus servicios.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.email) return;
    cargar(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, page]);

  // ================================
  // ACCIONES
  // ================================
  const handleDelete = async (id: string) => {
    if (!confirm("¿Seguro que quieres eliminar este servicio?")) return;
    try {
      await deleteServicio(id);
      await cargar(page);
    } catch (err) {
      console.error("Error al eliminar servicio:", err);
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
    const text = `${servicio.nombre} - ${
      servicio.oficio || "Servicio en tu pueblo"
    } en EnMiPueblo`;

    try {
      if (typeof navigator !== "undefined" && (navigator as any).share) {
        await (navigator as any).share({
          title: servicio.nombre,
          text,
          url,
        });
        return;
      }

      // Fallback: compartir en X (antes Twitter) en escritorio
      if (typeof window !== "undefined") {
        const shareUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(
          url
        )}&text=${encodeURIComponent(text)}`;
        window.open(shareUrl, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      console.warn("Usuario canceló compartir o error en share:", err);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  // ================================
  // RENDER
  // ================================
  if (user === undefined) {
    return (
      <div className="text-center py-16 text-gray-500 animate-pulse">
        Cargando…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-16 text-emerald-700">
        Debes iniciar sesión para ver tus anuncios.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-16 text-gray-500">
        Cargando tus servicios…
      </div>
    );
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 place-items-stretch">
        {servicios.map((s) => {
          const locationParts = [
            s.pueblo || "",
            s.provincia || "",
            s.comunidad || "",
          ]
            .filter(Boolean)
            .join(", ");

          const fecha = formatFecha(s.creadoEn);

          return (
            <article
              key={s._id}
              className="relative w-full bg-white rounded-2xl shadow-md border border-emerald-100 overflow-hidden group flex flex-col"
            >
              {/* enlace al detalle */}
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

              <div className="p-4 flex-1 flex flex-col">
                <a href={`/servicio?id=${encodeURIComponent(s._id)}`}>
                  <h3 className="text-lg font-semibold text-emerald-800 line-clamp-1">
                    {s.nombre}
                  </h3>
                  {s.oficio && (
                    <p className="text-emerald-600 text-sm">{s.oficio}</p>
                  )}
                  {locationParts && (
                    <p className="mt-1 text-xs text-gray-500 line-clamp-1">
                      {locationParts}
                    </p>
                  )}
                  <p className="text-gray-600 text-sm line-clamp-2 mt-2">
                    {s.descripcion}
                  </p>
                </a>
              </div>

              {/* Pie con fecha + compartir */}
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

              {/* BOTONES EDITAR/ELIMINAR flotantes */}
              <div className="absolute bottom-3 right-3 flex gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition">
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

      {/* PAGINACIÓN */}
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
