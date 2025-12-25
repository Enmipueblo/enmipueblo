import React, { useEffect, useMemo, useRef, useState } from "react";
import { buscarLocalidades, geocodeES } from "../lib/api-utils.js";

type Picked = {
  nombre: string;
  provincia?: string;
  comunidad?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
};

type Props = {
  open: boolean;
  title?: string;
  showRadius?: boolean;
  initialRadiusKm?: number;
  initialValueText?: string;
  initialLat?: number | null;
  initialLng?: number | null;
  onClose: () => void;
  onApply: (picked: Picked) => void;
};

function ensureLeafletCss() {
  const id = "leaflet-css";
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  document.head.appendChild(link);
}

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

export default function LocationPickerModal({
  open,
  title = "Ubicación",
  showRadius = true,
  initialRadiusKm = 25,
  initialValueText = "",
  initialLat = null,
  initialLng = null,
  onClose,
  onApply,
}: Props) {
  const [q, setQ] = useState(initialValueText);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loadingSug, setLoadingSug] = useState(false);

  const [nombre, setNombre] = useState("");
  const [provincia, setProvincia] = useState("");
  const [comunidad, setComunidad] = useState("");

  const [lat, setLat] = useState<number | null>(initialLat);
  const [lng, setLng] = useState<number | null>(initialLng);
  const [radiusKm, setRadiusKm] = useState<number>(initialRadiusKm);

  const mapHostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);

  const canApply = useMemo(() => !!nombre, [nombre]);

  // reset al abrir
  useEffect(() => {
    if (!open) return;
    setQ(initialValueText || "");
    setSuggestions([]);
    setNombre("");
    setProvincia("");
    setComunidad("");
    setRadiusKm(initialRadiusKm);

    setLat(initialLat);
    setLng(initialLng);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // autocomplete
  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) {
      setSuggestions([]);
      return;
    }
    let alive = true;
    setLoadingSug(true);

    const t = setTimeout(async () => {
      try {
        const { data } = await buscarLocalidades(term);
        if (!alive) return;
        setSuggestions(data || []);
      } catch {
        if (!alive) return;
        setSuggestions([]);
      } finally {
        if (alive) setLoadingSug(false);
      }
    }, 220);

    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, open]);

  // init map (solo cuando open)
  useEffect(() => {
    if (!open) return;
    if (!mapHostRef.current) return;

    let destroyed = false;

    (async () => {
      try {
        ensureLeafletCss();
        const mod = await import("leaflet");
        if (destroyed) return;

        const L: any = (mod as any).default ?? mod;
        leafletRef.current = L;

        // si ya existe, no recrear
        if (mapRef.current) return;

        const startLat = Number.isFinite(lat as any) ? (lat as number) : 40.4168;
        const startLng = Number.isFinite(lng as any) ? (lng as number) : -3.7038;

        const map = L.map(mapHostRef.current, {
          zoomControl: true,
          preferCanvas: true,
        }).setView([startLat, startLng], Number.isFinite(lat as any) ? 11 : 6);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap",
          maxZoom: 19,
        }).addTo(map);

        map.on("click", (e: any) => {
          const { lat: clat, lng: clng } = e.latlng || {};
          if (!Number.isFinite(clat) || !Number.isFinite(clng)) return;
          setLat(clat);
          setLng(clng);
          setNombre((prev) => prev || q.trim()); // si no eligió localidad, al menos algo
          drawMarker(clat, clng, radiusKm, showRadius);
        });

        mapRef.current = map;

        // pintar marker inicial
        if (Number.isFinite(lat as any) && Number.isFinite(lng as any)) {
          drawMarker(lat as number, lng as number, radiusKm, showRadius);
        }
      } catch (e) {
        console.error("Leaflet init error", e);
      }
    })();

    return () => {
      destroyed = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // actualizar círculo cuando cambia radio
  useEffect(() => {
    if (!open) return;
    if (!Number.isFinite(lat as any) || !Number.isFinite(lng as any)) return;
    drawMarker(lat as number, lng as number, radiusKm, showRadius);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radiusKm, showRadius, open]);

  // cleanup al cerrar
  useEffect(() => {
    if (open) return;
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    }
  }, [open]);

  function drawMarker(mLat: number, mLng: number, rKm: number, withRadius: boolean) {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    if (!markerRef.current) {
      markerRef.current = L.circleMarker([mLat, mLng], {
        radius: 8,
        weight: 2,
        opacity: 0.9,
        fillOpacity: 0.9,
      }).addTo(map);
    } else {
      markerRef.current.setLatLng([mLat, mLng]);
    }

    if (withRadius) {
      const meters = Math.max(1, rKm) * 1000;
      if (!circleRef.current) {
        circleRef.current = L.circle([mLat, mLng], {
          radius: meters,
          weight: 1,
          opacity: 0.4,
          fillOpacity: 0.12,
        }).addTo(map);
      } else {
        circleRef.current.setLatLng([mLat, mLng]);
        circleRef.current.setRadius(meters);
      }
    } else if (circleRef.current) {
      map.removeLayer(circleRef.current);
      circleRef.current = null;
    }

    map.setView([mLat, mLng], Math.max(map.getZoom(), 11), { animate: true });
  }

  async function pickLocalidad(loc: any) {
    const prov = getProvinciaNombre(loc);
    const ccaa = getCcaaNombre(loc);

    setNombre(loc.nombre);
    setProvincia(prov);
    setComunidad(ccaa);

    const text = [loc.nombre, prov, ccaa, "España"].filter(Boolean).join(", ");
    setQ(text);
    setSuggestions([]);

    // geocode -> coords
    try {
      const geo = await geocodeES(text);
      if (geo?.lat && geo?.lng) {
        setLat(geo.lat);
        setLng(geo.lng);
        drawMarker(geo.lat, geo.lng, radiusKm, showRadius);
      }
    } catch {}
  }

  function apply() {
    if (!canApply) return;
    onApply({
      nombre,
      provincia,
      comunidad,
      lat: Number.isFinite(lat as any) ? (lat as number) : undefined,
      lng: Number.isFinite(lng as any) ? (lng as number) : undefined,
      radiusKm: showRadius ? radiusKm : undefined,
    });
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]" onMouseDown={onClose} />

      <div
        className="relative w-full max-w-3xl rounded-3xl bg-white border border-emerald-100 shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        <div className="px-5 py-4 border-b border-emerald-100 bg-gradient-to-r from-emerald-50 via-violet-50/40 to-white">
          <div className="flex items-center justify-between gap-3">
            <div className="font-extrabold text-emerald-950">{title}</div>
            <button
              type="button"
              onClick={onClose}
              className="h-9 w-9 rounded-full border border-emerald-200 bg-white/80 hover:bg-white text-emerald-900"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>

          <div className="mt-3 flex gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Busca un pueblo…"
              className="flex-1 rounded-2xl border border-emerald-200 bg-white px-4 py-3 shadow-sm focus:outline-none focus:ring-4 focus:ring-emerald-100"
            />
            <button
              type="button"
              onClick={() => {
                setNombre("");
                setProvincia("");
                setComunidad("");
                setLat(null);
                setLng(null);
                setSuggestions([]);
              }}
              className="rounded-2xl px-4 py-3 border border-emerald-200 bg-white/80 hover:bg-white text-emerald-900 font-semibold"
            >
              Limpiar
            </button>
          </div>

          {loadingSug && (
            <div className="mt-2 text-xs text-slate-500">Buscando…</div>
          )}

          {!!suggestions.length && (
            <div className="mt-2 max-h-56 overflow-auto rounded-2xl border border-emerald-100 bg-white shadow-lg">
              {suggestions.slice(0, 40).map((loc: any) => {
                const prov = getProvinciaNombre(loc);
                const ccaa = getCcaaNombre(loc);
                return (
                  <button
                    key={loc.id ?? loc.municipio_id ?? loc.nombre}
                    type="button"
                    onClick={() => pickLocalidad(loc)}
                    className="w-full text-left px-4 py-2 hover:bg-emerald-50"
                  >
                    <div className="font-bold text-emerald-950">{loc.nombre}</div>
                    <div className="text-xs text-slate-500">
                      {[prov, ccaa].filter(Boolean).join(" · ")}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-5">
          <div
            ref={mapHostRef}
            className="w-full h-[320px] rounded-2xl overflow-hidden border border-emerald-100"
          />

          {showRadius && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-sm">
                <div className="font-semibold text-emerald-950">Distancia</div>
                <div className="text-slate-600">{radiusKm} km</div>
              </div>
              <input
                type="range"
                min={1}
                max={200}
                value={radiusKm}
                onChange={(e) => setRadiusKm(parseInt(e.target.value, 10))}
                className="w-full mt-2 accent-emerald-400"
              />
            </div>
          )}

          <div className="mt-5 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-3 rounded-2xl border border-emerald-200 bg-white/80 hover:bg-white text-emerald-900 font-semibold"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={!canApply}
              className="px-5 py-3 rounded-2xl bg-emerald-300 hover:bg-emerald-400 text-emerald-950 font-extrabold disabled:opacity-50 disabled:hover:bg-emerald-300"
            >
              Aplicar
            </button>
          </div>

          <div className="mt-3 text-xs text-slate-500">
            Tip: puedes hacer clic en el mapa para ajustar el punto exacto.
          </div>
        </div>
      </div>
    </div>
  );
}
