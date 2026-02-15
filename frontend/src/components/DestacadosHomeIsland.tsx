import React, { useEffect, useMemo, useState } from "react";

type Item = {
  id?: string | number;
  title?: string;
  name?: string;
  subtitle?: string;
  category?: string;
  city?: string;
  href?: string;
  image?: string;
};

function normalizeItems(data: any): Item[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.data)) return data.data;
  return [];
}

export default function DestacadosHomeIsland() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const endpoints = useMemo(
    () => [
      "/api/servicios/destacados?limit=18",
      "/api/destacados?limit=18",
      "/api/featured?limit=18",
    ],
    []
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setErr(null);

      for (const url of endpoints) {
        try {
          const res = await fetch(url, { headers: { "accept": "application/json" } });
          if (!res.ok) continue;

          const json = await res.json();
          const list = normalizeItems(json);

          if (!cancelled) {
            setItems(list);
            setLoading(false);
          }
          return;
        } catch {
          continue;
        }
      }

      if (!cancelled) {
        setItems([]);
        setErr("No se pudieron cargar los destacados.");
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [endpoints]);

  if (loading) return <div className="mt-6 text-sm text-stone-700">Cargando servicios destacados…</div>;
  if (err && items.length === 0) return <div className="mt-6 text-sm text-stone-700">{err}</div>;

  return (
    <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.slice(0, 18).map((it, idx) => {
        const id = it.id ?? idx;
        const title = it.title ?? it.name ?? "Servicio destacado";
        const subtitle = it.subtitle ?? it.category ?? it.city ?? "";
        const href = it.href ?? (it.id != null ? `/servicio/${it.id}` : "#");
        const image = it.image;

        return (
          <a
            key={String(id)}
            href={href}
            className="group rounded-3xl border bg-white/70 backdrop-blur shadow-[0_18px_50px_-42px_rgba(0,0,0,0.35)] overflow-hidden hover:bg-white"
            style={{ borderColor: "var(--sb-border)" }}
          >
            <div className="p-5">
              <div className="flex items-start gap-4">
                <div
                  className="h-14 w-14 rounded-2xl border overflow-hidden bg-white shrink-0"
                  style={{ borderColor: "var(--sb-border)" }}
                >
                  {image ? (
                    <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="h-full w-full grid place-items-center text-xl">⭐</div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-extrabold truncate" style={{ color: "var(--sb-ink)" }}>
                    {title}
                  </div>
                  {subtitle ? (
                    <div className="mt-1 text-xs truncate" style={{ color: "var(--sb-ink2)" }}>
                      {subtitle}
                    </div>
                  ) : null}
                  <div className="mt-3 inline-flex items-center text-xs font-semibold" style={{ color: "var(--sb-muted)" }}>
                    Ver detalle →
                  </div>
                </div>
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
}
