import React from "react";
import { addFavorito, removeFavorito } from "../lib/api-utils.js";

type Props = {
  servicio: any;
  usuarioEmail?: string | null;
  favoritos?: any[];
  showFavorito?: boolean;
  onFavoritoChange?: () => void | Promise<void>;
};

const ServicioCard: React.FC<Props> = ({
  servicio,
  usuarioEmail,
  favoritos = [],
  showFavorito = true,
  onFavoritoChange,
}) => {
  if (!servicio) return null;

  const link = `/servicio?id=${encodeURIComponent(servicio._id)}`;

  const esFavorito = !!favoritos.find((f: any) => {
    const id = f?.servicio?._id || f?.servicio || f?._id || f;
    return String(id) === String(servicio._id);
  });

  const handleFavClick = async (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>
  ) => {
    e.preventDefault();
    e.stopPropagation();

    if (!usuarioEmail) {
      alert("Debes iniciar sesión para usar favoritos.");
      return;
    }

    try {
      if (esFavorito) {
        await removeFavorito(usuarioEmail, servicio._id);
      } else {
        await addFavorito(usuarioEmail, servicio._id);
      }
      if (onFavoritoChange) await onFavoritoChange();
    } catch (err) {
      console.error("Error al actualizar favorito:", err);
    }
  };

  // ✅ Mostrar insignia también cuando está en PORTADA
  const esDestacado = !!servicio.destacado || !!servicio.destacadoHome;

  const IMG_W = 800;
  const IMG_H = 450;

  return (
    <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-md border border-emerald-100 overflow-hidden group">
      {esDestacado && (
        <div className="absolute top-3 left-3 z-10 px-2 py-1 rounded-full bg-amber-400 text-emerald-900 text-[11px] font-bold shadow">
          DESTACADO
        </div>
      )}

      {showFavorito && (
        <button
          type="button"
          onClick={handleFavClick}
          className={`absolute top-3 right-3 z-10 transition-colors ${
            esFavorito
              ? "text-emerald-600"
              : "text-gray-300 hover:text-emerald-500"
          }`}
          aria-label={esFavorito ? "Quitar de favoritos" : "Añadir a favoritos"}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            className="w-6 h-6"
            fill={esFavorito ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        </button>
      )}

      <a href={link} className="block">
        {servicio.imagenes?.[0] ? (
          <img
            src={servicio.imagenes[0]}
            alt={servicio.nombre || "Servicio"}
            className="h-48 w-full object-cover bg-emerald-50"
            loading="lazy"
            decoding="async"
            width={IMG_W}
            height={IMG_H}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 320px"
            fetchPriority={esDestacado ? "high" : "auto"}
            referrerPolicy="no-referrer-when-downgrade"
            crossOrigin="anonymous"
            draggable={false}
          />
        ) : (
          <div className="h-48 w-full bg-emerald-50" />
        )}

        <div className="p-4">
          <h3 className="text-lg font-semibold text-emerald-800 line-clamp-1">
            {servicio.nombre}
          </h3>

          {servicio.oficio && (
            <p className="text-emerald-600 text-sm line-clamp-1">
              {servicio.oficio}
            </p>
          )}

          {servicio.descripcion && (
            <p className="text-gray-600 text-sm line-clamp-2 mt-1">
              {servicio.descripcion}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
            {servicio.pueblo && (
              <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
                {servicio.pueblo}
              </span>
            )}
            {servicio.provincia && (
              <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
                {servicio.provincia}
              </span>
            )}
          </div>
        </div>
      </a>
    </div>
  );
};

export default ServicioCard;
