import React, { useState, useEffect, useRef } from "react";
import ServicioCard from "./ServicioCard.tsx";
import GoogleAdIsland from "./GoogleAdIsland.tsx";
import {
  getServicios,
  getFavoritos,
  buscarLocalidades,
} from "../lib/api-utils.js";
import { onUserStateChange } from "../lib/firebase.js";

const CATEGORIAS = [
  "Albañilería",
  "Carpintería",
  "Electricidad",
  "Fontanería",
  "Pintura",
  "Jardinería",
  "Limpieza",
  "Panadería",
  "Hostelería",
  "Transporte",
  "Reparación Electrodomésticos",
  "Informática",
  "Diseño Gráfico",
  "Marketing",
  "Clases Particulares",
  "Salud y Bienestar",
  "Turismo",
  "Eventos",
  "Asesoría Legal",
  "Otros",
];

const PAGE_SIZE = 12;
const DEBOUNCE = 350;

const SLOT_SEARCH = import.meta.env.PUBLIC_ADSENSE_SLOT_SEARCH as
  | string
  | undefined;

function getProvinciaNombre(loc: any): string {
  const prov = loc && (loc.provincia ?? loc.province);
  if (!prov) return "";
  if (typeof prov === "string") return prov;
  if (typeof prov === "object") return prov.nombre || prov.name || "";
  return "";
}

function getCcaaNombre(loc: any): string {
  const ccaa = loc && (loc.ccaa ?? loc.comunidad);
  if (!ccaa) return "";
  if (typeof ccaa === "string") return ccaa;
  if (typeof ccaa === "object") return ccaa.nombre || ccaa.name || "";
  return "";
}

