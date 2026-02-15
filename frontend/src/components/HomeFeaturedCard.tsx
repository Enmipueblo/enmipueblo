import React from "react";

type Props = {
  servicio: any;
  priority?: boolean;
};

export default function HomeFeaturedCard({ servicio, priority = false }: Props) {
  const id = servicio?._id;
  const img = Array.isArray(servicio?.imagenes) ? servicio.imagenes[0] : null;
  const nombre = servicio?.profesionalNombre || servicio?.nombre || "Servicio";
  const oficio = servicio?.oficio || servicio?.categoria || "";
  const pueblo = servicio?.pueblo || servicio?.localidad || "";

  return (
    <a
      href={id ? `/servicio?id=${encodeURIComponent(id)}` : "/buscar"}
      className="group overflow-hidden rounded-2xl border bg-white/70 shadow-sm transition hover:-translate-y-[2px] hover:shadow-md"
      style={{ borderColor: "var(--sb-border)" }}
    >
      <div className="aspect-[16/10] w-full overflow-hidden bg-stone-200/40">
        {img ? (
          <img
            src={img}
            alt={nombre}
            className="h-full w-full object-cover object-center transition duration-300 group-hover:scale-[1.03]"
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="h-full w-full" />
        )}
      </div>

      <div className="p-4">
        <div className="text-base font-extrabold leading-snug" style={{ color: "var(--sb-ink)" }}>
          {nombre}
        </div>

        <div className="mt-1 flex items-center gap-2 text-sm" style={{ color: "var(--sb-ink2)" }}>
          <span className="inline-flex items-center gap-1">
            <span aria-hidden>📍</span>
            <span className="line-clamp-1">{pueblo || "Tu zona"}</span>
          </span>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="text-sm font-semibold" style={{ color: "var(--sb-ink2)" }}>
            {oficio}
          </div>

          <span
            className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-extrabold"
            style={{ background: "rgba(22,163,74,0.10)", color: "var(--sb-ink)" }}
          >
            <span aria-hidden>⭐</span>
            Destacado
          </span>
        </div>

        <div
          className="mt-3 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-extrabold"
          style={{ background: "rgba(12,148,136,0.10)", color: "var(--sb-ink)" }}
        >
          <span aria-hidden>📞</span>
          Contactar
        </div>
      </div>
    </a>
  );
}
