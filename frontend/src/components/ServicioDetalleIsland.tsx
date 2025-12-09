// src/components/ServicioDetalleIsland.tsx
import React, { useEffect, useState } from "react";
import {
  getServicio,
  addFavorito,
  removeFavorito,
  getFavoritos,
} from "../lib/api-utils.js";
import { onUserStateChange } from "../lib/firebase.js";
import ServicioCarrusel from "./ServicioCarrusel.tsx";
import ServicioCard from "./ServicioCard.tsx";

// Mismo criterio que api-utils.js
const BASE = import.meta.env.PUBLIC_BACKEND_URL || "";
const API = BASE.endsWith("/api") ? BASE : `${BASE}/api`;

// Ahora el ID del servicio se puede recibir por props O leer desde la URL
const ServicioDetalleIsland = ({ id: initialId }) => {
  const [id, setId] = useState(initialId || null);
  const [servicio, setServicio] = useState<any | null>(null);
  const [user, setUser] = useState<any | null>(null);
  const [favoritos, setFavoritos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [relacionados, setRelacionados] = useState<any[]>([]);
  const [loadingRelacionados, setLoadingRelacionados] = useState(false);

  // =======================
  // Resolver ID desde la URL si no viene por props
  // =======================
  useEffect(() => {
    if (initialId) return; // ya viene resuelto desde Astro

    try {
      const url = new URL(window.location.href);
      // 1) Primero intentamos por query param ?id=...
      const queryId = url.searchParams.get("id");

      if (queryId) {
        setId(queryId);
        return;
      }

      // 2) Respaldo: último segmento /servicio/123
      const segments = url.pathname.split("/").filter(Boolean);
      const last = segments[segments.length - 1];

      if (last && last !== "servicio") {
        setId(last);
      }
    } catch (err) {
      console.error("Error obteniendo id desde la URL:", err);
    }
  }, [initialId]);

  // =======================
  // Load user
  // =======================
  useEffect(() => {
    const unsub = onUserStateChange((u) => setUser(u));
    return () => unsub?.();
  }, []);

  // =======================
  // Load servicio
  // =======================
  useEffect(() => {
    if (!id) return;

    (async () => {
      setLoading(true);
      try {
        const res = await getServicio(id);
        setServicio(res); // res ya es el servicio
      } catch (err) {
        console.error("Error cargando servicio:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // =======================
  // Load servicios relacionados
  // =======================
  useEffect(() => {
    if (!id) {
      setRelacionados([]);
      return;
    }

    let cancelado = false;

    (async () => {
      try {
        setLoadingRelacionados(true);
        const resp = await fetch(
          `${API}/servicios/relacionados/${encodeURIComponent(id)}`
        );
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }
        const json = await resp.json();
        const lista = Array.isArray(json) ? json : json.data || [];
        if (!cancelado) {
          setRelacionados(lista);
        }
      } catch (err) {
        console.error("Error cargando relacionados:", err);
        if (!cancelado) {
          setRelacionados([]);
        }
      } finally {
        if (!cancelado) {
          setLoadingRelacionados(false);
        }
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [id]);

  // =======================
  // Load favoritos
  // =======================
  useEffect(() => {
    if (!user?.email) return;

    (async () => {
      const favs = await getFavoritos(user.email);
      setFavoritos(favs.data || []);
    })();
  }, [user]);

  if (loading) {
    return (
      <div className="text-center text-emerald-700 py-20 text-lg animate-pulse">
        Cargando servicio…
      </div>
    );
  }

  if (!servicio) {
    return (
      <div className="text-center text-gray-500 py-20">
        Servicio no encontrado.
      </div>
    );
  }

  // ---------------------
  // ¿Es favorito?
  // ---------------------
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
      setFavoritos(favs.data || []);
    } catch (err) {
      console.error("Error al actualizar favorito:", err);
    }
  }

  // ---------------------
  // Contacto desglosado
  // ---------------------
  const contactoRaw = (servicio.contacto || "").trim();

  const emailContacto =
    servicio.email ||
    (contactoRaw.includes("@") ? contactoRaw : "") ||
    "";

  const telefonoContacto =
    servicio.telefono ||
    (!contactoRaw.includes("@") && contactoRaw ? contactoRaw : "") ||
    "";

  const whatsapp = servicio.whatsapp || "";

  // ---------------------
  // Sharing helpers
  // ---------------------
  const currentUrl =
    typeof window !== "undefined" ? window.location.href : "";

  const handleShareWhatsApp = () => {
    const text = `${servicio.nombre} - Visto en EnMiPueblo\n${currentUrl}`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleShareFacebook = () => {
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
      currentUrl
    )}`;
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

  return (
    <div className="bg-gradient-to-br from-white via-emerald-50/40 to-white rounded-3xl shadow-xl p-6 md:p-10 border border-emerald-100">
      {/* CABECERA + FAVORITO */}
      <div className="flex justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-emerald-900">
            {servicio.nombre}
          </h1>
          <p className="text-emerald-600 text-lg mt-1 font-medium">
            {servicio.oficio}
          </p>
        </div>

        {/* Botón favorito (solo icono) */}
        <button
          onClick={toggleFavorito}
          className={`p-1.5 rounded-full border transition-colors ${
            fav
              ? "border-emerald-500 text-emerald-600 bg-emerald-50"
              : "border-gray-200 text-gray-300 hover:text-emerald-500 hover:border-emerald-300"
          }`}
          aria-label={fav ? "Quitar de favoritos" : "Añadir a favoritos"}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            className="w-8 h-8"
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

      {/* Carrusel de imágenes + video */}
      <div className="mt-6">
        <ServicioCarrusel
          imagenes={servicio.imagenes || []}
          videoUrl={servicio.videoUrl || ""}
        />
      </div>

      {/* Localidad */}
      <div className="mt-5 flex flex-wrap gap-3 text-sm text-gray-600">
        {servicio.pueblo && (
          <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
            {servicio.pueblo}
          </span>
        )}
        {servicio.provincia && (
          <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
            {servicio.provincia}
          </span>
        )}
        {servicio.comunidad && (
          <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
            {servicio.comunidad}
          </span>
        )}
      </div>

      {/* Descripción */}
      {servicio.descripcion && (
        <p className="mt-6 text-gray-700 leading-relaxed whitespace-pre-line text-base md:text-lg">
          {servicio.descripcion}
        </p>
      )}

      {/* CONTACTO + COMPARTIR */}
      <div className="mt-8 grid gap-6 md:grid-cols-2 items-stretch">
        {/* Bloque contacto */}
        <div className="space-y-4">
          {/* EMAIL */}
          {(emailContacto || (!telefonoContacto && contactoRaw)) && (
            <div className="p-4 md:p-5 rounded-2xl bg-white border border-emerald-100 shadow-sm">
              <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">
                Email
              </p>
              <p className="mt-1 text-emerald-900 text-sm md:text-base break-words">
                {emailContacto || contactoRaw}
              </p>
            </div>
          )}

          {/* TELÉFONO FIJO / MÓVIL (sin llamada directa) */}
          {telefonoContacto && (
            <div className="p-4 md:p-5 rounded-2xl bg-white border border-emerald-100 shadow-sm">
              <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">
                Teléfono
              </p>
              <p className="mt-1 text-emerald-900 text-sm md:text-base">
                {telefonoContacto}
              </p>
            </div>
          )}

          {/* WHATSAPP: botón grande que abre WhatsApp */}
          {whatsapp && (
            <div className="p-4 md:p-5 rounded-2xl bg-green-50 border border-green-200 shadow-sm flex flex-col gap-3">
              <div>
                <p className="text-xs font-semibold text-green-900 uppercase tracking-wide">
                  WhatsApp
                </p>
                <p className="mt-1 text-green-900 text-sm md:text-base">
                  {whatsapp}
                </p>
              </div>
              <a
                href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(
                  "Hola, vi tu anuncio en EnMiPueblo y me gustaría más información."
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-sm md:text-base"
              >
                <span>Escribir por WhatsApp</span>
              </a>
            </div>
          )}
        </div>

        {/* Bloque compartir */}
        <div className="p-5 md:p-6 rounded-2xl bg-emerald-900 text-emerald-50 shadow-md flex flex-col justify-between">
          <div>
            <h2 className="text-lg md:text-xl font-semibold mb-1">
              Comparte este servicio
            </h2>
            <p className="text-xs md:text-sm text-emerald-100">
              Pásale el anuncio a un amigo o compártelo en tus redes.
            </p>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="flex-1 min-w-[130px] inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-green-500 hover:bg-green-400 text-white font-semibold text-sm md:text-base"
            >
              <span>WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={handleShareFacebook}
              className="flex-1 min-w-[130px] inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-semibold text-sm md:text-base"
            >
              <span>Facebook</span>
            </button>

            <button
              type="button"
              onClick={handleCopyLink}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-emerald-200 bg-emerald-800/40 hover:bg-emerald-700 font-semibold text-sm md:text-base mt-1"
            >
              <span>Copiar enlace</span>
            </button>
          </div>
        </div>
      </div>

      {/* Servicios relacionados */}
      {(loadingRelacionados || relacionados.length > 0) && (
        <div className="mt-10 border-t border-emerald-100 pt-8">
          <h2 className="text-xl md:text-2xl font-bold text-emerald-900 mb-4">
            Otros servicios en{" "}
            {servicio.pueblo || servicio.provincia || "la zona"}
          </h2>

          {loadingRelacionados && !relacionados.length && (
            <p className="text-sm text-gray-500">Buscando servicios relacionados…</p>
          )}

          {!loadingRelacionados && !relacionados.length && (
            <p className="text-sm text-gray-500">
              De momento no hay más servicios relacionados en esta zona.
            </p>
          )}

          {relacionados.length > 0 && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
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

      {/* Botón volver */}
      <div className="mt-10">
        <a
          href="/buscar"
          className="inline-flex items-center gap-2 text-emerald-700 hover:text-emerald-900 font-medium text-sm md:text-base"
        >
          <span>← Volver a la búsqueda</span>
        </a>
      </div>
    </div>
  );
};

export default ServicioDetalleIsland;
