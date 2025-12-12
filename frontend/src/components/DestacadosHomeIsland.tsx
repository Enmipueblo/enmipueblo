// frontend/src/components/DestacadosHomeIsland.tsx
import React, { useEffect, useState } from "react";
import { getServicios } from "../lib/api-utils.js";
import ServicioCard from "./ServicioCard.tsx";
import { onUserStateChange } from "../lib/firebase.js";

const DestacadosHomeIsland: React.FC = () => {
  const [user, setUser] = useState<any | null>(null);
  const [servicios, setServicios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Cargar usuario (solo para saber el email, por si en el futuro usamos favoritos aquí)
  useEffect(() => {
    const unsub = onUserStateChange((u) => setUser(u));
    return () => unsub?.();
  }, []);

  // Cargar SOLO los que están marcados como destacados en portada
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await getServicios({
          destacadoHome: true,
          limit: 9,
          page: 1,
        });
        setServicios(res.data || []);
      } catch (err) {
        console.error("Error cargando destacados home:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="mt-6 text-sm text-gray-500">
        Cargando servicios destacados…
      </div>
    );
  }

  // Si no hay ninguno destacado en portada, no mostramos ningún listado “por defecto”
  if (!servicios.length) {
    return (
      <p className="mt-6 text-sm text-gray-500">
        Todavía no hay servicios destacados en portada.
      </p>
    );
  }

  return (
    <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {servicios.map((s) => (
        <ServicioCard
          key={s._id}
          servicio={s}
          usuarioEmail={user?.email || null}
          favoritos={[]}        // en la home no necesitamos estado de favoritos
          showFavorito={false}  // ocultamos el corazón para que se vea más limpio
        />
      ))}
    </div>
  );
};

export default DestacadosHomeIsland;
