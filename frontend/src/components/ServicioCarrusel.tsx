import React, { useEffect, useMemo, useRef, useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination } from "swiper/modules";

import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";

type Props = {
  imagenes?: string[] | string;
  videoUrl?: string;
};

type Slide = { type: "img" | "video"; url: string };

const ServicioCarrusel: React.FC<Props> = ({ imagenes = [], videoUrl = "" }) => {
  const slides: Slide[] = useMemo(() => {
    const fotos = Array.isArray(imagenes)
      ? imagenes.filter(Boolean)
      : [imagenes].filter(Boolean);

    return [
      ...fotos.map((url) => ({ type: "img" as const, url })),
      ...(videoUrl ? [{ type: "video" as const, url: videoUrl }] : []),
    ];
  }, [imagenes, videoUrl]);

  const [modal, setModal] = useState<Slide | null>(null);
  const modalVideoRef = useRef<HTMLVideoElement | null>(null);

  const openModal = (item: Slide) => setModal(item);

  const closeModal = () => {
    if (modal?.type === "video" && modalVideoRef.current) {
      modalVideoRef.current.pause();
      modalVideoRef.current.currentTime = 0;
    }
    setModal(null);
  };

  // Escape + lock scroll cuando modal está abierto
  useEffect(() => {
    if (!modal) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };

    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal?.type, modal?.url]);

  if (!slides.length) {
    return (
      <div className="w-full max-w-2xl mx-auto my-6 h-64 flex items-center justify-center bg-gray-100 rounded-2xl">
        <span className="text-gray-500 text-sm">No hay imágenes ni video</span>
      </div>
    );
  }

  const shouldUseSwiper = slides.length > 1;

  // Reservar tamaño para reducir CLS
  const IMG_W = 1200;
  const IMG_H = 800;

  const renderSlideContent = (slide: Slide, idx: number) => {
    if (slide.type === "img") {
      const isFirst = idx === 0;

      return (
        <div
          className="w-full flex items-center justify-center bg-gray-50 rounded-2xl overflow-hidden"
          style={{ maxHeight: 420, minHeight: 260 }}
        >
          <img
            src={slide.url}
            alt={`Foto servicio ${idx + 1}`}
            className="max-h-[420px] w-auto h-auto object-contain cursor-zoom-in transition-transform duration-200"
            onClick={() => openModal({ type: "img", url: slide.url })}
            draggable={false}
            loading={isFirst ? "eager" : "lazy"}
            decoding="async"
            width={IMG_W}
            height={IMG_H}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 720px, 768px"
            fetchPriority={isFirst ? "high" : "auto"}
            referrerPolicy="no-referrer-when-downgrade"
            crossOrigin="anonymous"
          />
        </div>
      );
    }

    return (
      <div
        className="w-full flex items-center justify-center bg-black rounded-2xl overflow-hidden"
        style={{ maxHeight: 420, minHeight: 260 }}
      >
        <video
          src={slide.url}
          controls
          preload="metadata"
          className="max-h-[420px] w-auto h-auto object-contain cursor-zoom-in bg-black"
          onClick={(e) => {
            e.stopPropagation();
            openModal({ type: "video", url: slide.url });
          }}
        />
      </div>
    );
  };

  return (
    <>
      <div className="w-full max-w-2xl mx-auto my-6">
        {shouldUseSwiper ? (
          <Swiper
            modules={[Navigation, Pagination]}
            navigation
            pagination={{ clickable: true }}
            spaceBetween={16}
            slidesPerView={1}
            className="w-full rounded-2xl shadow-xl bg-white"
          >
            {slides.map((slide, idx) => (
              <SwiperSlide key={`${slide.type}-${idx}`}>
                {renderSlideContent(slide, idx)}
              </SwiperSlide>
            ))}
          </Swiper>
        ) : (
          <div className="w-full rounded-2xl shadow-xl bg-white">
            {renderSlideContent(slides[0], 0)}
          </div>
        )}
      </div>

      {/* Modal grande */}
      {modal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
          onClick={closeModal}
        >
          <div
            className="relative max-w-3xl w-full max-h-[90vh] p-2 bg-white rounded-xl shadow-2xl flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
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
                decoding="async"
                referrerPolicy="no-referrer-when-downgrade"
                crossOrigin="anonymous"
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
