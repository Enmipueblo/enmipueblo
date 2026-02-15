import React, { useEffect, useState } from "react";
import { getFavoritos } from "../lib/api-utils.js";
import { onUserStateChange } from "../lib/firebase.js";
import ServicioCard from "../components/ServicioCard.tsx";

type FavoritoItem = {
  _id: string;
  servicio: any | null;
};

const FavoritosIsland: React.FC = () => {
  const [user, setUser] = useState<any>(undefined);
  const [favoritos, setFavoritos] = useState<FavoritoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
  const fetchFavoritos = async (email?: string | null) => {
    if (!email) return;
    try {
      setLoading(true);
      setErrorMsg(null);

      const res: any = await getFavoritos(email);

      if (res?.error) {
        console.error("Error en getFavoritos:", res);
        setFavoritos([]);
        setErrorMsg(
          "No pudimos cargar tus favoritos. Vuelve a iniciar sesión e inténtalo de nuevo."
        );
        return;
      }

      const data: FavoritoItem[] = res.data || [];
      setFavoritos(data);
    } catch (err) {
      console.error("Error cargando favoritos:", err);
      setErrorMsg("Error al cargar tus favoritos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.email) return;
    fetchFavoritos(user.email);
  }, [user]);

  const recargarFavoritos = async () => {
    if (!user?.email) return;
    await fetchFavoritos(user.email);
  };

  // Filtrar favoritos huérfanos (servicio borrado)
  const favoritosValidos = favoritos.filter(
    (f) => f.servicio && f.servicio._id
  );

  const favoritosIds = favoritosValidos.map((x) => x.servicio._id);

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

  if (errorMsg) {
    return (
      <div className="text-center py-16 text-red-600">
        {errorMsg}
        <br />
        <button
          onClick={() => recargarFavoritos()}
          className="mt-4 inline-block bg-emerald-600 text-white px-5 py-2 rounded-xl shadow hover:bg-emerald-700"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!favoritosValidos.length) {
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
      <h2 className="text-2xl font-bold text-emerald-800 mb-2">
        Tus favoritos
      </h2>

      <p className="text-sm text-gray-500 mb-6">
        Estos son los anuncios que marcaste con el corazón.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        {favoritosValidos.map((f) => (
          <ServicioCard
            key={f._id}
            servicio={f.servicio}
            usuarioEmail={user.email}
            favoritos={favoritosIds}
            onFavoritoChange={recargarFavoritos}
          />
        ))}
      </div>
    </div>
  );
};

export default FavoritosIsland;
