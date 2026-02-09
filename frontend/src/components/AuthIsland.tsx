import React, { useEffect, useMemo, useRef, useState } from "react";
import { auth, onUserStateChange, renderGoogleButton, signOut } from "../lib/firebase.js";

type MeInfo = { is_admin?: boolean; isAdmin?: boolean; admin?: boolean } | null;

export default function AuthIsland() {
  const [user, setUser] = useState(auth.currentUser);
  const [open, setOpen] = useState(false);
  const [loadingBtn, setLoadingBtn] = useState(false);
  const [me, setMe] = useState<MeInfo>(null);

  const btnRef = useRef<HTMLDivElement | null>(null);

  const backendBase = useMemo(() => {
    // mismo criterio que firebase.js
    // @ts-ignore
    const env = import.meta.env || {};
    return env.PUBLIC_BACKEND_URL || "/api";
  }, []);

  useEffect(() => {
    return onUserStateChange((u) => setUser(u));
  }, []);

  // cargar botón google cuando abre el modal
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      try {
        setLoadingBtn(true);
        await renderGoogleButton(btnRef.current);
      } catch (e) {
        // si falla, no rompemos UI
        console.error("[auth] render button error", e);
      } finally {
        if (!cancelled) setLoadingBtn(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  // trae /billing/me para saber si es admin (sin bloquear UI)
  useEffect(() => {
    if (!user) {
      setMe(null);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`${backendBase}/billing/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setMe(data || null);
      } catch (_e) {}
    })();

    return () => {
      cancelled = true;
    };
  }, [user, backendBase]);

  const isAdmin =
    !!me?.is_admin || !!me?.isAdmin || !!me?.admin || !!(user as any)?.is_admin || !!(user as any)?.isAdmin;

  const doLogout = async () => {
    try {
      await signOut();
    } finally {
      setMe(null);
    }
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

            {/* ✅ vuelve el panel de usuario */}
            <a
              href="/panel"
              className="rounded-full border border-black/10 bg-white/70 px-4 py-2 text-sm text-slate-900 shadow-sm backdrop-blur hover:bg-white"
            >
              Mi panel
            </a>

            {/* ✅ admin solo si corresponde */}
            {isAdmin ? (
              <a
                href="/admin"
                className="rounded-full border border-black/10 bg-white/70 px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm backdrop-blur hover:bg-white"
              >
                Admin
              </a>
            ) : null}

            <button
              onClick={doLogout}
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

      {open ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-[min(94vw,520px)] overflow-hidden rounded-3xl border border-white/10 bg-white/95 shadow-2xl">
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
                <div ref={btnRef} className="min-h-[44px] w-[340px] max-w-full" />
                {loadingBtn ? <div className="mt-3 text-xs text-slate-500">Cargando Google…</div> : null}
                <div className="mt-4 text-center text-xs text-slate-500">
                  Si tu navegador bloquea cookies de terceros, el botón igual debería funcionar. (No usamos One Tap.)
                </div>
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
      ) : null}
    </>
  );
}
