import React, { useEffect, useState } from "react";
import {
  getServicio,
  addFavorito,
  removeFavorito,
  getFavoritos,
} from "../lib/api-utils.js";
import { onUserStateChange } from "../lib/firebase.js";
import ServicioCarrusel from "./ServicioCarrusel.tsx";

// Ahora el ID del servicio se puede recibir por props O leer desde la URL
const ServicioDetalleIsland = ({ id: initialId }) => {
  const [id, setId] = useState(initialId || null);
  const [servicio, setServicio] = useState<any | null>(null);
  const [user, setUser] = useState<any | null>(null);
  const [favoritos, setFavoritos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

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

      // 2) Como respaldo, intentamos sacar el último segmento de la URL /servicio/123
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
        setServicio(res); // res ya es el servicio corregido
      } catch (err) {
        console.error("Error cargando servicio:", err);
      } finally {
        setLoading(false);
      }
    })();
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
    const idFav =
      f?.servicio?._id ||
      f?.servicio ||
      f?._id ||
      f;
    return String(idFav) === String(servicio._id);
  });

  async function toggleFavorito() {
    if (!user) return alert("Debes iniciar sesión");

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

  return (
    <div className="bg-white rounded-3xl shadow-lg p-8 md:p-10 border border-emerald-100">
      <div className="flex justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold text-emerald-900">
            {servicio.nombre}
          </h1>
          <p className="text-emerald-600 text-lg mt-1">{servicio.oficio}</p>
        </div>

        {/* Botón favorito (solo icono) */}
        <button
          onClick={toggleFavorito}
          className={`p-1 transition-colors ${
            fav ? "text-emerald-600" : "text-gray-300 hover:text-emerald-500"
          }`}
          aria-label={fav ? "Quitar de favoritos" : "Añadir a favoritos"}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            className="w-7 h-7"
            fill={fav ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path
  d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
/>

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
      <div className="mt-4 flex flex-wrap gap-3 text-sm text-gray-600">
        {servicio.pueblo && (
          <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
            {servicio.pueblo}
          </span>
        )}
        {servicio.municipio && (
          <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
            Municipio: {servicio.municipio}
          </span>
        )}
        {servicio.provincia && (
          <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
            {servicio.provincia}
          </span>
        )}
        {servicio.comunidad && (
          <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
            {servicio.comunidad}
          </span>
        )}
      </div>

      {/* Descripción */}
      {servicio.descripcion && (
        <p className="mt-6 text-gray-700 leading-relaxed whitespace-pre-line">
          {servicio.descripcion}
        </p>
      )}

      {/* Datos de contacto */}
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {servicio.contacto && (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
            <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">
              Contacto
            </p>
            <p className="mt-1 text-emerald-900">{servicio.contacto}</p>
          </div>
        )}

        {servicio.whatsapp && (
          <div className="p-4 rounded-2xl bg-green-50 border border-green-100">
            <p className="text-xs font-semibold text-green-900 uppercase tracking-wide">
              WhatsApp
            </p>
            <a
              href={`https://wa.me/${servicio.whatsapp}?text=${encodeURIComponent(
                "Hola, vi tu anuncio en EnMiPueblo y me gustaría más información."
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-2 text-green-700 font-medium"
            >
              <span>{servicio.whatsapp}</span>
              <span className="text-xs bg-green-100 px-2 py-1 rounded-full">
                Abrir WhatsApp
              </span>
            </a>
          </div>
        )}
      </div>

      {/* Botón volver */}
      <div className="mt-10">
        <a
          href="/buscar"
          className="inline-flex items-center gap-2 text-emerald-700 hover:text-emerald-900 font-medium"
        >
          <span>← Volver a la búsqueda</span>
        </a>
      </div>
    </div>
  );
};

export default ServicioDetalleIsland;
