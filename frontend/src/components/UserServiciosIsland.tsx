import React, { useEffect, useState } from "react";
import { getUserServicios, deleteServicio } from "../lib/api-utils.js";
import { onUserStateChange } from "../lib/firebase.js";

const PAGE_SIZE = 12;

const UserServiciosIsland: React.FC = () => {
  const [user, setUser] = useState<any | null | undefined>(undefined);
  const [servicios, setServicios] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);

  // ================================
  // USUARIO
  // ================================
  useEffect(() => {
    const unsub = onUserStateChange((u: any) => setUser(u));
    return () => unsub && unsub();
  }, []);

  // ================================
  // CARGAR SERVICIOS DEL USUARIO
  // ================================
  useEffect(() => {
    if (!user?.email) return;
    cargar(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, page]);

  const cargar = async (pageNum: number) => {
    try {
      setLoading(true);
      const res = await getUserServicios(user.email, pageNum, PAGE_SIZE);
      setServicios(res.data || []);
      setTotalItems(res.totalItems || 0);
    } catch (err) {
      console.error("Error cargando servicios usuario:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Seguro que quieres eliminar este servicio?")) return;
    try {
      await deleteServicio(id);
      await cargar(page);
    } catch (err) {
      console.error("Error al eliminar servicio:", err);
    }
  };

  const handleEditClick = (s: any) => {
    alert(
      "La edición de anuncios estará disponible en una próxima versión.\n\n" +
        "De momento puedes eliminarlo y volver a crearlo con los cambios."
    );
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
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 place-items-center">
        {servicios.map((s) => (
          <div
            key={s._id}
            className="relative w-full max-w-sm bg-white rounded-2xl shadow-md border border-emerald-100 overflow-hidden group"
          >
            {/* ✅ también aquí: /servicio?id=... */}
            <a href={`/servicio?id=${encodeURIComponent(s._id)}`}>
              {s.imagenes?.[0] ? (
                <img
                  src={s.imagenes[0]}
                  alt={s.nombre}
                  className="h-40 w-full object-cover bg-emerald-50"
                />
              ) : (
                <div className="h-40 w-full bg-emerald-50" />
              )}

              <div className="p-4">
                <h3 className="text-lg font-semibold text-emerald-800 line-clamp-1">
                  {s.nombre}
                </h3>
                <p className="text-emerald-600 text-sm">{s.oficio}</p>
                <p className="text-gray-600 text-sm line-clamp-2 mt-1">
                  {s.descripcion}
                </p>
              </div>
            </a>

            {/* BOTONES */}
            <div className="absolute bottom-3 right-3 flex gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition">
              {/* EDITAR (de momento solo aviso) */}
              <button
                type="button"
                onClick={() => handleEditClick(s)}
                className="bg-blue-600 text-white text-xs px-3 py-1 rounded-lg shadow hover:bg-blue-700"
              >
                Editar
              </button>

              {/* ELIMINAR */}
              <button
                onClick={() => handleDelete(s._id)}
                className="bg-red-600 text-white text-xs px-3 py-1 rounded-lg shadow hover:bg-red-700"
              >
                Eliminar
              </button>
            </div>
          </div>
        ))}
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
