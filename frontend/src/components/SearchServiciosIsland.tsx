import React, { useEffect, useRef, useState } from "react";
import ServicioCard from "./ServicioCard.tsx";
import GoogleAdIsland from "./GoogleAdIsland.tsx";
import { getServicios, getFavoritos, buscarLocalidades } from "../lib/api-utils.js";
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
const DEBOUNCE_SERVICIOS = 350;
const DEBOUNCE_LOCALIDADES = 250;

// Cache “suave”
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutos

const SLOT_SEARCH = import.meta.env.PUBLIC_ADSENSE_SLOT_SEARCH as string | undefined;

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

function buildCacheKey(filtros: any): string {
  // key estable solo con lo relevante
  return JSON.stringify({
    texto: filtros.texto || "",
    categoria: filtros.categoria || "",
    page: filtros.page || 1,
    limit: filtros.limit || PAGE_SIZE,
    pueblo: filtros.pueblo || "",
    provincia: filtros.provincia || "",
    comunidad: filtros.comunidad || "",
  });
}

const SearchServiciosIsland: React.FC = () => {
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

  const debounceServiciosRef = useRef<any>(null);
  const debounceLocRef = useRef<any>(null);

  // Control de respuestas viejas
  const reqServiciosIdRef = useRef(0);
  const reqLocIdRef = useRef(0);

  // Cache in-memory
  const cacheRef = useRef<Map<string, { ts: number; data: any[] }>>(new Map());
  const lastFetchTsRef = useRef<number>(0);

  // ===============================
  // USUARIO + FAVORITOS
  // ===============================
  useEffect(() => {
    const unsub = onUserStateChange(async (u: any) => {
      setUsuarioEmail(u?.email ?? null);

      if (u?.email) {
        try {
          const fav = await getFavoritos(u.email);
          setFavoritos(fav.data || []);
        } catch {
          setFavoritos([]);
        }
      } else {
        setFavoritos([]);
      }

      setUserLoaded(true);
    });

    return () => unsub && unsub();
  }, []);

  // ===============================
  // AUTOCOMPLETAR LOCALIDADES (debounce + ignore stale)
  // ===============================
  useEffect(() => {
    if (debounceLocRef.current) clearTimeout(debounceLocRef.current);

    const q = locQuery.trim();
    if (!q || q.length < 2) {
      setSuggestions([]);
      return;
    }

    const currentReqId = ++reqLocIdRef.current;

    debounceLocRef.current = setTimeout(async () => {
      try {
        const { data } = await buscarLocalidades(q);
        if (currentReqId !== reqLocIdRef.current) return;
        setSuggestions(data || []);
      } catch {
        if (currentReqId !== reqLocIdRef.current) return;
        setSuggestions([]);
      }
    }, DEBOUNCE_LOCALIDADES);

    return () => {
      if (debounceLocRef.current) clearTimeout(debounceLocRef.current);
    };
  }, [locQuery]);

  const aplicarLocalidad = (loc: any) => {
    const provinciaNombre = getProvinciaNombre(loc);
    const ccaaNombre = getCcaaNombre(loc);

    setSelectedLoc(loc);
    setLocQuery([loc.nombre, provinciaNombre, ccaaNombre].filter(Boolean).join(", "));
    setShowDropdown(false);
    setSuggestions([]);
    setPage(1);
  };

  // ===============================
  // BUILD FILTROS (siempre desde el estado actual)
  // ===============================
  const buildFiltros = () => {
    const filtros: any = {
      // IMPORTANTE: este es el filtro por “nombre/oficio/texto”
      texto: query.trim(), // ✅ acá estaba el problema en tu caso: ahora SIEMPRE entra
      categoria: categoria || "",
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

    // limpiar vacíos para evitar comportamientos raros según cómo arme la query api-utils
    if (!filtros.texto) delete filtros.texto;
    if (!filtros.categoria) delete filtros.categoria;

    return filtros;
  };

  // ===============================
  // CARGAR SERVICIOS (debounce + cache + ignore stale)
  // ===============================
  const cargarServicios = async (opts?: { force?: boolean }) => {
    const force = !!opts?.force;

    const filtros = buildFiltros();
    const cacheKey = buildCacheKey({
      ...filtros,
      // asegurar presencia de keys en la key aunque se hayan borrado
      texto: query.trim(),
      categoria,
      page,
      limit: PAGE_SIZE,
      pueblo: selectedLoc?.nombre || "",
      provincia: selectedLoc ? getProvinciaNombre(selectedLoc) : "",
      comunidad: selectedLoc ? getCcaaNombre(selectedLoc) : "",
    });

    const now = Date.now();
    const cached = cacheRef.current.get(cacheKey);

    if (!force && cached && now - cached.ts < CACHE_TTL_MS) {
      setServicios(cached.data || []);
      setLoading(false);
      return;
    }

    setLoading(true);
    const currentReqId = ++reqServiciosIdRef.current;

    try {
      const res = await getServicios(filtros);
      if (currentReqId !== reqServiciosIdRef.current) return;

      const data = res.data || [];
      setServicios(data);
      cacheRef.current.set(cacheKey, { ts: Date.now(), data });
      lastFetchTsRef.current = Date.now();
    } catch (err) {
      if (currentReqId !== reqServiciosIdRef.current) return;
      console.error("Error cargando servicios:", err);
      setServicios([]);
    } finally {
      if (currentReqId === reqServiciosIdRef.current) setLoading(false);
    }
  };

  // Debounce búsqueda/filtros
  useEffect(() => {
    if (!userLoaded) return;

    if (debounceServiciosRef.current) clearTimeout(debounceServiciosRef.current);

    debounceServiciosRef.current = setTimeout(() => {
      cargarServicios();
    }, DEBOUNCE_SERVICIOS);

    return () => {
      if (debounceServiciosRef.current) clearTimeout(debounceServiciosRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, categoria, page, selectedLoc, userLoaded]);

  // Revalidar al volver (pero solo si pasó TTL)
  useEffect(() => {
    if (!userLoaded) return;

    const shouldRefetch = () => Date.now() - (lastFetchTsRef.current || 0) > CACHE_TTL_MS;

    const onFocus = () => {
      if (shouldRefetch()) cargarServicios({ force: true });
    };

    const onVis = () => {
      if (document.visibilityState === "visible" && shouldRefetch()) {
        cargarServicios({ force: true });
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLoaded]);

  if (!userLoaded) {
    return <div className="text-center py-8 text-gray-500">Cargando datos…</div>;
  }

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
        <div className="text-center py-16 text-gray-500">¡No se encontraron servicios!</div>
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
                  try {
                    const fav = await getFavoritos(usuarioEmail);
                    setFavoritos(fav.data || []);
                  } catch {
                    setFavoritos([]);
                  }
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
