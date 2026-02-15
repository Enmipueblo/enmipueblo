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

  const handleFavClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (!usuarioEmail) {
      alert("Debes iniciar sesión para usar favoritos.");
      return;
    }

    try {
      if (esFavorito) await removeFavorito(usuarioEmail, servicio._id);
      else await addFavorito(usuarioEmail, servicio._id);
      if (onFavoritoChange) await onFavoritoChange();
    } catch (err) {
      console.error("Error al actualizar favorito:", err);
    }
  };

  const esDestacado = !!servicio.destacado || !!servicio.destacadoHome;

  return (
    <div
      className="relative w-full max-w-sm rounded-3xl shadow-[0_12px_30px_-18px_rgba(15,23,42,0.25)] border overflow-hidden"
      style={{ background: "rgba(255,255,255,0.82)", borderColor: "var(--sb-border)", backdropFilter: "blur(10px)" }}
    >
      {esDestacado && (
        <div className="absolute top-3 left-3 z-10 px-2.5 py-1 rounded-full bg-violet-100 text-violet-800 text-[11px] font-extrabold border border-violet-200 shadow-sm">
          DESTACADO
        </div>
      )}

      {showFavorito && (
        <button
          type="button"
          onClick={handleFavClick}
          className="absolute top-3 right-3 z-10 transition-colors"
          style={{ color: esFavorito ? "var(--sb-accent)" : "rgba(148,163,184,0.8)" }}
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
            className="h-48 w-full object-cover"
            style={{ background: "rgba(90,208,230,0.10)" }}
            loading="lazy"
            decoding="async"
            width={800}
            height={450}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 320px"
            referrerPolicy="no-referrer-when-downgrade"
            crossOrigin="anonymous"
            draggable={false}
          />
        ) : (
          <div className="h-48 w-full" style={{ background: "rgba(90,208,230,0.10)" }} />
        )}

        <div className="p-4">
          <h3 className="text-lg font-extrabold line-clamp-1" style={{ color: "var(--sb-ink)" }}>
            {servicio.nombre}
          </h3>

          {servicio.profesionalNombre && (
            <p className="text-sm font-medium line-clamp-1" style={{ color: "var(--sb-ink2)" }}>
              Por {servicio.profesionalNombre}
            </p>
          )}

          {servicio.oficio && (
            <p className="text-sm font-semibold line-clamp-1" style={{ color: "var(--sb-blue)" }}>
              {servicio.oficio}
            </p>
          )}

          {servicio.descripcion && (
            <p className="text-sm line-clamp-2 mt-1" style={{ color: "var(--sb-ink2)" }}>
              {servicio.descripcion}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {servicio.pueblo && (
              <span
                className="px-2 py-1 rounded-full border"
                style={{
                  background: "rgba(185,247,215,0.22)",
                  borderColor: "rgba(185,247,215,0.45)",
                  color: "var(--sb-ink)",
                }}
              >
                {servicio.pueblo}
              </span>
            )}
            {servicio.provincia && (
              <span
                className="px-2 py-1 rounded-full border"
                style={{
                  background: "rgba(90,208,230,0.14)",
                  borderColor: "rgba(90,208,230,0.30)",
                  color: "var(--sb-ink)",
                }}
              >
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
