import React, { useEffect, useMemo, useRef, useState } from "react";
import { onUserStateChange, signInWithGoogle, signOutUser } from "../lib/firebase.js";
import { isAdminUser } from "../lib/api-utils.js";

type UserLike = {
  uid?: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
  getIdToken?: () => Promise<string>;
};

function getFirstName(name?: string) {
  if (!name) return "";
  const s = name.trim().split(/\s+/);
  return s[0] || name;
}

export default function AuthIsland() {
  const [user, setUser] = useState<UserLike | null>(null);
  const [open, setOpen] = useState(false);
  const [admin, setAdmin] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const label = useMemo(() => {
    if (!user) return "Iniciar sesión";
    return getFirstName(user.displayName) || user.email || "Mi cuenta";
  }, [user]);

  useEffect(() => {
    const unsub = onUserStateChange((u: any) => {
      setUser(u || null);
    });

    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!user) {
        setAdmin(false);
        return;
      }
      try {
        const ok = await isAdminUser();
        if (!cancelled) setAdmin(!!ok);
      } catch {
        if (!cancelled) setAdmin(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function handleLogin() {
    try {
      await signInWithGoogle();
    } catch (e) {
      console.error(e);
      alert("No se pudo iniciar sesión. Intenta de nuevo.");
    }
  }

  async function handleLogout() {
    try {
      await signOutUser();
      setOpen(false);
    } catch (e) {
      console.error(e);
      alert("No se pudo cerrar sesión.");
    }
  }

  if (!user) {
    return (
      <button
        type="button"
        onClick={handleLogin}
        className="inline-flex items-center justify-center rounded-2xl px-5 py-2 text-sm font-extrabold shadow-sm border"
        style={{
          background: "var(--sb-orange)",
          color: "white",
          borderColor: "rgba(0,0,0,0.05)",
        }}
      >
        Iniciar sesión
      </button>
    );
  }

  const initial =
    (user.displayName && user.displayName.trim()[0]) ||
    (user.email && user.email.trim()[0]) ||
    "U";

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-2xl px-3 py-2 border bg-white hover:bg-slate-50 shadow-sm"
        style={{ borderColor: "var(--sb-border)" }}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {user.photoURL ? (
          <img
            src={user.photoURL}
            alt={label}
            className="h-8 w-8 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div
            className="h-8 w-8 rounded-full grid place-items-center text-sm font-bold"
            style={{ background: "rgba(15,118,110,0.12)", color: "var(--sb-accent)" }}
          >
            {initial.toUpperCase()}
          </div>
        )}

        <span className="hidden sm:block text-sm font-bold" style={{ color: "var(--sb-ink)" }}>
          {label}
        </span>

        <svg className="h-4 w-4 opacity-60" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-56 rounded-2xl border bg-white shadow-lg p-1"
          style={{ borderColor: "var(--sb-border)" }}
        >
          <a className="block rounded-xl px-3 py-2 text-sm hover:bg-slate-50" href="/mi-panel">
            Mi panel
          </a>

          {admin && (
            <a className="block rounded-xl px-3 py-2 text-sm hover:bg-slate-50" href="/admin/panel">
              Admin
            </a>
          )}

          <div className="my-1 h-px" style={{ background: "var(--sb-border)" }} />

          <button
            type="button"
            onClick={handleLogout}
            className="w-full text-left rounded-xl px-3 py-2 text-sm hover:bg-slate-50"
          >
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
