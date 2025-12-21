// frontend/src/components/DestacadosHomeIsland.tsx
import React, { useCallback, useEffect, useState } from "react";
import { getServicios } from "../lib/api-utils.js";
import ServicioCard from "./ServicioCard.tsx";

const DestacadosHomeIsland: React.FC = () => {
  const [servicios, setServicios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const cargarDestacados = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    cargarDestacados();
  }, [cargarDestacados]);

  useEffect(() => {
    const onFocus = () => cargarDestacados();
    const onVis = () => {
      if (document.visibilityState === "visible") cargarDestacados();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [cargarDestacados]);

  if (loading) {
    return (
      <div className="mt-6 text-sm text-gray-500">
        Cargando servicios destacados…
      </div>
    );
  }

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
          usuarioEmail={null}
          favoritos={[]}
          showFavorito={false}
        />
      ))}
    </div>
  );
};

export default DestacadosHomeIsland;
