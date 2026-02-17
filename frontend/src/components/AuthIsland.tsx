// frontend/src/components/AuthIsland.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { onUserStateChange, signInWithGoogle, signOutUser } from "../lib/firebase.js";
import { isAdminUser } from "../lib/api-utils.js";

type Props = {
  className?: string;
};

export default function AuthIsland({ className }: Props) {
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const unsub = onUserStateChange(async (u) => {
      setUser(u || null);
      if (u?.email) {
        try {
          const ok = await isAdminUser();
          setIsAdmin(!!ok);
        } catch {
          setIsAdmin(false);
        }
      } else {
        setIsAdmin(false);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!open) return;
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const label = useMemo(() => {
    if (!user) return "";
    return user.displayName || user.name || user.email || "Mi cuenta";
  }, [user]);

  async function handleLogin() {
    try {
      setBusy(true);
      await signInWithGoogle();
    } catch (e: any) {
      alert(e?.message || "No se pudo iniciar sesión");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    try {
      setBusy(true);
      await signOutUser();
      setOpen(false);
    } catch (e: any) {
      alert(e?.message || "No se pudo cerrar sesión");
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return (
      <button
        type="button"
        onClick={handleLogin}
        disabled={busy}
        className={
          className ??
          "rounded-full bg-[#d65d0e] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-60"
        }
      >
        {busy ? "Conectando..." : "Iniciar sesión"}
      </button>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-white"
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-[#0ea5a3] text-white">
          {(label?.[0] || "U").toUpperCase()}
        </span>
        <span className="hidden max-w-[180px] truncate sm:block">{label}</span>
        <span className="text-slate-500">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
          <div className="px-2 pb-2">
            <div className="text-sm font-semibold text-slate-900">{label}</div>
            <div className="text-xs text-slate-500">{user.email}</div>
          </div>

          <div className="my-2 h-px bg-slate-200" />

          <a
            className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            href="/usuario/panel"
          >
            Mi panel
          </a>

          {isAdmin && (
            <a
              className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              href="/admin/panel"
            >
              Admin
            </a>
          )}

          <button
            type="button"
            onClick={handleLogout}
            disabled={busy}
            className="mt-2 w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
          >
            {busy ? "Saliendo..." : "Cerrar sesión"}
          </button>
        </div>
      )}
    </div>
  );
}
