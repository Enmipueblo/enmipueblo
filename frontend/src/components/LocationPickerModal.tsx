import React, { useEffect, useMemo, useRef, useState } from "react";

type LocHit = {
  id?: string;
  nombre: string;
  provincia?: string;
  ccaa?: string;
  lat?: number;
  lng?: number;
};

type ApplyPayload = {
  nombre: string;
  provincia?: string;
  comunidad?: string;
  lat?: number | null;
  lng?: number | null;
  radiusKm?: number | null;
};

type Props = {
  open: boolean;
  title?: string;

  // compat con versiones viejas (aunque ya no uses mapa)
  showRadius?: boolean;
  initialRadiusKm?: number;
  initialValueText?: string;
  initialLat?: number | null;
  initialLng?: number | null;

  onClose: () => void;
  onApply: (p: ApplyPayload) => void;
};

const CONTROL_HEIGHT = "h-[48px]";

function joinLabel(nombre?: string, provincia?: string, ccaa?: string) {
  return [nombre, provincia, ccaa].filter(Boolean).join(", ");
}

const LocationPickerModal: React.FC<Props> = ({
  open,
  title = "Elegir localidad",
  showRadius = false,
  initialRadiusKm = 25,
  initialValueText = "",
  initialLat = null,
  initialLng = null,
  onClose,
  onApply,
}) => {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<LocHit[]>([]);
  const [picked, setPicked] = useState<LocHit | null>(null);

  // compat: si alguna pantalla aún muestra radio, lo dejamos.
  const [radiusKm, setRadiusKm] = useState<number>(initialRadiusKm);

  const lastReqRef = useRef(0);
  const debounceRef = useRef<any>(null);

  const inputBase =
    `w-full ${CONTROL_HEIGHT} rounded-2xl px-4 shadow-sm ` +
    `bg-white/80 backdrop-blur border ` +
    `focus:outline-none focus:ring-4 focus:ring-cyan-100`;

  const inputStyle: React.CSSProperties = {
    borderColor: "var(--sb-border)",
    color: "var(--sb-ink)",
  };

  const pickedLabel = useMemo(() => {
    if (!picked) return "";
    return joinLabel(picked.nombre, picked.provincia, picked.ccaa);
  }, [picked]);

  useEffect(() => {
    if (!open) return;

    // reset al abrir
    setItems([]);
    setLoading(false);
    setPicked(null);
    setRadiusKm(initialRadiusKm);

    // Si viene texto inicial, lo usamos como query para ayudar
    const seed = String(initialValueText || "").trim();
    setQ(seed);

    // No auto-apply, solo prellenar búsqueda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function fetchLocalidades(text: string) {
    const id = ++lastReqRef.current;
    setLoading(true);

    try {
      const res = await fetch(`/api/localidades?q=${encodeURIComponent(text)}`);
      const json = await res.json().catch(() => ({}));
      const arr: LocHit[] = Array.isArray(json?.data) ? json.data : [];
      if (id !== lastReqRef.current) return;

      setItems(arr.slice(0, 12));
    } catch {
      if (id !== lastReqRef.current) return;
      setItems([]);
    } finally {
      if (id === lastReqRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;

    const text = String(q || "").trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (text.length < 2) {
      setItems([]);
      setLoading(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      fetchLocalidades(text);
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center px-4">
      {/* overlay */}
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-label="Cerrar"
      />

      {/* modal */}
      <div
        className="relative w-full max-w-xl rounded-3xl bg-white/90 backdrop-blur ring-1 ring-black/10 shadow-2xl overflow-hidden"
        style={{ color: "var(--sb-ink)" }}
      >
        <div className="p-5 sm:p-6 border-b" style={{ borderColor: "var(--sb-border)" }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-lg sm:text-xl font-black">{title}</div>
              <div className="text-sm mt-1" style={{ color: "var(--sb-ink2)" }}>
                Escribe y elige una localidad. (Sin mapa)
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl px-3 py-2 font-extrabold border bg-white/70 hover:bg-white"
              style={{ borderColor: "var(--sb-border)" }}
            >
              Cerrar
            </button>
          </div>

          <div className="mt-4">
            <input
              className={inputBase}
              style={inputStyle}
              placeholder="Buscar localidad… (Graus, Capella, Huesca...)"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPicked(null);
              }}
              autoFocus
            />
          </div>

          {showRadius && (
            <div className="mt-4">
              <label className="text-sm font-extrabold" style={{ color: "var(--sb-ink2)" }}>
                Radio (km)
              </label>
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={300}
                  value={radiusKm}
                  onChange={(e) => setRadiusKm(Number(e.target.value))}
                  className="w-full"
                />
                <div className="text-sm font-black w-16 text-right">{radiusKm} km</div>
              </div>
              <div className="text-xs mt-1" style={{ color: "var(--sb-ink2)" }}>
                (Compatibilidad) Si ya no lo usas, puedes pasar showRadius=false desde el caller.
              </div>
            </div>
          )}
        </div>

        <div className="p-2 sm:p-3 max-h-[55vh] overflow-auto">
          {loading ? (
            <div className="py-10 text-center text-sm" style={{ color: "var(--sb-ink2)" }}>
              Buscando…
            </div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center text-sm" style={{ color: "var(--sb-ink2)" }}>
              Escribe al menos 2 letras para ver sugerencias.
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((it) => {
                const isSel = picked?.nombre === it.nombre && picked?.provincia === it.provincia;
                return (
                  <button
                    key={it.id || joinLabel(it.nombre, it.provincia, it.ccaa)}
                    type="button"
                    onClick={() => setPicked(it)}
                    className={
                      "w-full text-left rounded-2xl px-4 py-3 border hover:bg-black/5 " +
                      (isSel ? "bg-black/5" : "bg-white/60")
                    }
                    style={{ borderColor: "var(--sb-border)" }}
                  >
                    <div className="font-black">{it.nombre}</div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--sb-ink2)" }}>
                      {[it.provincia, it.ccaa].filter(Boolean).join(" · ")}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-5 sm:p-6 border-t flex items-center justify-between gap-3" style={{ borderColor: "var(--sb-border)" }}>
          <div className="text-sm" style={{ color: "var(--sb-ink2)" }}>
            {picked ? (
              <>
                Seleccionado: <span className="font-extrabold" style={{ color: "var(--sb-ink)" }}>{pickedLabel}</span>
              </>
            ) : (
              "Selecciona una localidad de la lista."
            )}
          </div>

          <button
            type="button"
            disabled={!picked}
            onClick={() => {
              if (!picked) return;

              onApply({
                nombre: picked.nombre,
                provincia: picked.provincia || undefined,
                comunidad: picked.ccaa || undefined,

                // ya no usamos mapa; dejamos null para compat
                lat: typeof picked.lat === "number" ? picked.lat : initialLat ?? null,
                lng: typeof picked.lng === "number" ? picked.lng : initialLng ?? null,

                radiusKm: showRadius ? radiusKm : null,
              });

              onClose();
            }}
            className="rounded-2xl px-5 py-3 font-extrabold text-white disabled:opacity-50"
            style={{ background: "var(--sb-accent2)" }}
          >
            Usar localidad
          </button>
        </div>
      </div>
    </div>
  );
};

export default LocationPickerModal;