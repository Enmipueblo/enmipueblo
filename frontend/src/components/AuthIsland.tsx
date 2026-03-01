// frontend/src/components/AuthIsland.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";

// 👇 Mantengo tus funciones de login/logout tal cual existen hoy
// (lo único que hacemos es guardar token/user donde toca)
import { signInWithGoogle, signOutUser } from "../lib/firebase.js";

// ✅ El estado lo leemos del storage central (api-utils)
import { onUserStateChange, getIdToken, getCurrentUser, isAdminUser } from "../lib/api-utils.js";

type User = {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
  is_admin?: boolean;
  isAdmin?: boolean;
};

const KEY_AUTH = "enmipueblo_auth_v1"; // { token, user }
const KEY_LEGACY_TOKEN = "enmi_google_id_token_v1";
const KEY_LEGACY_USER = "enmipueblo_user";
const AUTH_EVENT = "enmipueblo:auth";

function safeJsonParse(raw: string | null) {
  try {
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function emitAuthChanged() {
  try {
    window.dispatchEvent(new Event(AUTH_EVENT));
  } catch {}
}

function saveAuthToStorage(token: string, user: any) {
  if (typeof window === "undefined") return;

  const cleanUser: User | null = user
    ? {
        uid: String(user.uid || user.sub || user.id || ""),
        email: user.email ? String(user.email) : undefined,
        name: user.name ? String(user.name) : undefined,
        picture: user.picture ? String(user.picture) : undefined,
      }
    : null;

  if (token) {
    window.localStorage.setItem(KEY_LEGACY_TOKEN, String(token));
    window.localStorage.setItem(KEY_AUTH, JSON.stringify({ token: String(token), user: cleanUser }));
  } else {
    window.localStorage.removeItem(KEY_LEGACY_TOKEN);
    window.localStorage.removeItem(KEY_AUTH);
  }

  if (cleanUser) {
    window.localStorage.setItem(KEY_LEGACY_USER, JSON.stringify(cleanUser));
    window.localStorage.setItem("enmipueblo_user_v1", JSON.stringify(cleanUser));
  } else {
    window.localStorage.removeItem(KEY_LEGACY_USER);
    window.localStorage.removeItem("enmipueblo_user_v1");
  }

  emitAuthChanged();
}

export default function AuthIsland() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // ✅ estado inicial desde storage
    setUser((getCurrentUser() as any) || null);

    // ✅ escuchar cambios desde storage (centralizado)
    const unsub = onUserStateChange(async (u: any) => {
      setUser(u || null);
      setOpen(false);

      // OJO: si no hay token, admin siempre false (evita spam)
      const token = getIdToken();
      if (!token || !u) {
        setIsAdmin(false);
        return;
      }

      try {
        const ok = await isAdminUser(u);
        setIsAdmin(!!ok);
      } catch {
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

      // 🔥 CLAVE: extraer el token venga como venga
      const token =
        (res && (res.token || res.id_token || res.idToken || res.credential)) ||
        ""; // algunos wrappers devuelven { credential: <jwt> }

      const u = res?.user || res?.profile || res?.payload || null;

      if (token) {
        saveAuthToStorage(String(token), u || user);
      } else if (u) {
        // Si te devuelve user pero no token, guardamos user para UI, pero admin no funcionará
        saveAuthToStorage("", u);
      }

      // refresca UI
      setUser((getCurrentUser() as any) || u || null);

      // recalcular admin si ya hay token
      const storedToken = getIdToken();
      if (storedToken && (u || getCurrentUser())) {
        try {
          const ok = await isAdminUser((u || getCurrentUser()) as any);
          setIsAdmin(!!ok);
        } catch {
          setIsAdmin(false);
        }
      } else {
        setIsAdmin(false);
      }

      if (res?.error) {
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
    } finally {
      // limpia storage (aunque signOutUser no lo haga)
      saveAuthToStorage("", null);
      setUser(null);
      setIsAdmin(false);
      setOpen(false);
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