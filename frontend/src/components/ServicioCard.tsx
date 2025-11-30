import React from "react";
import {
  addFavorito,
  removeFavorito,
  getFavoritos,
} from "../lib/api-utils.js";

type ServicioCardProps = {
  servicio: any;
  usuarioEmail?: string | null;
  favoritos?: any[]; // puede ser array de IDs o de objetos favorito
  onFavoritoChange?: () => void;
  showFavorito?: boolean;
};

const ServicioCard: React.FC<ServicioCardProps> = ({
  servicio,
  usuarioEmail,
  favoritos = [],
  onFavoritoChange,
  showFavorito = true,
}) => {
  // ✅ volvemos al patrón /servicio?id=...
  const link = `/servicio?id=${encodeURIComponent(servicio._id)}`;

  // Normalizamos favoritos para aceptar:
  // - ['id1', 'id2']
  // - [{ servicio: 'id1' }, { servicio: { _id: 'id2' } }, ...]
  const favoritoIds = Array.isArray(favoritos)
    ? favoritos
        .map((f) => {
          if (typeof f === "string" || typeof f === "number") return f;
          if (f?.servicio?._id) return f.servicio._id;
          if (f?.servicio) return f.servicio;
          return null;
        })
        .filter(Boolean)
    : [];

  const esFavorito = favoritoIds.some(
    (id) => String(id) === String(servicio._id)
  );

  // Localidad formateada: "Pueblo, Provincia, Comunidad"
  const localidad = [
    servicio.pueblo,
    servicio.provincia,
    servicio.comunidad,
  ]
    .map((v) => (v ? String(v).trim() : ""))
    .filter((v) => v.length > 0)
    .join(", ") || "Localidad sin especificar";

  // Toggle de favorito
  async function toggleFavorito(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (!usuarioEmail) {
      alert("Debes iniciar sesión para guardar favoritos.");
      return;
    }

    try {
      if (esFavorito) {
        // Buscar ID del favorito en backend
        const favs = await getFavoritos(usuarioEmail);
        const favObj = (favs.data || []).find(
          (f: any) =>
            String(f.servicio?._id || f.servicio) ===
            String(servicio._id)
        );
        if (favObj) {
          await removeFavorito(favObj._id);
        }
      } else {
        await addFavorito(usuarioEmail, servicio._id);
      }

      onFavoritoChange && onFavoritoChange();
    } catch (err) {
      console.error("Error toggle favorito:", err);
    }
  }

  return (
    <article
      className="
        relative w-full max-w-sm bg-white rounded-2xl shadow-md 
        border border-emerald-100 overflow-hidden hover:shadow-xl 
        transition-all duration-200
      "
    >
      {/* ❤️ Botón favorito */}
      {showFavorito && (
        <button
          onClick={toggleFavorito}
          className="
            absolute top-3 right-3 z-10
            bg-white/80 backdrop-blur rounded-full p-2 shadow
            hover:bg-white transition
          "
          aria-label="Marcar como favorito"
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill={esFavorito ? "#059669" : "none"}
            stroke={esFavorito ? "#059669" : "#444"}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-.06-.06a5.5 
              5.5 0 0 0-7.78 7.78L12 21.23l7.84-7.84a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
      )}

      {/* Imagen */}
      <a href={link} className="block">
        {servicio.imagenes?.[0] ? (
          <img
            src={servicio.imagenes[0]}
            alt={servicio.nombre}
            className="h-44 w-full object-cover bg-emerald-50"
            loading="lazy"
          />
        ) : (
          <div className="h-44 w-full bg-emerald-50" />
        )}
      </a>

      {/* Texto */}
      <div className="p-4">
        <a href={link}>
          <h3 className="text-lg font-bold text-emerald-800 line-clamp-1">
            {servicio.nombre}
          </h3>

          <p className="text-emerald-600 text-sm">
            {servicio.oficio}
          </p>

          <p className="text-gray-600 text-sm line-clamp-2 mt-1">
            {servicio.descripcion}
          </p>
        </a>

        <div className="mt-3 text-xs text-gray-500">
          {localidad}
        </div>
      </div>
    </article>
  );
};

export default ServicioCard;
