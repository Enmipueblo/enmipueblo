// src/components/FavoritosIsland.tsx
import React, { useEffect, useState } from 'react';
import ServicioCard from './ServicioCard.tsx';
import { getFavoritos, removeFavorito } from '../lib/api-utils.js';
import { onUserStateChange } from '../lib/firebase.js';

const FavoritosIsland = () => {
  const [usuarioEmail, setUsuarioEmail] = useState<string | null>(null);
  const [favoritos, setFavoritos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onUserStateChange(user => {
      if (!user) {
        window.location.href = '/';
      } else {
        setUsuarioEmail(user.email);
      }
    });
    return () => unsub && unsub();
  }, []);

  const fetchFavoritos = () => {
    if (!usuarioEmail) return;
    setLoading(true);
    getFavoritos(usuarioEmail)
      .then(result => setFavoritos(result || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchFavoritos();
    // eslint-disable-next-line
  }, [usuarioEmail]);

  // Eliminar favorito desde la lista
  const handleQuitarFavorito = async favorito => {
    // Elimina el favorito por su _id (el id de la colección de favoritos)
    await removeFavorito(favorito._id);
    setFavoritos(favoritos => favoritos.filter(f => f._id !== favorito._id));
  };

  if (usuarioEmail === null) {
    return (
      <div className="text-center py-10">
        <p className="text-emerald-700 text-xl font-semibold mb-4">
          Debes iniciar sesión para ver tus favoritos.
        </p>
        <p>Redirigiendo al inicio...</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {loading ? (
        <div className="col-span-3 text-center text-gray-500 py-10">
          Cargando favoritos...
        </div>
      ) : favoritos.length === 0 ? (
        <div className="col-span-3 text-center text-gray-500 py-10">
          No tienes favoritos guardados.
        </div>
      ) : (
        favoritos.map(favorito => (
          <ServicioCard
            key={favorito._id}
            servicio={favorito.servicioId} // ← Aquí tu objeto servicio real
            usuarioEmail={usuarioEmail}
            showFavorito={true}
            isFavorito={true} // ¡Siempre favorito aquí!
            onQuitarFavorito={() => handleQuitarFavorito(favorito)}
          />
        ))
      )}
    </div>
  );
};

export default FavoritosIsland;
