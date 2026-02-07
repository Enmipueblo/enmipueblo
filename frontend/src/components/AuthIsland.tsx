import React, { useEffect, useMemo, useRef, useState } from "react";

type User = {
  uid: string;
  email: string;
  name: string;
  picture: string;
  token: string;
};

const STORAGE_KEY = "enmi_google_id_token_v1";

function b64urlToJson(part: string) {
  const s = String(part || "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const json = atob(s + pad);
  return JSON.parse(json);
}

function decodeJwt(token: string) {
  const parts = String(token || "").split(".");
  if (parts.length < 2) throw new Error("JWT inválido");
  return b64urlToJson(parts[1]);
}

function isTokenValid(token: string) {
  try {
    const p = decodeJwt(token);
    const expMs = (Number(p.exp) || 0) * 1000;
    return expMs > Date.now() + 30_000; // margen 30s
  } catch {
    return false;
  }
}

function tokenToUser(token: string): User {
  const p = decodeJwt(token);
  return {
    uid: String(p.sub || ""),
    email: String(p.email || ""),
    name: String(p.name || ""),
    picture: String(p.picture || ""),
    token,
  };
}

let gisLoader: Promise<void> | null = null;

function loadGIS(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  // ya cargado
  // @ts-ignore
  if (window.google?.accounts?.id) return Promise.resolve();

  if (!gisLoader) {
    gisLoader = new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("No se pudo cargar Google Identity Services"));
      document.head.appendChild(s);
    });
  }
  return gisLoader;
}

/**
 * IMPORTANTÍSIMO:
 * - NO uses import.meta?.env?.PUBLIC_... (optional chaining) porque Astro/Vite no lo “hornea”.
 * - Usa import.meta.env.PUBLIC_... directo.
 */
function getGoogleClientId() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (import.meta as any).env;
  return String(env.PUBLIC_GOOGLE_CLIENT_ID || env.PUBLIC_GOOGLE_OAUTH_CLIENT_ID || "");
}

export default function AuthIsland() {
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const btnRef = useRef<HTMLDivElement | null>(null);

  const googleClientId = useMemo(() => getGoogleClientId(), []);

  // restaurar sesión
  useEffect(() => {
    try {
      const t = localStorage.getItem(STORAGE_KEY);
      if (!t) return;
      if (!isTokenValid(t)) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      setUser(tokenToUser(t));
    } catch {
      // ignore
    }
  }, []);

  // bloquear scroll cuando modal abierto
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // inicializa GIS y renderiza botón SOLO cuando el modal está abierto
  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    (async () => {
      if (!googleClientId) {
        console.warn("[auth] Falta PUBLIC_GOOGLE_CLIENT_ID (no se puede inicializar GIS)");
        return;
      }

      setLoading(true);
      try {
        await loadGIS();
        if (cancelled) return;

        // @ts-ignore
        const gis = window.google?.accounts?.id;
        if (!gis) throw new Error("GIS no disponible");

        gis.initialize({
          client_id: googleClientId,
          callback: (resp: any) => {
            const cred = resp?.credential;
            if (!cred) return;

            try {
              localStorage.setItem(STORAGE_KEY, cred);
            } catch {
              // ignore
            }

            try {
              setUser(tokenToUser(cred));
            } catch {
              // ignore
            }

            // cerrar modal sí o sí
            setOpen(false);
          },
          auto_select: false,
          cancel_on_tap_outside: false,
        });

        if (btnRef.current) {
          btnRef.current.innerHTML = "";
          gis.renderButton(btnRef.current, {
            theme: "outline",
            size: "large",
            shape: "pill",
            text: "continue_with",
            width: 340,
          });
        }
      } catch (e) {
        console.error("[auth] error inicializando GIS:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, googleClientId]);

  const signOut = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    try {
      // @ts-ignore
      window.google?.accounts?.id?.disableAutoSelect?.();
    } catch {
      // ignore
    }
    setUser(null);
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        {user ? (
          <div className="flex items-center gap-3">
            {user.picture ? (
              <img
                src={user.picture}
                alt={user.name || "Usuario"}
                className="h-9 w-9 rounded-full border border-black/10"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="h-9 w-9 rounded-full bg-black/10" />
            )}

            <div className="hidden sm:block leading-tight">
              <div className="text-sm font-semibold text-slate-900">{user.name || "Sesión iniciada"}</div>
              <div className="text-xs text-slate-600">{user.email}</div>
            </div>

            <button
              onClick={signOut}
              className="rounded-full border border-black/10 bg-white/70 px-4 py-2 text-sm text-slate-900 shadow-sm backdrop-blur hover:bg-white"
            >
              Cerrar sesión
            </button>
          </div>
        ) : (
          <button
            onClick={() => setOpen(true)}
            className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
          >
            Iniciar sesión
          </button>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          <div className="relative w-[min(94vw,520px)] overflow-hidden rounded-3xl border border-white/10 bg-white/95 shadow-2xl">
            <div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-blue-500/25 blur-3xl" />
            <div className="pointer-events-none absolute -right-24 -bottom-24 h-64 w-64 rounded-full bg-fuchsia-500/20 blur-3xl" />

            <div className="relative p-6 sm:p-8">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-extrabold text-slate-900">Entrar a EnMiPueblo</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Inicia sesión con Google para guardar favoritos y publicar servicios.
                  </p>
                </div>

                <button
                  onClick={() => setOpen(false)}
                  className="rounded-full border border-black/10 bg-white/70 px-3 py-2 text-sm text-slate-900 shadow-sm backdrop-blur hover:bg-white"
                  aria-label="Cerrar"
                >
                  ✕
                </button>
              </div>

              <div className="mt-6 flex flex-col items-center">
                {googleClientId ? (
                  <>
                    <div ref={btnRef} className="min-h-[44px] w-[340px] max-w-full" />
                    {loading && <div className="mt-3 text-xs text-slate-500">Cargando Google…</div>}

                    <div className="mt-4 text-center text-xs text-slate-500">
                      Si tu navegador bloquea cookies de terceros, el botón igual debería funcionar.
                      (No usamos One Tap.)
                    </div>
                  </>
                ) : (
                  <div className="w-full rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
                    Falta <b>PUBLIC_GOOGLE_CLIENT_ID</b> en el build del frontend.
                  </div>
                )}
              </div>

              <div className="mt-6 text-center text-[11px] text-slate-500">
                Al continuar aceptas{" "}
                <a className="underline hover:opacity-80" href="/politica-privacidad/">
                  política de privacidad
                </a>{" "}
                y{" "}
                <a className="underline hover:opacity-80" href="/terminos/">
                  términos
                </a>
                .
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
