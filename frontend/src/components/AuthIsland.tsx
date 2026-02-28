// frontend/src/components/AuthIsland.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { onUserStateChange, signInWithGoogle, signOutUser } from "../lib/firebase.js";
import { isAdminUser } from "../lib/api-utils.js";

type User = {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
};

export default function AuthIsland() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const unsub = onUserStateChange(async (u: any) => {
      setUser(u || null);
      setOpen(false);

      if (u?.email) {
        try {
          const ok = await isAdminUser(u.email);
          setIsAdmin(!!ok);
        } catch {
          setIsAdmin(false);
        }
      } else {
        setIsAdmin(false);
      }
    });

    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    };

    document.addEventListener("mousedown", onDoc);
    return () => {
      unsub?.();
      document.removeEventListener("mousedown", onDoc);
    };
  }, []);

  const displayName = useMemo(() => {
    if (!user) return "";
    return user.name || user.email || "Mi cuenta";
  }, [user]);

  const onLogin = async () => {
    setBusy(true);
    try {
      const res: any = await signInWithGoogle();
      if (res?.user) {
        setUser(res.user);
        if (res.user?.email) {
          try {
            const ok = await isAdminUser(res.user.email);
            setIsAdmin(!!ok);
          } catch {
            setIsAdmin(false);
          }
        }
      } else if (res?.error) {
        alert(res.error);
      }
    } finally {
      setBusy(false);
    }
  };

  const onLogout = async () => {
    setBusy(true);
    try {
      await signOutUser();
      setUser(null);
      setIsAdmin(false);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  if (!user) {
    return (
      <button
        type="button"
        onClick={onLogin}
        disabled={busy}
        className="inline-flex items-center justify-center rounded-xl px-4 py-1.5 text-sm font-extrabold shadow-sm border transition hover:opacity-90 disabled:opacity-60"
        style={{
          background: "var(--sb-accent)",
          color: "#fff",
          borderColor: "rgba(0,0,0,0.08)",
        }}
      >
        {busy ? "Conectando..." : "Iniciar sesión"}
      </button>
    );
  }

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-extrabold border shadow-sm transition hover:bg-white/60"
        style={{
          background: "rgba(255,255,255,0.65)",
          color: "var(--sb-ink)",
          borderColor: "var(--sb-border)",
          backdropFilter: "blur(10px)",
        }}
      >
        {user.picture ? (
          <img
            src={user.picture}
            alt=""
            className="h-8 w-8 rounded-full object-cover border"
            style={{ borderColor: "rgba(0,0,0,0.08)" }}
            referrerPolicy="no-referrer"
          />
        ) : (
          <span
            className="h-8 w-8 rounded-full grid place-items-center text-sm"
            style={{ background: "rgba(14,165,164,0.15)", color: "var(--sb-ink)" }}
          >
            {(displayName || "U").slice(0, 1).toUpperCase()}
          </span>
        )}

        <span className="max-w-[160px] truncate">{displayName}</span>
        <span className="text-xs opacity-70">▾</span>
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-56 rounded-2xl border shadow-lg p-2"
          style={{
            background: "rgba(255,255,255,0.92)",
            borderColor: "var(--sb-border)",
            backdropFilter: "blur(12px)",
          }}
        >
          <a href="/mi-panel" className="block rounded-xl px-3 py-2 text-sm font-bold hover:bg-black/5">
            Mi panel
          </a>

          {isAdmin && (
            <a href="/admin/panel" className="block rounded-xl px-3 py-2 text-sm font-bold hover:bg-black/5">
              Admin
            </a>
          )}

          <div className="my-2 h-px" style={{ background: "rgba(15,23,42,0.10)" }} />

          <button
            type="button"
            onClick={onLogout}
            disabled={busy}
            className="w-full text-left rounded-xl px-3 py-2 text-sm font-extrabold hover:bg-black/5 disabled:opacity-60"
            style={{ color: "var(--sb-ink)" }}
          >
            {busy ? "Saliendo..." : "Cerrar sesión"}
          </button>
        </div>
      )}
    </div>
  );
}