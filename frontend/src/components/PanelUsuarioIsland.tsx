import React, { useEffect, useState } from "react";
import { onUserStateChange } from "../lib/firebase.js";
import UserServiciosIsland from "./UserServiciosIsland.tsx";
import FavoritosIsland from "./FavoritosIsland.tsx";

type Tab = "anuncios" | "favoritos";

const PanelUsuarioIsland: React.FC = () => {
  const [tab, setTab] = useState<Tab>("anuncios");
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const unsub = onUserStateChange((u: any) => setUser(u || null));
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, []);

  const displayName =
    user?.displayName ||
    user?.email?.split("@")?.[0] ||
    "Usuario";

  const email = user?.email || "";

  const handleChangeTab = (t: Tab) => setTab(t);

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px]">
        <header className="sb-card p-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt={displayName}
                className="w-12 h-12 rounded-full object-cover border"
                style={{ borderColor: "var(--sb-border)" }}
                referrerPolicy="no-referrer"
              />
            ) : (
              <div
                className="w-12 h-12 rounded-full grid place-items-center font-bold border"
                style={{
                  borderColor: "var(--sb-border)",
                  background: "rgba(15,118,110,0.12)",
                  color: "var(--sb-accent)",
                }}
              >
                {(displayName?.[0] || "U").toUpperCase()}
              </div>
            )}

            <div>
              <h1 className="text-2xl font-extrabold" style={{ color: "var(--sb-ink)" }}>
                Hola, {displayName}
              </h1>
              <p className="text-sm sb-muted">
                {email ? email : "Gestiona tus anuncios y revisa tus favoritos."}
              </p>
            </div>
          </div>

          <a
            href="/ofrecer"
            className="inline-flex items-center justify-center px-4 py-2 rounded-xl shadow text-sm font-bold border"
            style={{
              background: "var(--sb-accent)",
              color: "white",
              borderColor: "rgba(0,0,0,0.05)",
            }}
          >
            Publicar nuevo servicio
          </a>
        </header>

        <div className="mt-5 flex justify-center">
          <div
            className="inline-flex items-center rounded-2xl p-1 border"
            style={{
              background: "rgba(15,118,110,0.08)",
              borderColor: "rgba(15,118,110,0.18)",
            }}
          >
            <button
              type="button"
              onClick={() => handleChangeTab("anuncios")}
              className={`px-4 py-2 rounded-xl text-sm font-extrabold transition ${
                tab === "anuncios"
                  ? "bg-white shadow"
                  : "hover:bg-white/40"
              }`}
              style={{
                color: tab === "anuncios" ? "var(--sb-ink)" : "rgba(15,118,110,0.95)",
              }}
            >
              Mis servicios
            </button>

            <button
              type="button"
              onClick={() => handleChangeTab("favoritos")}
              className={`px-4 py-2 rounded-xl text-sm font-extrabold transition ${
                tab === "favoritos"
                  ? "bg-white shadow"
                  : "hover:bg-white/40"
              }`}
              style={{
                color: tab === "favoritos" ? "var(--sb-ink)" : "rgba(15,118,110,0.95)",
              }}
            >
              Favoritos
            </button>
          </div>
        </div>

        <div className="mt-5">
          <div style={{ display: tab === "anuncios" ? "block" : "none" }}>
            <UserServiciosIsland />
          </div>
          <div style={{ display: tab === "favoritos" ? "block" : "none" }}>
            <FavoritosIsland />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PanelUsuarioIsland;
