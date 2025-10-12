import React from 'react';

const ServicioCard = ({
  servicio,
  usuarioEmail,
  showFavorito,
  favoritos,
  onFavoritoChange,
}: any) => {
  const link = `/servicio/?id=${encodeURIComponent(servicio._id)}`;

  return (
    <article className="w-full max-w-sm bg-white rounded-2xl shadow border border-emerald-100 overflow-hidden">
      <a href={link} className="block">
        {servicio.imagenes?.[0] ? (
          <img
            src={servicio.imagenes[0]}
            alt={servicio.nombre}
            className="h-40 w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="h-40 w-full bg-emerald-50" />
        )}
      </a>
      <div className="p-4">
        <a href={link} className="block">
          <h3 className="text-lg font-bold text-emerald-800 line-clamp-1">
            {servicio.nombre}
          </h3>
          <p className="text-emerald-600 text-sm">{servicio.oficio}</p>
          <p className="text-gray-600 text-sm line-clamp-2 mt-1">
            {servicio.descripcion}
          </p>
        </a>
        <div className="mt-3 text-xs text-gray-500">
          {servicio.pueblo || '—'}
        </div>
      </div>
    </article>
  );
};

export default ServicioCard;
