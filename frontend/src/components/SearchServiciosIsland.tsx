import React, { useEffect, useRef, useState } from "react";
import ServicioCard from "./ServicioCard.tsx";
import GoogleAdIsland from "./GoogleAdIsland.tsx";
import LocationPickerModal from "./LocationPickerModal.tsx";
import { getServicios, getFavoritos } from "../lib/api-utils.js";
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

const CACHE_TTL_MS = 2 * 60 * 1000;

const SLOT_SEARCH = import.meta.env.PUBLIC_ADSENSE_SLOT_SEARCH as string | undefined;

type SelectedLoc = {
  nombre: string;
  provincia?: string;
  comunidad?: string;
  lat?: number;
  lng?: number;
};

function buildCacheKey(f: any) {
  return JSON.stringify(f);
}

const SearchServiciosIsland: React.FC = () => {
  const [servicios, setServicios] = useState<any[]>([]);
  const [favoritos, setFavoritos] = useState<any[]>([]);
  const [usuarioEmail, setUsuarioEmail] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [categoria, setCategoria] = useState("");
  const [page, setPage] = useState(1);

  const [selectedLoc, setSelectedLoc] = useState<SelectedLoc | null>(null);
  const [radiusKm, setRadiusKm] = useState(25);
  const [locModalOpen, setLocModalOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [userLoaded, setUserLoaded] = useState(false);

  const debounceServiciosRef = useRef<any>(null);
  const reqIdRef = useRef(0);
  const cacheRef = useRef<Map<string, { ts: number; data: any[] }>>(new Map());
  const lastFetchTsRef = useRef<number>(0);

  // USUARIO + FAVORITOS
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

  const buildFiltros = () => {
    const filtros: any = {
      texto: query.trim(),
      categoria: categoria || "",
      page,
      limit: PAGE_SIZE,
    };

    if (selectedLoc?.nombre) {
      filtros.pueblo = selectedLoc.nombre;
      if (selectedLoc.provincia) filtros.provincia = selectedLoc.provincia;
      if (selectedLoc.comunidad) filtros.comunidad = selectedLoc.comunidad;
    }

    // ✅ distancia si hay coords
    if (
      selectedLoc?.lat != null &&
      selectedLoc?.lng != null &&
      Number.isFinite(selectedLoc.lat) &&
      Number.isFinite(selectedLoc.lng)
    ) {
      filtros.lat = selectedLoc.lat;
      filtros.lng = selectedLoc.lng;
      filtros.radiusKm = radiusKm;
    }

    if (!filtros.texto) delete filtros.texto;
    if (!filtros.categoria) delete filtros.categoria;

    return filtros;
  };

  const cargarServicios = async (opts?: { force?: boolean }) => {
    const force = !!opts?.force;
    const filtros = buildFiltros();

    const cacheKey = buildCacheKey({
      texto: filtros.texto || "",
      categoria: filtros.categoria || "",
      page,
      limit: PAGE_SIZE,
      pueblo: selectedLoc?.nombre || "",
      provincia: selectedLoc?.provincia || "",
      comunidad: selectedLoc?.comunidad || "",
      lat: filtros.lat || "",
      lng: filtros.lng || "",
      radiusKm: filtros.radiusKm || "",
    });

    const now = Date.now();
    const cached = cacheRef.current.get(cacheKey);
    if (!force && cached && now - cached.ts < CACHE_TTL_MS) {
      setServicios(cached.data || []);
      setLoading(false);
      return;
    }

    setLoading(true);
    const rid = ++reqIdRef.current;

    try {
      const res = await getServicios(filtros);
      if (rid !== reqIdRef.current) return;

      const data = res.data || [];
      setServicios(data);
      cacheRef.current.set(cacheKey, { ts: Date.now(), data });
      lastFetchTsRef.current = Date.now();
    } catch (err) {
      if (rid !== reqIdRef.current) return;
      console.error("Error cargando servicios:", err);
      setServicios([]);
    } finally {
      if (rid === reqIdRef.current) setLoading(false);
    }
  };

  // Debounce búsqueda
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
  }, [query, categoria, page, selectedLoc, radiusKm, userLoaded]);

  // Revalidar al volver (TTL)
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
    return <div className="text-center py-8 text-slate-500">Cargando datos…</div>;
  }

  const locLabel =
    selectedLoc?.nombre
      ? [selectedLoc.nombre, selectedLoc.provincia, selectedLoc.comunidad].filter(Boolean).join(", ")
      : "";

  return (
    <>
      <LocationPickerModal
        open={locModalOpen}
        title="Ubicación y distancia"
        showRadius={true}
        initialRadiusKm={radiusKm}
        initialValueText={locLabel}
        initialLat={selectedLoc?.lat ?? null}
        initialLng={selectedLoc?.lng ?? null}
        onClose={() => setLocModalOpen(false)}
        onApply={(p) => {
          setSelectedLoc({
            nombre: p.nombre,
            provincia: p.provincia,
            comunidad: p.comunidad,
            lat: p.lat,
            lng: p.lng,
          });
          if (p.radiusKm) setRadiusKm(p.radiusKm);
          setPage(1);
        }}
      />

      {/* BUSCADOR */}
      <form
        onSubmit={(e) => e.preventDefault()}
        className="max-w-5xl mx-auto mb-10 grid grid-cols-1 md:grid-cols-5 gap-4"
      >
        {/* TEXTO */}
        <input
          type="text"
          placeholder="Busca por oficio, nombre…"
          className="col-span-2 border border-emerald-200 rounded-2xl p-3 shadow-sm bg-white focus:outline-none focus:ring-4 focus:ring-emerald-100"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
        />

        {/* LOCALIDAD (abre modal) */}
        <button
          type="button"
          onClick={() => setLocModalOpen(true)}
          className="col-span-2 w-full text-left border border-emerald-200 rounded-2xl p-3 shadow-sm bg-white hover:bg-emerald-50/60 focus:outline-none focus:ring-4 focus:ring-emerald-100"
        >
          <div className="text-sm font-bold text-emerald-950">
            {locLabel || "Pueblo / Localidad…"}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {selectedLoc?.lat != null && selectedLoc?.lng != null
              ? `Radio: ${radiusKm} km (con mapa)`
              : "Abrir mapa y elegir distancia"}
          </div>
        </button>

        {/* CATEGORÍA */}
        <select
          className="border border-emerald-200 rounded-2xl p-3 shadow-sm bg-white focus:outline-none focus:ring-4 focus:ring-emerald-100"
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
        <div className="text-center py-16 text-slate-500">Cargando…</div>
      ) : servicios.length === 0 ? (
        <div className="text-center py-16 text-slate-500">¡No se encontraron servicios!</div>
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

          {/* 1 anuncio en Buscar */}
          <div className="max-w-5xl mx-auto">
            <GoogleAdIsland slot={SLOT_SEARCH} />
          </div>
        </>
      )}

      {/* PAGINACIÓN */}
      <div className="mt-10 flex justify-center items-center gap-4">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          className="px-5 py-3 rounded-2xl bg-emerald-200 text-emerald-950 font-extrabold shadow-sm disabled:bg-emerald-100 disabled:text-emerald-400"
        >
          Anterior
        </button>

        <span className="font-bold text-emerald-950">Página {page}</span>

        <button
          onClick={() => setPage((p) => p + 1)}
          className="px-5 py-3 rounded-2xl bg-emerald-300 hover:bg-emerald-400 text-emerald-950 font-extrabold shadow-sm"
        >
          Siguiente
        </button>
      </div>
    </>
  );
};

export default SearchServiciosIsland;
