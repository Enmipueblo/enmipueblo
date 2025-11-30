import React, { useState, useRef } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";

type Props = {
  imagenes?: string[] | string;
  videoUrl?: string;
};

const ServicioCarrusel: React.FC<Props> = ({ imagenes = [], videoUrl = "" }) => {
  // Normalizamos el array de fotos
  const fotos = Array.isArray(imagenes)
    ? imagenes.filter(Boolean)
    : [imagenes].filter(Boolean);

  // Slides: todas las fotos, luego el video (si hay)
  const slides: { type: "img" | "video"; url: string }[] = [
    ...fotos.map((url) => ({ type: "img" as const, url })),
    ...(videoUrl ? [{ type: "video" as const, url: videoUrl }] : []),
  ];

  const [modal, setModal] = useState<{ type: "img" | "video"; url: string } | null>(
    null
  );

  // Vídeo dentro del modal para poder pausarlo al cerrar
  const modalVideoRef = useRef<HTMLVideoElement | null>(null);

  const openModal = (item: { type: "img" | "video"; url: string }) => {
    setModal(item);
  };

  const closeModal = () => {
    // Si hay video en el modal, lo pausamos y reseteamos
    if (modal?.type === "video" && modalVideoRef.current) {
      modalVideoRef.current.pause();
      modalVideoRef.current.currentTime = 0;
    }
    setModal(null);
  };

  if (!slides.length) {
    return (
      <div className="w-full max-w-2xl mx-auto my-6 h-64 flex items-center justify-center bg-gray-100 rounded-2xl">
        <span className="text-gray-500 text-sm">No hay imágenes ni video</span>
      </div>
    );
  }

  return (
    <>
      {/* Carrusel principal */}
      <div className="w-full max-w-2xl mx-auto my-6">
        <Swiper
          modules={[Navigation, Pagination]}
          navigation
          pagination={{ clickable: true }}
          spaceBetween={16}
          slidesPerView={1}
          className="w-full rounded-2xl shadow-xl bg-white"
        >
          {slides.map((slide, idx) => (
            <SwiperSlide key={idx}>
              {slide.type === "img" ? (
                <div
                  className="w-full flex items-center justify-center bg-gray-50 rounded-2xl overflow-hidden"
                  style={{ maxHeight: 420, minHeight: 260 }}
                >
                  <img
                    src={slide.url}
                    alt={`Foto servicio ${idx + 1}`}
                    loading="lazy"
                    className="max-h-[420px] w-auto h-auto object-contain cursor-zoom-in transition-transform duration-200"
                    onClick={() => openModal({ type: "img", url: slide.url })}
                    draggable={false}
                  />
                </div>
              ) : (
                <div
                  className="w-full flex items-center justify-center bg-black rounded-2xl overflow-hidden"
                  style={{ maxHeight: 420, minHeight: 260 }}
                >
                  <video
                    src={slide.url}
                    controls
                    className="max-h-[420px] w-auto h-auto object-contain cursor-zoom-in bg-black"
                    onClick={(e) => {
                      // evitamos propagación rara
                      e.stopPropagation();
                      openModal({ type: "video", url: slide.url });
                    }}
                  />
                </div>
              )}
            </SwiperSlide>
          ))}
        </Swiper>
      </div>

      {/* Modal grande para ampliar (foto o video) */}
      {modal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
          onClick={closeModal}
        >
          <div
            className="relative max-w-3xl w-full max-h-[90vh] p-2 bg-white rounded-xl shadow-2xl flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Botón cerrar siempre por encima de todo */}
            <button
              type="button"
              className="z-20 absolute top-2 right-2 text-gray-700 text-2xl bg-white/90 border border-gray-300 rounded-full w-10 h-10 flex items-center justify-center hover:bg-red-100 hover:text-red-700 transition"
              onClick={(e) => {
                e.stopPropagation();
                closeModal();
              }}
              aria-label="Cerrar"
            >
              ×
            </button>

            {modal.type === "img" ? (
              <img
                src={modal.url}
                alt="Foto ampliada"
                className="object-contain max-w-full max-h-[85vh] rounded-xl"
                draggable={false}
              />
            ) : (
              <video
                ref={modalVideoRef}
                src={modal.url}
                controls
                autoPlay
                className="object-contain max-w-full max-h-[85vh] rounded-xl bg-black"
              />
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default ServicioCarrusel;