const SearchServiciosIsland = () => {
  const [servicios, setServicios] = useState<any[]>([]);
  const [favoritos, setFavoritos] = useState<any[]>([]);
  const [usuarioEmail, setUsuarioEmail] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [categoria, setCategoria] = useState("");
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [userLoaded, setUserLoaded] = useState(false);

  // LOCALIDADES
  const [locQuery, setLocQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [selectedLoc, setSelectedLoc] = useState<any | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const debounceRef = useRef<any>(null);

  // ===============================
  // USUARIO
  // ===============================
  useEffect(() => {
    const unsub = onUserStateChange(async (u: any) => {
      setUsuarioEmail(u?.email ?? null);
      if (u?.email) {
        const fav = await getFavoritos(u.email);
        setFavoritos(fav.data || []);
      }
      setUserLoaded(true);
    });

    return () => unsub && unsub();
  }, []);

  // ===============================
  // AUTOCOMPLETAR LOCALIDADES
  // ===============================
  useEffect(() => {
    if (!locQuery || locQuery.length < 2) {
      setSuggestions([]);
      return;
    }

    const fetchLocs = async () => {
      try {
        const { data } = await buscarLocalidades(locQuery);
        setSuggestions(data || []);
      } catch {
        setSuggestions([]);
      }
    };

    fetchLocs();
  }, [locQuery]);

  const aplicarLocalidad = (loc: any) => {
    const provinciaNombre = getProvinciaNombre(loc);
    const ccaaNombre = getCcaaNombre(loc);

    setSelectedLoc(loc);
    setLocQuery([loc.nombre, provinciaNombre, ccaaNombre].filter(Boolean).join(", "));
    setShowDropdown(false);
    setPage(1);
  };

  // ===============================
  // CARGAR SERVICIOS
  // ===============================
  useEffect(() => {
    if (!userLoaded) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      cargarServicios();
    }, DEBOUNCE);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, categoria, page, selectedLoc, userLoaded]);

  const cargarServicios = async () => {
    setLoading(true);

    const filtros: any = {
      texto: query,
      categoria,
      page,
      limit: PAGE_SIZE,
    };

    if (selectedLoc) {
      const provinciaNombre = getProvinciaNombre(selectedLoc);
      const ccaaNombre = getCcaaNombre(selectedLoc);

      filtros.pueblo = selectedLoc.nombre;
      filtros.provincia = provinciaNombre;
      filtros.comunidad = ccaaNombre;
    }

    const res = await getServicios(filtros);

    setServicios(res.data || []);
    setLoading(false);
  };

  // Revalidar al volver a la pestaña/ventana
  useEffect(() => {
    if (!userLoaded) return;

    const onFocus = () => {
      cargarServicios();
    };
    const onVis = () => {
      if (document.visibilityState === "visible") cargarServicios();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLoaded, query, categoria, page, selectedLoc]);

  if (!userLoaded)
    return <div className="text-center py-8 text-gray-500">Cargando datos…</div>;

  return (
    <>
      {/* BUSCADOR */}
      <form
        onSubmit={(e) => e.preventDefault()}
        className="max-w-5xl mx-auto mb-10 grid grid-cols-1 md:grid-cols-5 gap-4"
      >
        {/* TEXTO */}
        <input
          type="text"
          placeholder="Busca por oficio, nombre…"
          className="col-span-2 border rounded-xl p-3 shadow"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
        />

        {/* LOCALIDAD */}
        <div className="relative col-span-2">
          <input
            type="text"
            placeholder="Pueblo / Localidad…"
            className="w-full border rounded-xl p-3 shadow"
            value={locQuery}
            onChange={(e) => {
              setLocQuery(e.target.value);
              setSelectedLoc(null);
              setShowDropdown(true);
              setPage(1);
            }}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
          />

          {showDropdown && suggestions.length > 0 && (
            <div className="absolute bg-white border border-green-200 rounded-xl shadow-xl w-full max-h-72 overflow-auto z-20 mt-1">
              {suggestions.map((loc) => {
                const provinciaNombre = getProvinciaNombre(loc);
                const ccaaNombre = getCcaaNombre(loc);

                return (
                  <div
                    key={loc.id ?? loc.municipio_id ?? loc.nombre}
                    className="px-4 py-2 hover:bg-green-50 cursor-pointer"
                    onMouseDown={() => aplicarLocalidad(loc)}
                  >
                    <div className="font-semibold text-green-700">{loc.nombre}</div>
                    <div className="text-xs text-gray-500">
                      {[provinciaNombre, ccaaNombre].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* CATEGORÍA */}
        <select
          className="border rounded-xl p-3 shadow"
          value={categoria}
          onChange={(e) => {
            setCategoria(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Categoría</option>
          {CATEGORIAS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </form>

      {/* RESULTADOS */}
      {loading ? (
        <div className="text-center py-16 text-gray-500">Cargando…</div>
      ) : servicios.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          ¡No se encontraron servicios!
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 place-items-center">
            {servicios.map((s) => (
              <ServicioCard
                key={s._id}
                servicio={s}
                usuarioEmail={usuarioEmail}
                favoritos={favoritos}
                showFavorito={true}
                onFavoritoChange={async () => {
                  if (!usuarioEmail) return;
                  const fav = await getFavoritos(usuarioEmail);
                  setFavoritos(fav.data || []);
                }}
              />
            ))}
          </div>

          {/* 1 anuncio en Buscar (entre grid y paginación) */}
          <div className="max-w-5xl mx-auto">
            <GoogleAdIsland slot={SLOT_SEARCH} client:load />
          </div>
        </>
      )}

      {/* PAGINACIÓN */}
      <div className="mt-8 flex justify-center items-center gap-4">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          className="px-4 py-2 bg-green-600 disabled:bg-gray-300 text-white rounded-xl"
        >
          Anterior
        </button>

        <span className="font-semibold">Página {page}</span>

        <button
          onClick={() => setPage((p) => p + 1)}
          className="px-4 py-2 bg-green-600 text-white rounded-xl"
        >
          Siguiente
        </button>
      </div>
    </>
  );
};

export default SearchServiciosIsland;
