import React, { useEffect, useState } from "react";
import UserServiciosIsland from "./UserServiciosIsland.tsx";
import FavoritosIsland from "./FavoritosIsland.tsx";
import { onUserStateChange } from "../lib/firebase.js";

type TabKey = "anuncios" | "favoritos";

function getTabFromQuery(): TabKey {
  if (typeof window === "undefined") return "anuncios";
  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab");
  if (tab === "favoritos") return "favoritos";
  return "anuncios";
}

function setTabInQuery(tab: TabKey) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("tab", tab);
  window.history.replaceState({}, "", url.toString());
}

const PanelUsuarioIsland: React.FC = () => {
  const [user, setUser] = useState<any | null | undefined>(undefined);
  const [tab, setTab] = useState<TabKey>("anuncios");

  useEffect(() => {
    const unsub = onUserStateChange((u: any) => setUser(u));
    return () => unsub && unsub();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setTab(getTabFromQuery());

    const handlePop = () => {
      setTab(getTabFromQuery());
    };

    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, []);

  const handleChangeTab = (next: TabKey) => {
    setTab(next);
    setTabInQuery(next);
  };

  if (user === undefined) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-sky-700 text-lg">
          Cargando tu panel…
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <h2 className="text-2xl font-bold text-slate-900 mb-3">
          Inicia sesión para ver tu panel
        </h2>
        <p className="text-slate-600 mb-6 max-w-md">
          Desde aquí podrás gestionar tus anuncios y ver tus servicios
          favoritos en EnMiPueblo.
        </p>
        <button
          className="bg-teal-600 text-white px-6 py-3 rounded-xl shadow hover:bg-teal-700"
          onClick={() =>
            (window as any).showAuthModal &&
            (window as any).showAuthModal()
          }
        >
          Iniciar sesión
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] w-full flex items-center justify-center bg-gradient-to-br from-cyan-50 via-white to-teal-50">
      <div className="w-full max-w-5xl bg-white rounded-3xl shadow-2xl border border-slate-200 p-6 md:p-8 space-y-6">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            {user.photoURL && (
              <img
                src={user.photoURL}
                alt={user.displayName || user.email}
                className="w-12 h-12 rounded-full object-cover border border-slate-200"
              />
            )}
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Hola, {user.displayName || user.email}
              </h1>
              <p className="text-sm text-slate-600">
                Gestiona tus anuncios y revisa tus favoritos desde un solo lugar.
              </p>
            </div>
          </div>

          <a
            href="/ofrecer"
            className="inline-flex items-center justify-center bg-teal-600 text-white px-4 py-2 rounded-xl shadow hover:bg-teal-700 text-sm"
          >
            Publicar nuevo servicio
          </a>
        </header>

        <div className="flex justify-center">
          <div className="inline-flex items-center bg-cyan-50 border border-cyan-100 rounded-2xl p-1">
            <button
              type="button"
              onClick={() => handleChangeTab("anuncios")}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition
                ${
                  tab === "anuncios"
                    ? "bg-white text-sky-900 shadow"
                    : "text-sky-800 hover:bg-cyan-100"
                }`}
            >
              Mis servicios
            </button>
            <button
              type="button"
              onClick={() => handleChangeTab("favoritos")}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition
                ${
                  tab === "favoritos"
                    ? "bg-white text-sky-900 shadow"
                    : "text-sky-800 hover:bg-cyan-100"
                }`}
            >
              Favoritos
            </button>
          </div>
        </div>

        <div className="mt-4">
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
