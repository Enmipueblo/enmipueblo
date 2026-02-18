// frontend/src/components/PanelUsuarioIsland.tsx
import React, { useEffect, useMemo, useState } from "react";
import { onUserStateChange } from "../lib/firebase.js";

type User = {
  email?: string;
  name?: string;
  picture?: string;
};

export default function PanelUsuarioIsland() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsub = onUserStateChange((u: any) => setUser(u || null));
    return () => unsub?.();
  }, []);

  const title = useMemo(() => {
    if (!user) return "Mi panel";
    return user.name ? `Hola, ${user.name}` : "Hola";
  }, [user]);

  return (
    <section className="w-full">
      <div className="sb-container py-10">
        <div
          className="rounded-3xl border shadow-[0_20px_60px_-40px_rgba(0,0,0,0.45)] p-6 md:p-8"
          style={{
            background: "rgba(255,255,255,0.60)",
            borderColor: "var(--sb-border)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-extrabold" style={{ color: "var(--sb-ink)" }}>
                {title}
              </h1>
              <p className="mt-1 text-sm md:text-base" style={{ color: "var(--sb-ink2)" }}>
                Gestiona tus servicios, favoritos y destaca tus anuncios.
              </p>
            </div>

            <a
              href="/ofrecer"
              className="inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-extrabold shadow-sm border transition hover:opacity-90"
              style={{
                background: "var(--sb-blue)",
                color: "#fff",
                borderColor: "rgba(0,0,0,0.08)",
              }}
            >
              Publicar servicio
            </a>
          </div>

          {!user && (
            <div className="mt-6 rounded-2xl border p-4" style={{ borderColor: "rgba(15,23,42,0.10)" }}>
              <p className="text-sm" style={{ color: "var(--sb-ink2)" }}>
                Inicia sesión para ver tu panel.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
