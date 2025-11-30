import React from 'react';
import ServicioCarrusel from './ServicioCarrusel';

const redes = [
  {
    id: 'facebook',
    label: 'Facebook',
    icon: (
      <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none">
        <path
          d="M22 12c0-5.522-4.477-10-10-10S2 6.478 2 12c0 4.991 3.657 9.128 8.438 9.877v-6.987h-2.54v-2.89h2.54V9.845c0-2.506 1.493-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.462h-1.261c-1.243 0-1.631.772-1.631 1.562v1.879h2.773l-.443 2.89h-2.33V21.88C18.343 21.128 22 16.991 22 12z"
          fill="#29916E"
        />
      </svg>
    ),
  },
  {
    id: 'x',
    label: 'X',
    icon: (
      <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none">
        <path
          d="M5.5 5.5L18.5 18.5M18.5 5.5L5.5 18.5"
          stroke="#89908F"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    icon: (
      <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none">
        <rect x="2" y="2" width="20" height="20" rx="5" fill="#29916E" />
        <path
          d="M6 9h2v8H6zM7 7.5a1 1 0 110-2 1 1 0 010 2zM10 11h2v1.08c.58-.77 1.48-1.26 2.46-1.08C16.06 11.21 17 12.27 17 14v3h-2v-2.6c0-.81-.52-1.29-1.17-1.29-.61 0-1.13.48-1.13 1.29V17h-2z"
          fill="#fff"
        />
      </svg>
    ),
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    icon: (
      <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none">
        <circle cx="12" cy="12" r="10" fill="#29916E" />
        <path
          d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.472-.148-.67.149-.198.297-.767.967-.94 1.164-.173.198-.347.223-.644.074-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.654-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.173.198-.297.298-.495.099-.198.05-.372-.025-.52-.075-.149-.67-1.611-.916-2.205-.242-.583-.487-.504-.67-.513-.173-.008-.372-.01-.57-.01-.198 0-.52.074-.792.372-.273.297-1.04 1.016-1.04 2.479 0 1.463 1.065 2.876 1.213 3.074.149.198 2.097 3.212 5.086 4.375.711.305 1.263.487 1.695.624.713.228 1.361.196 1.873.119.572-.086 1.758-.719 2.007-1.412.248-.693.248-1.287.173-1.412-.075-.124-.272-.198-.57-.347z"
          fill="#fff"
        />
      </svg>
    ),
  },
];

function getShareUrl(red, servicio) {
  const url = encodeURIComponent(
 `${window.location.origin}/servicio?id=${servicio._id}`,

  );
  const title = encodeURIComponent(
    servicio.oficio
      ? `${servicio.oficio} en ${servicio.pueblo} - EnMiPueblo`
      : 'Servicio en EnMiPueblo',
  );
  switch (red) {
    case 'facebook':
      return `https://www.facebook.com/sharer/sharer.php?u=${url}`;
    case 'x':
      return `https://twitter.com/intent/tweet?url=${url}&text=${title}`;
    case 'linkedin':
      return `https://www.linkedin.com/sharing/share-offsite/?url=${url}`;
    case 'whatsapp':
      return `https://wa.me/?text=${title}%20${url}`;
    default:
      return '#';
  }
}

interface Props {
  servicio: any;
  onClose: () => void;
  onEdit?: () => void;
  esPropio?: boolean;
}
const ServicioModalIsland: React.FC<Props> = ({
  servicio,
  onClose,
  onEdit,
  esPropio = false,
}) => {
  // Campo telefono si existe
  const tieneTelefono =
    !!servicio.contacto && servicio.contacto.match(/[0-9]{7,}/);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div className="bg-white w-full max-w-2xl rounded-2xl p-8 relative shadow-xl animate-in fade-in scale-in">
        <button
          onClick={onClose}
          className="absolute right-6 top-6 text-2xl text-gray-400 hover:text-emerald-600 font-bold"
        >
          ×
        </button>
        <ServicioCarrusel
          imagenes={servicio.imagenes || []}
          videoUrl={servicio.videoUrl}
        />
        <h2 className="text-3xl font-bold text-emerald-700 mb-2">
          {servicio.nombre}
        </h2>
        <p className="text-xl text-gray-700 mb-3">{servicio.oficio}</p>
        <p className="text-gray-800 mb-4">{servicio.descripcion}</p>
        <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-gray-500">
              <strong>Pueblo:</strong> {servicio.pueblo}
            </div>
            <div className="text-sm text-gray-500">
              <strong>Categoría:</strong> {servicio.categoria}
            </div>
            <div className="text-sm text-gray-500">
              <strong>Publicado:</strong>{' '}
              {servicio.creado
                ? new Date(servicio.creado).toLocaleDateString('es-ES', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })
                : ''}
            </div>
          </div>
          <div>
            {tieneTelefono && (
              <div className="text-sm text-gray-500 flex items-center gap-2 mb-2">
                <strong>Teléfono:</strong> {servicio.contacto}
                <a
                  href={`tel:${servicio.contacto.replace(/[^0-9+]/g, '')}`}
                  className="inline-flex items-center ml-2 px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold transition"
                  title="Llamar"
                >
                  <svg
                    className="w-5 h-5 mr-1"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path d="M3 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm14 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zm-7 9a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                  Llamar
                </a>
              </div>
            )}
            {servicio.whatsapp && (
              <a
                href={`https://wa.me/${servicio.whatsapp.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center mt-2 bg-green-50 border border-green-200 px-4 py-2 rounded-xl text-green-700 hover:bg-green-100 transition"
              >
                <svg
                  className="w-5 h-5 mr-2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.72 12.04c-1.24-.22-2.18.62-2.42.85-.46.43-.66.61-1.29.43-.41-.12-1.39-.52-2.36-1.49-.96-.96-1.37-1.95-1.49-2.36-.18-.62.01-.83.44-1.29.23-.24 1.06-1.18.84-2.43-.19-.98-.99-2.08-2.03-2.13C5.35 3.04 3 5.17 3 8.23c0 4.63 4.05 9.45 9.63 9.45 3.04 0 5.18-2.35 5.23-5.27-.06-1.04-1.16-1.84-2.14-2.03z"
                  />
                </svg>
                WhatsApp
              </a>
            )}
          </div>
        </div>
        {esPropio && onEdit && (
          <div className="mt-4 text-right">
            <button
              onClick={onEdit}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded font-bold"
            >
              Editar este servicio
            </button>
          </div>
        )}
        {/* COMPARTIR REDES */}
        <div className="mt-7 pt-4 border-t border-emerald-50 flex flex-col items-center gap-2">
          <span className="text-base text-gray-500 font-semibold mb-1">
            Compartir en redes:
          </span>
          <div className="flex gap-4">
            {redes.map(r => (
              <a
                key={r.id}
                href={
                  typeof window !== 'undefined'
                    ? getShareUrl(r.id, servicio)
                    : '#'
                }
                onClick={e => {
                  e.preventDefault();
                  window.open(
                    getShareUrl(r.id, servicio),
                    '_blank',
                    'noopener,noreferrer',
                  );
                }}
                className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-emerald-50 text-emerald-800 hover:text-emerald-900 transition"
                aria-label={`Compartir en ${r.label}`}
                tabIndex={0}
              >
                {r.icon}
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ServicioModalIsland;
