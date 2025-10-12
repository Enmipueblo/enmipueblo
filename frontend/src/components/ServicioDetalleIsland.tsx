import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from 'react';

type Servicio = {
  _id: string;
  nombre?: string;
  oficio?: string;
  descripcion?: string;
  contacto?: string;
  usuarioEmail?: string;
  whatsapp?: string;
  pueblo?: string;
  categoria?: string;
  creado?: string | Date;
  imagenes?: string[];
  videoUrl?: string;
};

type MediaItem = { type: 'img'; src: string } | { type: 'video'; src: string };

const ServicioDetalleIsland: React.FC = () => {
  const [servicio, setServicio] = useState<Servicio | null>(null);
  const [error, setError] = useState<string | null>(null);

  // lee id de ?id= o /servicio/:id
  const servicioId = useMemo(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const q = sp.get('id');
      if (q && q.length > 10) return q;
      const parts = window.location.pathname.split('/').filter(Boolean);
      if (parts.length >= 2 && parts[0] === 'servicio') return parts[1];
      return null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (!servicioId) {
        setServicio(null);
        setError('ID de servicio inválido.');
        return;
      }
      const backendUrl =
        (typeof window !== 'undefined' && (window as any).BACKEND_URL) ||
        import.meta.env.PUBLIC_BACKEND_URL ||
        '';
      try {
        const res = await fetch(`${backendUrl}/api/servicio/${servicioId}`);
        if (!res.ok) {
          if (res.status === 404) throw new Error('Servicio no encontrado.');
          throw new Error('Error al cargar el servicio.');
        }
        const data = (await res.json()) as Servicio;
        setServicio(data);
        setError(null);
      } catch (e: any) {
        setServicio(null);
        setError(e?.message || 'No se pudo cargar el servicio.');
      }
    })();
  }, [servicioId]);

  const fmtFecha = (d?: string | Date) => {
    if (!d) return '';
    try {
      const dt = new Date(d);
      return dt.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return '';
    }
  };

  const telHref = (t?: string) =>
    t ? `tel:${t.replace(/[^0-9+]/g, '')}` : undefined;

  const waHref = (w?: string) =>
    w
      ? `https://wa.me/${w.replace(
          /[^0-9]/g,
          '',
        )}?text=Hola%2C+vi+tu+anuncio+en+EnMiPueblo`
      : undefined;

  const shareUrl = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/servicio/${servicio?._id || ''}`;
  }, [servicio?._id]);

  // ---------------------
  // CARRUSEL (sin thumbs)
  // ---------------------
  const media: MediaItem[] = useMemo(() => {
    const imgs =
      (servicio?.imagenes || [])
        .filter(Boolean)
        .map(src => ({ type: 'img', src } as MediaItem)) || [];
    const video = servicio?.videoUrl
      ? ([{ type: 'video', src: servicio.videoUrl }] as MediaItem[])
      : [];
    // primero fotos, al final el video
    return [...imgs, ...video];
  }, [servicio]);

  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [servicio?._id]);

  const prev = useCallback(() => {
    if (media.length <= 1) return;
    setIndex(i => (i - 1 + media.length) % media.length);
  }, [media.length]);
  const next = useCallback(() => {
    if (media.length <= 1) return;
    setIndex(i => (i + 1) % media.length);
  }, [media.length]);

  // Atajos de teclado en la vista normal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isZoomOpen) return; // cuando está el lightbox, que lo maneje él
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [prev, next]);

  // ---------------------
  // LIGHTBOX + ZOOM
  // ---------------------
  const [isZoomOpen, setZoomOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const openZoom = useCallback(() => {
    setZoomOpen(true);
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const closeZoom = useCallback(() => {
    setZoomOpen(false);
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const onWheel: React.WheelEventHandler<HTMLDivElement> = e => {
    if (media[index]?.type !== 'img') return; // zoom solo en imágenes
    e.preventDefault();
    const delta = -e.deltaY; // hacia arriba = ampliar
    const factor = delta > 0 ? 1.1 : 0.9;
    setScale(s => {
      const nextS = Math.min(3, Math.max(1, s * factor));
      return nextS;
    });
  };

  const onDoubleClick = () => {
    if (media[index]?.type !== 'img') return;
    setScale(s => (s > 1 ? 1 : 2));
    setOffset({ x: 0, y: 0 });
  };

  const onMouseDown: React.MouseEventHandler<HTMLDivElement> = e => {
    if (scale === 1 || media[index]?.type !== 'img') return;
    setDragging(true);
    dragStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
  };
  const onMouseMove: React.MouseEventHandler<HTMLDivElement> = e => {
    if (!isDragging || !dragStart.current) return;
    setOffset({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y,
    });
  };
  const endDrag = () => {
    setDragging(false);
    dragStart.current = null;
  };

  // atajos dentro del lightbox
  useEffect(() => {
    if (!isZoomOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeZoom();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isZoomOpen, closeZoom, prev, next]);

  // ---------------------
  // UI
  // ---------------------
  return (
    <div className="p-4 md:p-8 pt-6 md:pt-10">
      {error ? (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded-lg shadow-md text-center">
          <p className="font-bold">Error:</p>
          <p>{error}</p>
          <a
            href="/buscar"
            className="mt-3 inline-block bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-5 rounded-xl transition duration-300 shadow"
          >
            ← Volver a la búsqueda
          </a>
        </div>
      ) : !servicio ? (
        <div className="text-center text-gray-500 py-10">Cargando…</div>
      ) : (
        <>
          {/* Chips superiores */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 font-semibold rounded-full px-4 py-1 text-xs md:text-sm shadow">
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 20 20"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 7V3m4 4V3m-9 4h14M5 11h10m-9 4h8"
                />
              </svg>
              {servicio.categoria || 'General'}
            </span>
            <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 font-medium rounded-full px-3 py-1 text-xs md:text-sm">
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 20 20"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 8c0-1.105-.895-2-2-2s-2 .895-2 2 .895 2 2 2zm0 4h-4a2 2 0 100 4h4a2 2 0 100-4z"
                />
              </svg>
              {servicio.pueblo || '—'}
            </span>
            <span className="ml-auto text-xs text-gray-400">
              {fmtFecha(servicio.creado)}
            </span>
          </div>

          {/* Título */}
          <h1 className="text-3xl md:text-5xl font-black text-emerald-700 mb-1 tracking-tight leading-tight">
            {servicio.nombre}
          </h1>
          <p className="text-lg md:text-2xl font-semibold text-emerald-600 mb-6 flex items-center gap-2">
            <svg
              className="w-6 h-6 text-emerald-400"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path
                d="M8 7V3m4 4V3m-9 4h14M5 11h10m-9 4h8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {servicio.oficio}
          </p>

          {/* === Carrusel grande (16:9) === */}
          {media.length > 0 && (
            <div className="relative mb-8">
              <div className="w-full rounded-2xl overflow-hidden border border-emerald-100 bg-black/5">
                <div className="w-full" style={{ aspectRatio: '16/9' }}>
                  {media[index].type === 'img' ? (
                    <img
                      src={media[index].src}
                      alt={`media-${index}`}
                      className="w-full h-full object-cover cursor-zoom-in"
                      loading="lazy"
                      onClick={openZoom}
                    />
                  ) : (
                    <video
                      src={media[index].src}
                      controls
                      className="w-full h-full object-contain bg-black"
                      onClick={() => setZoomOpen(true)}
                    />
                  )}
                </div>
              </div>

              {media.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={prev}
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-emerald-700 border border-emerald-200 shadow rounded-full w-10 h-10 flex items-center justify-center"
                    aria-label="Anterior"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={next}
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-emerald-700 border border-emerald-200 shadow rounded-full w-10 h-10 flex items-center justify-center"
                    aria-label="Siguiente"
                  >
                    ›
                  </button>
                </>
              )}
            </div>
          )}

          {/* Descripción */}
          <div className="bg-emerald-50 rounded-xl p-5 md:p-6 mb-6 shadow-inner border border-emerald-100">
            <h2 className="text-xl font-bold text-emerald-700 mb-2 flex items-center gap-2">
              <svg
                className="w-5 h-5 text-emerald-500"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 002 2h6a2 2 0 01-2 2v6a2 2 0 01-2 2z"
                />
              </svg>
              Descripción del servicio
            </h2>
            <p className="text-gray-800 text-base md:text-lg leading-relaxed whitespace-pre-wrap">
              {servicio.descripcion}
            </p>
          </div>

          {/* Contacto + Compartir */}
          <div className="mt-2 grid gap-4 md:gap-8 grid-cols-1 md:grid-cols-2">
            <div className="flex flex-col gap-3 bg-white rounded-xl border border-gray-100 shadow p-5">
              <span className="text-lg font-bold text-emerald-800 mb-1">
                Contacto
              </span>

              {servicio.contacto && (
                <div className="flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-emerald-500"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 16v-4m0-4h.01" />
                  </svg>
                  <span className="font-semibold">Teléfono:</span>
                  <a
                    href={telHref(servicio.contacto)}
                    className="text-emerald-700 underline hover:text-emerald-900 ml-1"
                  >
                    {servicio.contacto}
                  </a>
                </div>
              )}

              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-emerald-500"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16 8a6 6 0 00-12 0v5a6 6 0 0012 0V8z"
                  />
                  <circle cx="12" cy="12" r="10" />
                </svg>
                <span className="font-semibold">Email:</span>
                <span className="text-emerald-700 font-mono break-all">
                  {servicio.usuarioEmail || '-'}
                </span>
              </div>

              {servicio.whatsapp && (
                <a
                  href={waHref(servicio.whatsapp)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-green-100 text-green-800 hover:bg-green-200 transition rounded-xl px-4 py-2 font-bold mt-2 shadow w-max"
                >
                  <svg
                    className="w-6 h-6"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M20.52 3.482A12.053 12.053 0 0 0 12.005 0C5.381 0 .004 5.378.004 12.001c0 2.119.551 4.188 1.595 6.017L.057 23.944l6.08-1.586a11.935 11.935 0 0 0 5.868 1.496h.002c6.624 0 12.002-5.379 12.002-12.003a12.02 12.02 0 0 0-3.489-8.421zM17.492 14.41c-.302-.15-1.779-.883-2.053-.983-.274-.1-.475-.15-.676.15-.2.3-.778.982-.955 1.183-.176.2-.352.226-.655.075-.303-.15-1.283-.472-2.443-1.506-.903-.803-1.513-1.793-1.69-2.096-.176-.302-.019-.466.133-.617.137-.136.303-.352.454-.528.152-.177.201-.303.303-.506.101-.202.051-.379-.025-.532-.076-.152-.679-1.65-.932-2.256-.246-.595-.495-.514-.68-.523l-.581-.01c-.202 0-.53.077-.81.38-.28.302-1.062 1.034-1.062 2.525 0 1.49 1.088 2.927 1.239 3.13.153.202 2.142 3.256 5.194 4.438.726.312 1.294.498 1.738.64.729.232 1.394.199 1.914.122.584-.088 1.778-.733 2.03-1.44.252-.706.252-1.308.176-1.434-.076-.126-.275-.2-.579-.351z" />
                  </svg>
                  WhatsApp
                </a>
              )}
            </div>

            {/* Compartir */}
            <div className="flex flex-col gap-4 justify-between bg-white rounded-xl border border-gray-100 shadow p-5">
              <span className="text-lg font-bold text-emerald-800 mb-1">
                ¿Quieres compartir?
              </span>
              <p className="text-sm text-gray-600">
                Comparte este servicio en tus redes:
              </p>

              <div className="flex gap-4 items-center flex-wrap">
                {/* Facebook */}
                <a
                  href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
                    shareUrl,
                  )}`}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-emerald-50 hover:bg-emerald-100 border border-emerald-200"
                  aria-label="Compartir en Facebook"
                >
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#29916E">
                    <path d="M22 12c0-5.522-4.477-10-10-10S2 6.478 2 12c0 4.991 3.657 9.128 8.438 9.877v-6.987h-2.54v-2.89h2.54V9.845c0-2.506 1.493-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.462h-1.261c-1.243 0-1.631.772-1.631 1.562v1.879h2.773l-.443 2.89h-2.33V21.88C18.343 21.128 22 16.991 22 12z" />
                  </svg>
                </a>

                {/* Instagram */}
                <a
                  href={`https://www.instagram.com/?url=${encodeURIComponent(
                    shareUrl,
                  )}`}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-emerald-50 hover:bg-emerald-100 border border-emerald-200"
                  aria-label="Abrir Instagram"
                >
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#29916E">
                    <path d="M7 2C4.243 2 2 4.243 2 7v10c0 2.757 2.243 5 5 5h10c2.757 0 5-2.243 5-5V7c0-2.757-2.243-5-5-5H7zm10 2a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h10zm-5 3.5A5.5 5.5 0 1 0 17.5 13 5.506 5.506 0 0 0 12 7.5zm0 2A3.5 3.5 0 1 1 8.5 13 3.5 3.5 0 0 1 12 9.5zM18 6.5a1 1 0 1 0 1 1 1 1 0 0 0-1-1z" />
                  </svg>
                </a>

                {/* LinkedIn */}
                <a
                  href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
                    shareUrl,
                  )}`}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-emerald-50 hover:bg-emerald-100 border border-emerald-200"
                  aria-label="Compartir en LinkedIn"
                >
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#29916E">
                    <rect x="2" y="2" width="20" height="20" rx="5" />
                    <path
                      d="M6 9h2v8H6zM7 7.5a1 1 0 110-2 1 1 0 010 2zM10 11h2v1.08c.58-.77 1.48-1.26 2.46-1.08C16.06 11.21 17 12.27 17 14v3h-2v-2.6c0-.81-.52-1.29-1.17-1.29-.61 0-1.13.48-1.13 1.29V17h-2z"
                      fill="#fff"
                    />
                  </svg>
                </a>
              </div>
            </div>
          </div>

          {/* Volver */}
          <div className="flex justify-center mt-8">
            <a
              href="/buscar"
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-3 px-8 rounded-2xl transition duration-300 shadow-md text-lg"
            >
              ← Volver a Buscar Servicios
            </a>
          </div>
        </>
      )}

      {/* LIGHTBOX / ZOOM */}
      {isZoomOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={closeZoom}
          role="dialog"
          aria-label="visor multimedia"
        >
          <div
            className="relative max-w-[92vw] max-h-[88vh] w-full"
            onClick={e => e.stopPropagation()}
            onWheel={onWheel}
            onDoubleClick={onDoubleClick}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={endDrag}
            onMouseLeave={endDrag}
            style={{
              cursor:
                scale > 1 && media[index]?.type === 'img'
                  ? isDragging
                    ? 'grabbing'
                    : 'grab'
                  : 'default',
            }}
          >
            <div className="w-full" style={{ aspectRatio: '16/9' }}>
              {media[index]?.type === 'img' ? (
                <img
                  src={media[index].src}
                  alt={`zoom-${index}`}
                  className="w-full h-full object-contain select-none"
                  draggable={false}
                  style={{
                    transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                    transition: isDragging ? 'none' : 'transform 120ms ease',
                  }}
                />
              ) : (
                <video
                  src={media[index].src}
                  controls
                  autoPlay
                  className="w-full h-full object-contain bg-black"
                />
              )}
            </div>

            {/* Controles */}
            {media.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={prev}
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-emerald-700 border border-emerald-200 shadow rounded-full w-10 h-10 flex items-center justify-center"
                  aria-label="Anterior"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={next}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-emerald-700 border border-emerald-200 shadow rounded-full w-10 h-10 flex items-center justify-center"
                  aria-label="Siguiente"
                >
                  ›
                </button>
              </>
            )}

            <button
              type="button"
              onClick={closeZoom}
              className="absolute top-2 right-2 bg-white/90 hover:bg-white text-emerald-700 border border-emerald-200 shadow rounded-full w-10 h-10 flex items-center justify-center"
              aria-label="Cerrar"
            >
              ✕
            </button>

            {media[index]?.type === 'img' && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-white/80 text-xs px-2 py-1">
                rueda/trackpad: zoom · arrastra: mover · doble click: 1×/2×
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ServicioDetalleIsland;
