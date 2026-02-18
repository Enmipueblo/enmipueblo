// frontend/src/components/PanelUsuarioIsland.tsx
import React, { useEffect, useMemo, useState } from "react";
import { onUserStateChange } from "../lib/firebase.js";
import UserServiciosIsland from "./UserServiciosIsland";
import FavoritosIsland from "./FavoritosIsland";

type User = {
  email?: string;
  name?: string;
  picture?: string;
};

type TabKey = "servicios" | "favoritos";

export default function PanelUsuarioIsland() {
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<TabKey>("servicios");

  useEffect(() => {
    const unsub = onUserStateChange((u: any) => setUser(u || null));
    return () => unsub?.();
  }, []);

  const title = useMemo(() => {
    if (!user) return "Mi panel";
    return user.name ? `Hola, ${user.name}` : "Hola";
  }, [user]);

  const TabButton = ({ k, label }: { k: TabKey; label: string }) => {
    const active = tab === k;
    return (
      <button
        type="button"
        onClick={() => setTab(k)}
        className={
          "px-4 py-2 rounded-2xl text-sm font-extrabold border transition " +
          (active ? "shadow-sm" : "hover:bg-white/60")
        }
        style={{
          background: active ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.55)",
          borderColor: "var(--sb-border)",
          color: "var(--sb-ink)",
          backdropFilter: "blur(10px)",
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <section className="w-full">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            {user?.picture ? (
              <img
                src={user.picture}
                alt=""
                className="h-12 w-12 rounded-2xl object-cover border"
                style={{ borderColor: "rgba(0,0,0,0.08)" }}
                referrerPolicy="no-referrer"
              />
            ) : (
              <div
                className="h-12 w-12 rounded-2xl grid place-items-center border"
                style={{
                  background: "rgba(14,165,164,0.12)",
                  borderColor: "rgba(14,165,164,0.22)",
                  color: "var(--sb-ink)",
                }}
              >
                <span className="font-extrabold">
                  {(user?.name || user?.email || "U").slice(0, 1).toUpperCase()}
                </span>
              </div>
            )}

            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold" style={{ color: "var(--sb-ink)" }}>
                {title}
              </h2>
              <p className="mt-1 text-sm" style={{ color: "var(--sb-ink2)" }}>
                Gestiona tus servicios y favoritos.
              </p>
              {user?.email && (
                <p className="mt-1 text-xs" style={{ color: "var(--sb-ink2)" }}>
                  {user.email}
                </p>
              )}
            </div>
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
          <div
            className="rounded-2xl border p-4 text-sm"
            style={{ background: "rgba(255,255,255,0.60)", borderColor: "var(--sb-border)", color: "var(--sb-ink2)" }}
          >
            Inicia sesión (botón arriba a la derecha) para ver tu panel.
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <TabButton k="servicios" label="Mis servicios" />
          <TabButton k="favoritos" label="Favoritos" />
        </div>

        <div
          className="rounded-3xl border p-4 sm:p-6"
          style={{
            background: "rgba(255,255,255,0.60)",
            borderColor: "var(--sb-border)",
            backdropFilter: "blur(12px)",
          }}
        >
          {tab === "servicios" ? <UserServiciosIsland /> : <FavoritosIsland />}
        </div>
      </div>
    </section>
  );
}
