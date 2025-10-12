import React, { useState } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';

const ServicioCarrusel = ({ imagenes = [], videoUrl = '' }) => {
  // Aseguramos array limpio
  let fotos = Array.isArray(imagenes) ? imagenes : [imagenes].filter(Boolean);

  // Slides: todas las fotos, luego el video (si hay)
  const slides = [
    ...fotos.map(url => ({ type: 'img', url })),
    ...(videoUrl ? [{ type: 'video', url: videoUrl }] : []),
  ];

  const [modal, setModal] = useState(null);

  if (!slides.length) {
    return (
      <div className="w-full h-64 flex items-center justify-center bg-gray-200 rounded-xl">
        <span className="text-gray-500">No hay imágenes ni video</span>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto mb-8">
      <Swiper
        modules={[Navigation, Pagination]}
        navigation
        pagination={{ clickable: true }}
        spaceBetween={16}
        slidesPerView={1}
        className="w-full h-80 md:h-96 rounded-xl shadow-xl bg-white"
        style={{ minHeight: 320, maxHeight: 480 }}
      >
        {slides.map((slide, idx) => (
          <SwiperSlide key={idx}>
            {slide.type === 'img' ? (
              <div className="w-full h-80 md:h-96 flex items-center justify-center bg-gray-50 rounded-xl overflow-hidden">
                <img
                  src={slide.url}
                  alt={`Foto servicio ${idx + 1}`}
                  className="object-contain w-full h-full cursor-zoom-in transition-transform duration-200"
                  onClick={() => setModal({ type: 'img', url: slide.url })}
                  draggable={false}
                />
              </div>
            ) : (
              <div className="w-full h-80 md:h-96 flex items-center justify-center bg-black rounded-xl overflow-hidden">
                <video
                  src={slide.url}
                  controls
                  className="object-contain w-full h-full cursor-zoom-in"
                  onClick={e => {
                    e.stopPropagation();
                    setModal({ type: 'video', url: slide.url });
                  }}
                />
              </div>
            )}
          </SwiperSlide>
        ))}
      </Swiper>
      {/* Modal grande para ampliar */}
      {modal && (
        <div
          className="fixed z-50 inset-0 bg-black/80 flex items-center justify-center"
          onClick={() => setModal(null)}
        >
          <div className="max-w-3xl w-full max-h-[90vh] p-2 bg-white rounded-xl shadow-2xl flex items-center justify-center relative">
            <button
              className="absolute top-2 right-2 text-gray-600 text-2xl bg-gray-100 rounded-full w-10 h-10 flex items-center justify-center hover:bg-red-200 transition"
              onClick={e => {
                e.stopPropagation();
                setModal(null);
              }}
              aria-label="Cerrar"
            >
              ×
            </button>
            {modal.type === 'img' ? (
              <img
                src={modal.url}
                alt="Foto ampliada"
                className="object-contain max-w-full max-h-[85vh] rounded-xl"
                draggable={false}
              />
            ) : (
              <video
                src={modal.url}
                controls
                autoPlay
                className="object-contain max-w-full max-h-[85vh] rounded-xl bg-black"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ServicioCarrusel;
