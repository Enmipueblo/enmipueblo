import React, { useEffect, useMemo, useRef, useState } from "react";
import ServicioCard from "./ServicioCard.tsx";
import GoogleAdIsland from "./GoogleAdIsland.tsx";
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
  id?: string;
  nombre: string;
  provincia?: string;
  comunidad?: string;
};

type LocSuggestion = {
  id: string;
  nombre: string;
  provincia?: string;
  ccaa?: string; // backend devuelve ccaa
  comunidad?: string; // por compat si alguna vez viene así
};

function buildCacheKey(f: any) {
  return JSON.stringify(f);
}

const CONTROL_HEIGHT = "h-[56px]";

type CacheEntry = {
  ts: number;
  data: any[];
  totalPages: number;
  totalItems: number;
};

function cleanNombre(nombre: string) {
  // Si viene algo tipo "Graus, Ribagorza..." nos quedamos con "Graus"
  const s = String(nombre || "").trim();
  if (!s) return "";
  const first = s.split(",")[0]?.trim();
  return first || s;
}

const SearchServiciosIsland: React.FC = () => {
  const [servicios, setServicios] = useState<any[]>([]);
  const [favoritos, setFavoritos] = useState<any[]>([]);
  const [usuarioEmail, setUsuarioEmail] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [categoria, setCategoria] = useState("");
  const [page, setPage] = useState(1);

  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Localidad (sin mapa, sin radio)
  const [selectedLoc, setSelectedLoc] = useState<SelectedLoc | null>(null);
  const [locText, setLocText] = useState(""); // lo que escribe el usuario
  const [locSug, setLocSug] = useState<LocSuggestion[]>([]);
  const [locLoading, setLocLoading] = useState(false);
  const [locOpen, setLocOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [userLoaded, setUserLoaded] = useState(false);
  const [filtersReady, setFiltersReady] = useState(false);

  const debounceServiciosRef = useRef<any>(null);
  const reqIdRef = useRef(0);
  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const lastFetchTsRef = useRef<number>(0);

  const locReqIdRef = useRef(0);
  const locDebounceRef = useRef<any>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

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

  // Inicializa filtros desde URL: ?texto ?categoria ?pueblo ?provincia ?comunidad ?page
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const sp = new URLSearchParams(window.location.search);

      const q = sp.get("texto") || "";
      const cat = sp.get("categoria") || "";
      const pageParam = Number(sp.get("page") || "1");

      const pueblo = sp.get("pueblo") || "";
      const provincia = sp.get("provincia") || "";
      const comunidad = sp.get("comunidad") || "";

      if (q) setQuery(q);
      if (cat) setCategoria(cat);
      if (Number.isFinite(pageParam) && pageParam > 0) setPage(pageParam);

      if (pueblo) {
        const nombre = cleanNombre(pueblo);
        setSelectedLoc({
          nombre,
          provincia: provincia || undefined,
          comunidad: comunidad || undefined,
        });
        setLocText([nombre, provincia, comunidad].filter(Boolean).join(", "));
      }
    } finally {
      setFiltersReady(true);
    }
  }, []);

  // Cerrar sugerencias al click fuera
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (!el.contains(e.target as any)) setLocOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const fetchLocalidades = async (q: string) => {
    const query = String(q || "").trim();
    if (query.length < 2) {
      setLocSug([]);
      setLocLoading(false);
      return;
    }

    const rid = ++locReqIdRef.current;
    setLocLoading(true);

    try {
      const res = await fetch(`/api/localidades?q=${encodeURIComponent(query)}&limit=10`);
      const json = await res.json().catch(() => ({}));
      if (rid !== locReqIdRef.current) return;

      const arr = Array.isArray(json?.data) ? json.data : [];
      // Normalizamos campos
      const out: LocSuggestion[] = arr
        .map((it: any) => ({
          id: String(it.id || it._id || `${it.nombre}-${it.provincia}-${it.ccaa}`),
          nombre: String(it.nombre || ""),
          provincia: it.provincia ? String(it.provincia) : undefined,
          ccaa: it.ccaa ? String(it.ccaa) : undefined,
          comunidad: it.comunidad ? String(it.comunidad) : undefined,
        }))
        .filter((x) => x.nombre);

      setLocSug(out);
    } catch {
      if (rid !== locReqIdRef.current) return;
      setLocSug([]);
    } finally {
      if (rid === locReqIdRef.current) setLocLoading(false);
    }
  };

  // Sugerencias de localidad (debounced)
  useEffect(() => {
    if (locDebounceRef.current) clearTimeout(locDebounceRef.current);

    locDebounceRef.current = setTimeout(() => {
      // Si ya hay selectedLoc y el texto coincide, no spameamos sugerencias
      fetchLocalidades(locText);
    }, 250);

    return () => {
      if (locDebounceRef.current) clearTimeout(locDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locText]);

  const buildFiltros = () => {
    const filtros: any = {
      texto: query.trim(),
      categoria: categoria || "",
      page,
      limit: PAGE_SIZE,
    };

    // Filtro por localidad “exacta” (sin geo)
    if (selectedLoc?.nombre) {
      filtros.pueblo = cleanNombre(selectedLoc.nombre);
      if (selectedLoc.provincia) filtros.provincia = selectedLoc.provincia;
      if (selectedLoc.comunidad) filtros.comunidad = selectedLoc.comunidad;
    }

    if (!filtros.texto) delete filtros.texto;
    if (!filtros.categoria) delete filtros.categoria;

    return filtros;
  };

  const normalizeServiciosResponse = (res: any) => {
    const data =
      Array.isArray(res?.data) ? res.data :
      Array.isArray(res?.data?.data) ? res.data.data :
      Array.isArray(res?.items) ? res.items :
      [];

    const tpRaw = res?.totalPages ?? res?.data?.totalPages ?? 1;
    const tiRaw = res?.totalItems ?? res?.data?.totalItems ?? data.length;

    const tp = Math.max(1, Number(tpRaw || 1));
    const ti = Math.max(0, Number(tiRaw || 0));

    return { data, totalPages: tp, totalItems: ti };
  };

  const cargarServicios = async (opts?: { force?: boolean }) => {
    const force = !!opts?.force;
    const filtros = buildFiltros();

    const cacheKey = buildCacheKey({
      texto: filtros.texto || "",
      categoria: filtros.categoria || "",
      page,
      limit: PAGE_SIZE,
      pueblo: filtros.pueblo || "",
      provincia: filtros.provincia || "",
      comunidad: filtros.comunidad || "",
    });

    const now = Date.now();
    const cached = cacheRef.current.get(cacheKey);
    if (!force && cached && now - cached.ts < CACHE_TTL_MS) {
      setServicios(cached.data || []);
      setTotalPages(Math.max(1, cached.totalPages || 1));
      setTotalItems(Math.max(0, cached.totalItems || 0));
      setLoading(false);
      return;
    }

    setLoading(true);
    const rid = ++reqIdRef.current;

    try {
      const res = await getServicios(filtros);
      if (rid !== reqIdRef.current) return;

      const norm = normalizeServiciosResponse(res);
      const tp = norm.totalPages;
      const ti = norm.totalItems;
      const data = norm.data || [];

      if (ti === 0) {
        setServicios([]);
        setTotalItems(0);
        setTotalPages(1);
        cacheRef.current.set(cacheKey, { ts: Date.now(), data: [], totalPages: 1, totalItems: 0 });
        lastFetchTsRef.current = Date.now();
        if (page !== 1) setPage(1);
        return;
      }

      if (page > tp) {
        setTotalPages(tp);
        setTotalItems(ti);
        setPage(tp);
        return;
      }

      setServicios(data);
      setTotalPages(tp);
      setTotalItems(ti);

      cacheRef.current.set(cacheKey, { ts: Date.now(), data, totalPages: tp, totalItems: ti });
      lastFetchTsRef.current = Date.now();
    } catch (err) {
      if (rid !== reqIdRef.current) return;
      console.error("Error cargando servicios:", err);
      setServicios([]);
      setTotalPages(1);
      setTotalItems(0);
    } finally {
      if (rid === reqIdRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!userLoaded || !filtersReady) return;
    if (debounceServiciosRef.current) clearTimeout(debounceServiciosRef.current);

    debounceServiciosRef.current = setTimeout(() => {
      cargarServicios();
    }, DEBOUNCE_SERVICIOS);

    return () => {
      if (debounceServiciosRef.current) clearTimeout(debounceServiciosRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, categoria, page, selectedLoc, userLoaded, filtersReady]);

  // ✅ FIX PAGINACIÓN: sincronizar URL cuando cambian filtros o página
  // Sin esto, refrescar o compartir el link siempre volvía a página 1
  useEffect(() => {
    if (!filtersReady || typeof window === "undefined") return;

    const sp = new URLSearchParams(window.location.search);

    if (query.trim()) sp.set("texto", query.trim()); else sp.delete("texto");
    if (categoria) sp.set("categoria", categoria); else sp.delete("categoria");
    if (page > 1) sp.set("page", String(page)); else sp.delete("page");

    if (selectedLoc?.nombre) {
      sp.set("pueblo", selectedLoc.nombre);
      if (selectedLoc.provincia) sp.set("provincia", selectedLoc.provincia); else sp.delete("provincia");
      if (selectedLoc.comunidad) sp.set("comunidad", selectedLoc.comunidad); else sp.delete("comunidad");
    } else {
      sp.delete("pueblo");
      sp.delete("provincia");
      sp.delete("comunidad");
    }

    const newUrl = `${window.location.pathname}${sp.toString() ? "?" + sp.toString() : ""}`;
    if (newUrl !== window.location.pathname + window.location.search) {
      history.replaceState(null, "", newUrl);
    }
  }, [query, categoria, page, selectedLoc, filtersReady]);

  useEffect(() => {
    if (!userLoaded || !filtersReady) return;
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
  }, [userLoaded, filtersReady]);

  if (!userLoaded || !filtersReady) {
    return (
      <div className="text-center py-8" style={{ color: "var(--sb-ink2)" }}>
        Cargando datos…
      </div>
    );
  }

  const locLabel = selectedLoc?.nombre
    ? [cleanNombre(selectedLoc.nombre), selectedLoc.provincia, selectedLoc.comunidad].filter(Boolean).join(", ")
    : "";

  const inputBase =
    `w-full ${CONTROL_HEIGHT} rounded-2xl px-4 shadow-sm ` +
    `bg-white/80 backdrop-blur border ` +
    `focus:outline-none focus:ring-4 focus:ring-cyan-100`;

  const inputStyle: React.CSSProperties = {
    borderColor: "var(--sb-border)",
    color: "var(--sb-ink)",
  };

  const canPrev = page > 1 && !loading;
  const canNext = page < totalPages && totalItems > 0 && !loading;

  return (
    <div ref={rootRef}>
      <form
        onSubmit={(e) => e.preventDefault()}
        className="max-w-5xl mx-auto mb-8 grid grid-cols-1 md:grid-cols-5 gap-4"
      >
        {/* 1) Búsqueda libre multi-todo */}
        <input
          type="text"
          placeholder="Busca por oficio, nombre, descripción, localidad…"
          className={`md:col-span-2 ${inputBase}`}
          style={inputStyle}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
        />

        {/* 2) Localidad (sugerencias en vivo) */}
        <div className="md:col-span-2 relative">
          <input
            type="text"
            placeholder="Localidad (elige una sugerencia)…"
            className={`${inputBase}`}
            style={inputStyle}
            value={locText}
            onFocus={() => setLocOpen(true)}
            onChange={(e) => {
              const v = e.target.value;
              setLocText(v);
              setLocOpen(true);

              // Si el usuario edita, dejamos de confiar en la selección previa
              // (evita que filtre mal con una localidad vieja)
              setSelectedLoc(null);
              setPage(1);
            }}
          />

          {/* Helper debajo */}
          <div className="absolute left-4 right-4 -bottom-5 text-[11px] truncate" style={{ color: "var(--sb-ink2)" }}>
            {selectedLoc?.nombre ? `Filtrando por: ${locLabel}` : "Escribí y elegí una localidad para filtrar"}
          </div>

          {/* Dropdown sugerencias */}
          {locOpen && (locText.trim().length >= 2 || locSug.length > 0) && (
            <div
              className="absolute z-50 mt-2 w-full rounded-2xl border bg-white shadow-lg overflow-hidden"
              style={{ borderColor: "var(--sb-border)" }}
            >
              <div className="px-4 py-2 text-xs font-bold" style={{ color: "var(--sb-ink2)" }}>
                {locLoading ? "Buscando localidades…" : locSug.length ? "Sugerencias" : "Sin resultados"}
              </div>

              <div className="max-h-64 overflow-auto">
                {locSug.map((it) => {
                  const nombre = cleanNombre(it.nombre);
                  const comunidad = it.ccaa || it.comunidad || "";
                  const label = [nombre, it.provincia, comunidad].filter(Boolean).join(", ");
                  return (
                    <button
                      key={it.id}
                      type="button"
                      className="w-full text-left px-4 py-3 hover:bg-black/5"
                      onClick={() => {
                        setSelectedLoc({
                          id: it.id,
                          nombre,
                          provincia: it.provincia || undefined,
                          comunidad: comunidad || undefined,
                        });
                        setLocText(label);
                        setLocOpen(false);
                        setPage(1);
                      }}
                    >
                      <div className="text-sm font-extrabold truncate" style={{ color: "var(--sb-ink)" }}>
                        {nombre}
                      </div>
                      <div className="text-xs truncate" style={{ color: "var(--sb-ink2)" }}>
                        {[it.provincia, comunidad].filter(Boolean).join(" · ")}
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedLoc?.nombre && (
                <div className="p-3 border-t flex justify-between items-center" style={{ borderColor: "var(--sb-border)" }}>
                  <div className="text-xs font-bold" style={{ color: "var(--sb-ink2)" }}>
                    Filtro activo
                  </div>
                  <button
                    type="button"
                    className="text-xs font-extrabold underline"
                    style={{ color: "var(--sb-blue)" }}
                    onClick={() => {
                      setSelectedLoc(null);
                      setLocText("");
                      setLocSug([]);
                      setLocOpen(false);
                      setPage(1);
                    }}
                  >
                    Quitar localidad
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3) Categoría */}
        <select
          className={`${inputBase}`}
          style={inputStyle}
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

      {loading ? (
        <div className="text-center py-16" style={{ color: "var(--sb-ink2)" }}>
          Cargando…
        </div>
      ) : totalItems === 0 ? (
        <div className="text-center py-16" style={{ color: "var(--sb-ink2)" }}>
          ¡No se encontraron servicios!
        </div>
      ) : (
        <>
          <div className="max-w-5xl mx-auto mb-4 flex items-center justify-between px-1">
            <div className="text-sm font-bold" style={{ color: "var(--sb-ink)" }}>
              Resultados: {totalItems}
            </div>
            <div className="text-sm font-bold" style={{ color: "var(--sb-ink)" }}>
              Página {page} de {totalPages}
            </div>
          </div>

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

          <div className="max-w-5xl mx-auto">
            <GoogleAdIsland slot={SLOT_SEARCH} />
          </div>
        </>
      )}

      {/* paginación */}
      <div className="mt-10 flex justify-center items-center gap-4">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={!(page > 1) || loading}
          className="px-5 py-3 rounded-2xl border font-extrabold shadow-sm disabled:opacity-50"
          style={{
            background: "rgba(255,255,255,0.70)",
            borderColor: "var(--sb-border)",
            color: "var(--sb-ink)",
          }}
        >
          Anterior
        </button>

        <span className="font-bold" style={{ color: "var(--sb-ink)" }}>
          Página {page} / {totalPages}
        </span>

        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={!(page < totalPages && totalItems > 0) || loading}
          className="px-5 py-3 rounded-2xl border font-extrabold shadow-sm hover:brightness-[0.97] disabled:opacity-50"
          style={{
            background: "rgba(90, 208, 230, 0.18)",
            borderColor: "rgba(90, 208, 230, 0.35)",
            color: "var(--sb-ink)",
          }}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
};

export default SearchServiciosIsland;