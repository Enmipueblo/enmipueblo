// src/components/ServicioDetalleIsland.tsx
import React, { useEffect, useState } from "react";
import {
  getServicio,
  getServicioRelacionados,
  addFavorito,
  removeFavorito,
  getFavoritos,
} from "../lib/api-utils.js";
import { onUserStateChange } from "../lib/firebase.js";
import ServicioCarrusel from "./ServicioCarrusel.tsx";
import ServicioCard from "./ServicioCard.tsx";

const SITE = (import.meta.env.PUBLIC_SITE_URL as string) || "https://enmipueblo.com";

const ServicioDetalleIsland = ({ id: initialId }: any) => {
  const [id, setId] = useState<string | null>(initialId || null);

  const [servicio, setServicio] = useState<any | null>(null);
  const [loadingServicio, setLoadingServicio] = useState<boolean>(true);

  const [user, setUser] = useState<any | null>(null);
  const [favoritos, setFavoritos] = useState<any[]>([]);

  const [relacionados, setRelacionados] = useState<any[]>([]);
  const [loadingRelacionados, setLoadingRelacionados] = useState(false);
  const [relacionadosLoaded, setRelacionadosLoaded] = useState(false);
  const [relacionadosError, setRelacionadosError] = useState("");

  useEffect(() => {
    if (initialId) return;

    try {
      const url = new URL(window.location.href);
      const queryId = url.searchParams.get("id");
      if (queryId) {
        setId(queryId);
        return;
      }

      const segments = url.pathname.split("/").filter(Boolean);
      const last = segments[segments.length - 1];
      if (last && last !== "servicio") setId(last);
    } catch (err) {
      console.error("Error obteniendo id desde la URL:", err);
    }
  }, [initialId]);

  useEffect(() => {
    const unsub = onUserStateChange((u: any) => setUser(u));
    return () => unsub?.();
  }, []);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      if (!id) {
        setLoadingServicio(true);
        setServicio(null);
        return;
      }

      setLoadingServicio(true);
      try {
        const res = await getServicio(id);
        const svc = (res as any)?.data ?? res;
        if (!svc || (svc as any).error || !(svc as any)._id) {
          if (!cancelado) setServicio(null);
        } else {
          if (!cancelado) setServicio(svc);
        }
      } catch (err) {
        console.error("Error cargando servicio:", err);
        if (!cancelado) setServicio(null);
      } finally {
        if (!cancelado) setLoadingServicio(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [id]);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      if (!id) {
        setRelacionados([]);
        setRelacionadosLoaded(false);
        setRelacionadosError("");
        return;
      }

      try {
        setLoadingRelacionados(true);
        setRelacionadosLoaded(false);
        setRelacionadosError("");

        const json: any = await getServicioRelacionados(id);
        const lista = Array.isArray(json) ? json : json?.data || [];

        if (!cancelado) setRelacionados(lista);
      } catch (err: any) {
        console.error("Error cargando relacionados:", err);
        if (!cancelado) {
          setRelacionados([]);
          setRelacionadosError("No se pudieron cargar los relacionados.");
        }
      } finally {
        if (!cancelado) {
          setLoadingRelacionados(false);
          setRelacionadosLoaded(true);
        }
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [id]);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      if (!user?.email) {
        setFavoritos([]);
        return;
      }

      try {
        const favs = await getFavoritos(user.email);
        if (!cancelado) setFavoritos((favs as any)?.data || []);
      } catch {
        if (!cancelado) setFavoritos([]);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [user]);

  if (!id || loadingServicio) {
    return (
      <div className="py-20 text-center text-lg animate-pulse" style={{ color: "var(--sb-ink2)" }}>
        Cargando servicio…
      </div>
    );
  }

  if (!servicio) {
    return (
      <div className="py-20 text-center" style={{ color: "var(--sb-ink2)" }}>
        Servicio no encontrado.
      </div>
    );
  }

  const fav = favoritos.find((f: any) => {
    const idFav = f?.servicio?._id || f?.servicio || f?._id || f;
    return String(idFav) === String(servicio._id);
  });

  async function toggleFavorito() {
    if (!user) {
      alert("Debes iniciar sesión");
      return;
    }

    try {
      if (fav) {
        await removeFavorito(user.email, servicio._id);
      } else {
        await addFavorito(user.email, servicio._id);
      }
      const favs = await getFavoritos(user.email);
      setFavoritos((favs as any)?.data || []);
    } catch (err) {
      console.error("Error al actualizar favorito:", err);
    }
  }

  const contactoRaw = (servicio.contacto || "").trim();
  const emailContacto =
    servicio.email || (contactoRaw.includes("@") ? contactoRaw : "") || "";
  const telefonoContacto =
    servicio.telefono ||
    (!contactoRaw.includes("@") && contactoRaw ? contactoRaw : "") ||
    "";
  const whatsapp = servicio.whatsapp || "";

  const currentUrl = typeof window !== "undefined" ? window.location.href : "";

  const handleShareWhatsApp = () => {
    const text = `${servicio.nombre} - Visto en EnMiPueblo\n${currentUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  const handleShareFacebook = () => {
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(currentUrl)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
      alert("Enlace copiado al portapapeles");
    } catch {
      alert("No se pudo copiar el enlace");
    }
  };

  const canonical =
    currentUrl || `${SITE}/servicio?id=${encodeURIComponent(String(servicio._id))}`;

  const jsonLdService: any = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: servicio.nombre,
    serviceType: servicio.oficio || servicio.categoria || "Servicio",
    description: (servicio.descripcion || "").slice(0, 500),
    areaServed: [servicio.pueblo, servicio.provincia, servicio.comunidad]
      .filter(Boolean)
      .join(", "),
    provider: {
      "@type": "Organization",
      name: "EnMiPueblo",
      url: SITE,
    },
    url: canonical,
  };

  if (Array.isArray(servicio.imagenes) && servicio.imagenes.length) {
    jsonLdService.image = servicio.imagenes.slice(0, 5);
  }

  const cardStyle = {
    background: "rgba(255,255,255,0.82)",
    borderColor: "var(--sb-border)",
  } as const;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdService) }}
      />

      <div
        className="rounded-3xl border p-6 shadow-[0_18px_50px_-40px_rgba(0,0,0,0.25)] md:p-10"
        style={{
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.88) 0%, rgba(255,255,255,0.74) 100%)",
          borderColor: "var(--sb-border)",
          backdropFilter: "blur(10px)",
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold md:text-4xl" style={{ color: "var(--sb-ink)" }}>
              {servicio.nombre}
            </h1>
            <p className="mt-1 text-lg font-semibold" style={{ color: "var(--sb-accent2)" }}>
              {servicio.oficio}
            </p>

            {servicio.profesionalNombre && (
              <p className="mt-2 text-sm font-medium" style={{ color: "var(--sb-ink2)" }}>
                Profesional: {servicio.profesionalNombre}
              </p>
            )}
          </div>

          <button
            onClick={toggleFavorito}
            className="rounded-full border p-2 transition-colors hover:brightness-[0.98]"
            style={{
              borderColor: fav ? "rgba(214,93,14,0.26)" : "rgba(148,163,184,0.24)",
              color: fav ? "var(--sb-accent)" : "rgba(148,163,184,0.88)",
              background: fav ? "rgba(214,93,14,0.08)" : "rgba(255,255,255,0.62)",
            }}
            aria-label={fav ? "Quitar de favoritos" : "Añadir a favoritos"}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              className="h-8 w-8"
              fill={fav ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          </button>
        </div>

        <div className="mt-6">
          <ServicioCarrusel imagenes={servicio.imagenes || []} videoUrl={servicio.videoUrl || ""} />
        </div>

        <div className="mt-5 flex flex-wrap gap-3 text-sm">
          {servicio.pueblo && (
            <span
              className="rounded-full border px-3 py-1.5"
              style={{
                background: "rgba(14,165,164,0.10)",
                borderColor: "rgba(14,165,164,0.18)",
                color: "var(--sb-ink)",
              }}
            >
              {servicio.pueblo}
            </span>
          )}
          {servicio.provincia && (
            <span
              className="rounded-full border px-3 py-1.5"
              style={{
                background: "rgba(214,93,14,0.08)",
                borderColor: "rgba(214,93,14,0.18)",
                color: "var(--sb-ink)",
              }}
            >
              {servicio.provincia}
            </span>
          )}
          {servicio.comunidad && (
            <span
              className="rounded-full border px-3 py-1.5"
              style={{
                background: "rgba(15,23,42,0.04)",
                borderColor: "rgba(15,23,42,0.10)",
                color: "var(--sb-ink)",
              }}
            >
              {servicio.comunidad}
            </span>
          )}
        </div>

        {servicio.descripcion && (
          <p className="mt-6 whitespace-pre-line text-base leading-relaxed md:text-lg" style={{ color: "var(--sb-ink2)" }}>
            {servicio.descripcion}
          </p>
        )}

        <div className="mt-8 grid items-stretch gap-6 md:grid-cols-2">
          <div className="space-y-4">
            {(emailContacto || (!telefonoContacto && contactoRaw)) && (
              <div className="rounded-2xl border p-4 shadow-sm md:p-5" style={cardStyle}>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--sb-ink2)" }}>
                  Email
                </p>
                <p className="mt-1 break-words text-sm md:text-base" style={{ color: "var(--sb-ink)" }}>
                  {emailContacto || contactoRaw}
                </p>
              </div>
            )}

            {telefonoContacto && (
              <div className="rounded-2xl border p-4 shadow-sm md:p-5" style={cardStyle}>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--sb-ink2)" }}>
                  Teléfono
                </p>
                <p className="mt-1 text-sm md:text-base" style={{ color: "var(--sb-ink)" }}>
                  {telefonoContacto}
                </p>
              </div>
            )}

            {whatsapp && (
              <div
                className="flex flex-col gap-3 rounded-2xl border p-4 shadow-sm md:p-5"
                style={{
                  background: "rgba(255,255,255,0.82)",
                  borderColor: "rgba(14,165,164,0.18)",
                }}
              >
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--sb-ink2)" }}>
                    WhatsApp
                  </p>
                  <p className="mt-1 text-sm md:text-base" style={{ color: "var(--sb-ink)" }}>
                    {whatsapp}
                  </p>
                </div>
                <a
                  href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(
                    "Hola, vi tu anuncio en EnMiPueblo y me gustaría más información."
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white md:text-base hover:brightness-[0.97]"
                  style={{ background: "var(--sb-accent2)" }}
                >
                  <span>Escribir por WhatsApp</span>
                </a>
              </div>
            )}
          </div>

          <div
            className="rounded-2xl border p-5 shadow-sm md:p-6"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.86) 0%, rgba(14,165,164,0.08) 100%)",
              borderColor: "var(--sb-border)",
            }}
          >
            <div>
              <h2 className="mb-1 text-lg font-extrabold md:text-xl" style={{ color: "var(--sb-ink)" }}>
                Comparte este servicio
              </h2>
              <p className="text-xs md:text-sm" style={{ color: "var(--sb-ink2)" }}>
                Pásale el anuncio a un amigo o compártelo en tus redes.
              </p>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleShareWhatsApp}
                className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white md:text-base hover:brightness-[0.97]"
                style={{ background: "var(--sb-accent2)" }}
              >
                <span>WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={handleShareFacebook}
                className="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold md:text-base hover:bg-black/[0.03]"
                style={{
                  background: "rgba(255,255,255,0.76)",
                  borderColor: "var(--sb-border)",
                  color: "var(--sb-ink)",
                }}
              >
                <span>Facebook</span>
              </button>

              <button
                type="button"
                onClick={handleCopyLink}
                className="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold md:col-span-2 md:text-base hover:bg-black/[0.03]"
                style={{
                  background: "rgba(214,93,14,0.08)",
                  borderColor: "rgba(214,93,14,0.16)",
                  color: "var(--sb-ink)",
                }}
              >
                <span>Copiar enlace</span>
              </button>
            </div>
          </div>
        </div>

        {(loadingRelacionados || relacionadosLoaded) && (
          <div className="mt-10 border-t pt-8" style={{ borderColor: "rgba(15,23,42,0.08)" }}>
            <h2 className="mb-4 text-xl font-extrabold md:text-2xl" style={{ color: "var(--sb-ink)" }}>
              Otros servicios en {servicio.pueblo || servicio.provincia || "la zona"}
            </h2>

            {loadingRelacionados && (
              <p className="text-sm" style={{ color: "var(--sb-ink2)" }}>
                Buscando servicios relacionados…
              </p>
            )}

            {!loadingRelacionados && relacionadosError && (
              <p className="text-sm text-red-600">{relacionadosError}</p>
            )}

            {!loadingRelacionados && !relacionadosError && relacionados.length === 0 && (
              <p className="text-sm" style={{ color: "var(--sb-ink2)" }}>
                De momento no hay más servicios relacionados en esta zona.
              </p>
            )}

            {relacionados.length > 0 && (
              <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
                {relacionados.map((rel: any) => (
                  <ServicioCard
                    key={rel._id}
                    servicio={rel}
                    usuarioEmail={user?.email || null}
                    showFavorito={false}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-10">
          <a
            href="/buscar"
            className="inline-flex items-center gap-2 text-sm font-semibold md:text-base hover:opacity-90"
            style={{ color: "var(--sb-accent2)" }}
          >
            <span>← Volver a la búsqueda</span>
          </a>
        </div>
      </div>
    </>
  );
};

export default ServicioDetalleIsland;