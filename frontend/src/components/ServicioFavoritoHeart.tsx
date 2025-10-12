// src/components/ServicioFavoritoHeart.tsx
import React, { useEffect, useState } from 'react';
import { addFavorito, removeFavorito, getFavoritos } from '../lib/api-utils.js';
import { onUserStateChange } from '../lib/firebase.js';

const ServicioFavoritoHeart = ({ servicioId, autorEmail }) => {
  const [usuarioEmail, setUsuarioEmail] = useState(null);
  const [isFavorito, setIsFavorito] = useState(false);
  const [favoritoId, setFavoritoId] = useState(null);

  // Detectar usuario logueado
  useEffect(() => {
    const unsub = onUserStateChange(user => {
      setUsuarioEmail(user?.email ?? null);
    });
    return () => unsub && unsub();
  }, []);

  // Cargar estado favorito solo si no es nuestro propio anuncio
  useEffect(() => {
    if (!usuarioEmail || autorEmail === usuarioEmail) return;
    getFavoritos(usuarioEmail).then(favs => {
      const found = favs.find(f => f.servicioId._id === servicioId);
      setIsFavorito(!!found);
      setFavoritoId(found ? found._id : null);
    });
  }, [usuarioEmail, servicioId, autorEmail]);

  const handleClick = async e => {
    e.preventDefault();
    if (!usuarioEmail) return;
    if (!isFavorito) {
      const res = await addFavorito(usuarioEmail, servicioId);
      if (!res.error) {
        setIsFavorito(true);
        setFavoritoId(res._id);
      }
    } else {
      if (!favoritoId) return;
      const res = await removeFavorito(favoritoId);
      if (!res.error) {
        setIsFavorito(false);
        setFavoritoId(null);
      }
    }
  };

  if (!usuarioEmail || autorEmail === usuarioEmail) return null;

  return (
    <button
      onClick={handleClick}
      aria-label={isFavorito ? 'Quitar de favoritos' : 'Añadir a favoritos'}
      className={
        'absolute top-6 right-6 bg-white/70 rounded-full p-3 shadow transition hover:bg-emerald-100 ' +
        (isFavorito ? 'text-emerald-600' : 'text-gray-400')
      }
      style={{ zIndex: 10 }}
      tabIndex={0}
    >
      {isFavorito ? (
        // Corazón lleno
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="currentColor"
          viewBox="0 0 24 24"
          className="w-8 h-8"
        >
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41 0.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      ) : (
        // Corazón vacío
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
          className="w-8 h-8"
        >
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41 0.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      )}
    </button>
  );
};

export default ServicioFavoritoHeart;
