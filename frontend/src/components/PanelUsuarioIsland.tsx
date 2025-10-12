import React, { useState, useEffect } from 'react';
import UserServiciosIsland from './UserServiciosIsland.tsx';
import FavoritosIsland from './FavoritosIsland.tsx';
import { onUserStateChange } from '../lib/firebase.js';

// 🟢 NUEVO: sincroniza pestaña con query string (tab)
function getTabFromQuery() {
  if (typeof window === 'undefined') return 'panel';
  const urlParams = new URLSearchParams(window.location.search);
  const tab = urlParams.get('tab');
  if (tab === 'anuncios' || tab === 'favoritos' || tab === 'panel') return tab;
  return 'panel';
}

function setTabInQuery(tab: string) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.set('tab', tab);
  window.history.replaceState({}, '', url.toString());
}

const tabs = [
  { id: 'panel', label: 'Panel' },
  { id: 'anuncios', label: 'Mis Anuncios' },
  { id: 'favoritos', label: 'Favoritos' },
];

const PanelUsuarioIsland = () => {
  const [tab, setTab] = useState<'panel' | 'anuncios' | 'favoritos'>(
    () => getTabFromQuery() as any,
  );
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const unsub = onUserStateChange(u => setUser(u));
    return () => unsub && unsub();
  }, []);

  useEffect(() => {
    if (user === null) return;
    if (!user) window.location.href = '/';
  }, [user]);

  useEffect(() => {
    setTabInQuery(tab);
  }, [tab]);
  useEffect(() => {
    function onPopState() {
      setTab(getTabFromQuery() as any);
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-emerald-700 text-lg">
          Cargando tu panel seguro...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] w-full flex items-center justify-center bg-gradient-to-br from-green-50 via-white to-emerald-50">
      <div className="w-full max-w-5xl bg-white rounded-3xl shadow-2xl border border-emerald-100 p-8 md:p-12 my-8">
        {/* TABS */}
        <div className="flex justify-center gap-2 md:gap-8 mb-10">
          {tabs.map(t => (
            <button
              key={t.id}
              className={`
                px-6 py-2 md:text-xl text-base font-bold rounded-xl transition 
                ${
                  tab === t.id
                    ? 'bg-emerald-700 text-white shadow-md scale-105'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }
              `}
              style={{ transition: 'all .18s cubic-bezier(.6,.2,.19,1)' }}
              onClick={() => setTab(t.id as any)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* PANEL */}
        <div className="pt-2">
          {/* PANEL principal */}
          <div style={{ display: tab === 'panel' ? 'block' : 'none' }}>
            <div className="flex flex-col items-center max-w-2xl mx-auto">
              <div className="bg-gradient-to-br from-emerald-100 to-green-50 rounded-full p-3 shadow-lg mb-4">
                <svg
                  className="w-20 h-20 text-emerald-700"
                  fill="none"
                  viewBox="0 0 48 48"
                  stroke="currentColor"
                >
                  <circle
                    cx="24"
                    cy="24"
                    r="22"
                    strokeWidth="2"
                    stroke="currentColor"
                    fill="white"
                  />
                  <circle cx="24" cy="20" r="8" fill="currentColor" />
                  <ellipse
                    cx="24"
                    cy="36"
                    rx="12"
                    ry="6"
                    fill="currentColor"
                    fillOpacity="0.13"
                  />
                </svg>
              </div>
              <h2 className="text-3xl font-bold text-emerald-800 mb-1">
                ¡Hola!
              </h2>
              <p className="text-xl font-semibold mb-2 text-emerald-700">
                {user.email}
              </p>
              <div className="mb-4 text-gray-500">
                Miembro desde{' '}
                <span className="font-semibold text-emerald-700">
                  {user.metadata?.creationTime
                    ? new Date(user.metadata.creationTime).toLocaleDateString(
                        'es-ES',
                        {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        },
                      )
                    : '¿?'}
                </span>
              </div>
              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 shadow-inner">
                <p className="text-lg text-emerald-900">
                  Bienvenido a tu panel privado. Desde aquí puedes editar tus
                  anuncios, revisar favoritos y personalizar tu experiencia.
                </p>
              </div>
            </div>
          </div>

          {/* 🟢 LOS DOS ISLANDS SE MONTAN SIEMPRE, SOLO SE OCULTAN */}
          <div style={{ display: tab === 'anuncios' ? 'block' : 'none' }}>
            <UserServiciosIsland />
          </div>
          <div style={{ display: tab === 'favoritos' ? 'block' : 'none' }}>
            <FavoritosIsland />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PanelUsuarioIsland;
