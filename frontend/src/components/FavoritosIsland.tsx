import React, { useEffect, useState } from "react";
import { getFavoritos } from "../lib/api-utils.js";
import { onUserStateChange } from "../lib/firebase.js";
import ServicioCard from "../components/ServicioCard.tsx";

const FavoritosIsland: React.FC = () => {
  const [user, setUser] = useState<any>(undefined);
  const [favoritos, setFavoritos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ===========================
  // 1. Cargar usuario
  // ===========================
  useEffect(() => {
    const unsub = onUserStateChange((u) => setUser(u));
    return () => unsub?.();
  }, []);

  // ===========================
  // 2. Cargar favoritos
  // ===========================
  useEffect(() => {
    if (!user?.email) return;

    (async () => {
      setLoading(true);
      const res = await getFavoritos(user.email);
      setFavoritos(res.data || []);  // <-- CORREGIDO
      setLoading(false);
    })();
  }, [user]);

  const recargarFavoritos = async () => {
    if (!user?.email) return;
    const res = await getFavoritos(user.email);
    setFavoritos(res.data || []);  // <-- CORREGIDO
  };

  // ===========================
  // 3. Estados UI
  // ===========================
  if (user === undefined) {
    return (
      <div className="text-center py-12 text-emerald-700">
        Cargando sesión…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-12 text-emerald-700">
        Debes iniciar sesión para ver tus favoritos.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-16 text-gray-500">
        Cargando favoritos…
      </div>
    );
  }

  if (!favoritos.length) {
    return (
      <div className="text-center py-16 text-gray-500">
        Aún no tienes servicios en favoritos.
        <br />
        <span className="text-emerald-700">
          Toca el corazón en un anuncio para guardarlo aquí.
        </span>
      </div>
    );
  }

  // ===========================
  // 4. Render final
  // ===========================
  return (
    <div>
      <h2 className="text-2xl font-bold text-emerald-800 mb-4">
        Tus favoritos
      </h2>

      <p className="text-sm text-gray-500 mb-6">
        Estos son los anuncios que marcaste con el corazón.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        {favoritos.map((f) => (
          <ServicioCard
            key={f._id}
            servicio={f.servicio}            // <-- SIEMPRE OBJETO POPULADO
            usuarioEmail={user.email}
            favoritos={favoritos.map(x => x.servicio._id)}  // <-- IDs
            onFavoritoChange={recargarFavoritos}
          />
        ))}
      </div>
    </div>
  );
};

export default FavoritosIsland;
