import React, { useEffect, useState } from "react";

type ConsentState = {
  ads: boolean;
  analytics: boolean;
};

const LS_KEY = "cmp.consent.v1";

declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
    adsbygoogle: any[];
    openCookieSettings?: () => void;

    __enmiLoadAdsense?: () => void;
  }
}

function dispatchConsent(state: ConsentState) {
  try {
    window.dispatchEvent(
      new CustomEvent("enmi:cmp", { detail: { consent: state } })
    );
  } catch {}
}

function applyConsent(state: ConsentState) {
  // Consent Mode v2 (si existe gtag)
  const granted = {
    ad_storage: state.ads ? "granted" : "denied",
    ad_user_data: state.ads ? "granted" : "denied",
    ad_personalization: state.ads ? "granted" : "denied",
    analytics_storage: state.analytics ? "granted" : "denied",
  };

  try {
    if (typeof window.gtag === "function") {
      window.gtag("consent", "update", granted);
    } else {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(["consent", "update", granted]);
    }
  } catch {}

  // AdSense: NO pedir anuncios sin consentimiento
  try {
    window.adsbygoogle = window.adsbygoogle || [];
    window.adsbygoogle.requestNonPersonalizedAds = state.ads ? 0 : 1;
    window.adsbygoogle.pauseAdRequests = state.ads ? 0 : 1;

    if (state.ads) {
      window.__enmiLoadAdsense?.();
    }
  } catch {}

  dispatchConsent(state);
}

export default function CookieConsentIsland() {
  const [visible, setVisible] = useState(false);
  const [panel, setPanel] = useState(false);
  const [consent, setConsent] = useState<ConsentState>({
    ads: false,
    analytics: false,
  });

  useEffect(() => {
    window.openCookieSettings = () => {
      setPanel(true);
      setVisible(true);
    };

    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      const parsed: ConsentState = JSON.parse(saved);
      setConsent(parsed);
      applyConsent(parsed);
      setVisible(false);
    } else {
      setVisible(true);
    }
  }, []);

  const acceptAll = () => {
    const st = { ads: true, analytics: true };
    localStorage.setItem(LS_KEY, JSON.stringify(st));
    setConsent(st);
    applyConsent(st);
    setPanel(false);
    setVisible(false);
  };

  const rejectAll = () => {
    const st = { ads: false, analytics: false };
    localStorage.setItem(LS_KEY, JSON.stringify(st));
    setConsent(st);
    applyConsent(st);
    setPanel(false);
    setVisible(false);
  };

  const saveCustom = () => {
    localStorage.setItem(LS_KEY, JSON.stringify(consent));
    applyConsent(consent);
    setPanel(false);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[9999]">
      <div className="mx-auto max-w-3xl m-4 rounded-2xl shadow-2xl border border-emerald-200 bg-white p-4">
        {!panel ? (
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="text-sm text-gray-700">
              Usamos cookies para funciones básicas, analítica y anuncios
              (Google AdSense). Puedes aceptarlas, rechazarlas o configurarlas.
              <div className="text-xs mt-1">
                Más info:{" "}
                <a className="underline text-emerald-700" href="/politica-cookies">
                  Política de Cookies
                </a>{" "}
                ·{" "}
                <a className="underline text-emerald-700" href="/politica-privacidad">
                  Privacidad
                </a>
              </div>
            </div>
            <div className="ml-auto flex gap-2">
              <button
                onClick={rejectAll}
                className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200"
              >
                Rechazar
              </button>
              <button
                onClick={() => setPanel(true)}
                className="px-4 py-2 rounded-xl bg-emerald-100 hover:bg-emerald-200"
              >
                Configurar
              </button>
              <button
                onClick={acceptAll}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
              >
                Aceptar
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <h3 className="font-semibold text-emerald-800">
              Preferencias de cookies
            </h3>

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={consent.analytics}
                onChange={(e) =>
                  setConsent({ ...consent, analytics: e.currentTarget.checked })
                }
              />
              <span>Analítica</span>
            </label>

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={consent.ads}
                onChange={(e) =>
                  setConsent({ ...consent, ads: e.currentTarget.checked })
                }
              />
              <span>Publicidad (AdSense)</span>
            </label>

            <div className="flex gap-2">
              <button
                onClick={rejectAll}
                className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200"
              >
                Rechazar todo
              </button>
              <button
                onClick={saveCustom}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
              >
                Guardar
              </button>
              <button
                onClick={acceptAll}
                className="px-4 py-2 rounded-xl bg-emerald-100 hover:bg-emerald-200"
              >
                Aceptar todo
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
