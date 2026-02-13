import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { auth, onUserStateChange, renderGoogleButton, signOut } from "../lib/firebase.js";

type MeInfo = { is_admin?: boolean; isAdmin?: boolean; admin?: boolean } | null;

type Props = {
  className?: string;
};

declare global {
  interface Window {
    showAuthModal?: () => void;
  }
}

export default function AuthIsland({ className = "" }: Props) {
  const [user, setUser] = useState(auth.currentUser);
  const [open, setOpen] = useState(false);
  const [loadingBtn, setLoadingBtn] = useState(false);
  const [me, setMe] = useState<MeInfo>(null);

  const btnRef = useRef<HTMLDivElement | null>(null);
  const canUseDom = typeof window !== "undefined" && typeof document !== "undefined";

  const backendBase = useMemo(() => {
    // mismo criterio que firebase.js
    // @ts-ignore
    const env = import.meta.env || {};
    return env.PUBLIC_BACKEND_URL || "/api";
  }, []);

  useEffect(() => {
    return onUserStateChange((u) => setUser(u));
  }, []);

  // Exponer una forma global para abrir el modal (lo usa el menú móvil)
  useEffect(() => {
    if (!canUseDom) return;
    window.showAuthModal = () => setOpen(true);
    return () => {
      try {
        delete (window as any).showAuthModal;
      } catch {}
    };
  }, [canUseDom]);

  // cerrar modal automáticamente cuando ya hay sesión
  useEffect(() => {
    if (open && user) setOpen(false);
  }, [open, user]);

  // bloquear scroll mientras el modal está abierto
  useEffect(() => {
    if (!canUseDom) return;
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, canUseDom]);

  // cargar botón google cuando abre el modal
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      try {
        setLoadingBtn(true);
        await renderGoogleButton(btnRef.current);
      } catch (e) {
        console.error("[auth] render button error", e);
      } finally {
        if (!cancelled) setLoadingBtn(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  // traer /billing/me para saber si es admin (sin bloquear UI)
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
    !!me?.is_admin ||
    !!me?.isAdmin ||
    !!me?.admin ||
    !!(user as any)?.is_admin ||
    !!(user as any)?.isAdmin;

  const doLogout = async () => {
    try {
      await signOut();
    } finally {
      setMe(null);
    }
  };

  const Modal = (
    <div className="fixed inset-0 z-[9999] grid place-items-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        onClick={() => setOpen(false)}
        aria-label="Cerrar"
      />

      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-[min(94vw,520px)] overflow-hidden rounded-[28px] border border-black/10 bg-white/95 shadow-2xl"
      >
        <div className="p-6 sm:p-8">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-extrabold text-stone-900">Acceder a EnMiPueblo</h2>
              <p className="mt-1 text-sm text-stone-600">
                Inicia sesión con Google para guardar favoritos y publicar servicios.
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-full border border-black/10 bg-white/80 px-3 py-2 text-sm text-stone-900 shadow-sm hover:bg-white"
              aria-label="Cerrar"
              type="button"
            >
              ✕
            </button>
          </div>

          <div className="mt-6 flex flex-col items-center">
            <div ref={btnRef} className="min-h-[44px] w-[340px] max-w-full" />
            {loadingBtn ? <div className="mt-3 text-xs text-stone-500">Cargando Google…</div> : null}

            <div className="mt-4 text-center text-xs text-stone-500">
              Si tu navegador bloquea cookies de terceros, el botón igual debería funcionar.
            </div>
          </div>

          <div className="mt-6 text-center text-[11px] text-stone-500">
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
  );

  return (
    <div className={className}>
      {user ? (
        <div className="flex items-center gap-2">
          <a
            href="/panel"
            className="hidden md:inline-flex items-center justify-center rounded-xl border border-black/10 bg-white/70 px-3 py-2 text-sm font-semibold text-stone-800 shadow-sm hover:bg-white"
          >
            Mi panel
          </a>

          {isAdmin ? (
            <a
              href="/admin"
              className="hidden md:inline-flex items-center justify-center rounded-xl border border-black/10 bg-white/70 px-3 py-2 text-sm font-semibold text-stone-800 shadow-sm hover:bg-white"
            >
              Admin
            </a>
          ) : null}

          <button
            onClick={doLogout}
            className="hidden md:inline-flex items-center justify-center rounded-xl border border-black/10 bg-white/70 px-3 py-2 text-sm text-stone-800 shadow-sm hover:bg-white"
            type="button"
          >
            Salir
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-extrabold text-white shadow-sm hover:opacity-95"
          style={{ background: "var(--sb-orange)" }}
          type="button"
        >
          Acceder
        </button>
      )}

      {open && canUseDom ? createPortal(Modal, document.body) : null}
    </div>
  );
}
