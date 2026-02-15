import React, { useEffect, useMemo, useState } from "react";

type User = {
  email: string;
  name?: string;
  picture?: string;
  is_admin?: boolean;
  isAdmin?: boolean;
};

const LS_KEY = "enmi_google_id_token_v1";

function getToken(): string | null {
  try {
    return localStorage.getItem(LS_KEY);
  } catch {
    return null;
  }
}

function clearToken() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {}
}

async function fetchMe(token: string): Promise<User | null> {
  try {
    const res = await fetch("/api/admin2/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as User;
  } catch {
    return null;
  }
}

export default function AuthIsland() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const isAuthed = !!token;

  const primaryHref = useMemo(() => {
    // El panel real está en /usuario/panel/ (hay compat con /panel en varios despliegues)
    return "/usuario/panel";
  }, []);

  useEffect(() => {
    const t = getToken();
    setToken(t);
    if (!t) return;
    fetchMe(t).then((u) => {
      if (!u) {
        clearToken();
        setToken(null);
        setUser(null);
        return;
      }
      setUser(u);
    });
  }, []);

  const onLogout = () => {
    clearToken();
    setToken(null);
    setUser(null);
    setOpen(false);
    // hard refresh para limpiar estados de islands
    window.location.href = "/";
  };

  // UI (sin romper nada): si no está logueado -> botón Acceder que abre modal.
  // Si está logueado -> botón Mi panel + menú.

  return (
    <div className="relative">
      {!isAuthed ? (
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full px-5 py-2.5 font-semibold text-base shadow-sm"
          style={{
            background: "var(--sb-accent)",
            color: "white",
            border: "1px solid rgba(0,0,0,0.06)",
          }}
          onClick={() => setOpen(true)}
        >
          Acceder
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <a
            href={primaryHref}
            className="inline-flex items-center justify-center rounded-full px-5 py-2.5 font-semibold text-base shadow-sm"
            style={{
              background: "white",
              color: "var(--sb-ink)",
              border: "1px solid rgba(0,0,0,0.08)",
            }}
          >
            Mi panel
          </a>
          <button
            type="button"
            className="h-10 w-10 rounded-full overflow-hidden border"
            style={{ borderColor: "rgba(0,0,0,0.10)", background: "white" }}
            onClick={() => setOpen((v) => !v)}
            aria-label="Menú de usuario"
          >
            {user?.picture ? (
              <img src={user.picture} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center font-bold" style={{ color: "var(--sb-ink)" }}>
                {user?.email?.[0]?.toUpperCase?.() ?? "U"}
              </div>
            )}
          </button>
        </div>
      )}

      {open && (
        <div
          className="absolute right-0 mt-3 w-[340px] max-w-[90vw] rounded-2xl shadow-xl p-4"
          style={{ background: "white", border: "1px solid rgba(0,0,0,0.08)" }}
        >
          {!isAuthed ? (
            <LoginBox
              onClose={() => setOpen(false)}
              onToken={(t) => {
                setToken(t);
                fetchMe(t).then((u) => setUser(u));
                setOpen(false);
              }}
            />
          ) : (
            <div className="space-y-3">
              <div className="text-sm" style={{ color: "var(--sb-ink2)" }}>
                {user?.email}
              </div>
              <div className="flex gap-2">
                <a
                  href={primaryHref}
                  className="flex-1 inline-flex items-center justify-center rounded-xl px-4 py-2.5 font-semibold"
                  style={{ background: "var(--sb-soft)", color: "var(--sb-ink)" }}
                >
                  Ir a mi panel
                </a>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-xl px-4 py-2.5 font-semibold"
                  style={{ background: "rgba(0,0,0,0.05)", color: "var(--sb-ink)" }}
                  onClick={onLogout}
                >
                  Salir
                </button>
              </div>
              {(user?.is_admin || user?.isAdmin) && (
                <a
                  href="/admin/panel"
                  className="block text-sm font-semibold"
                  style={{ color: "var(--sb-accent)" }}
                >
                  Panel admin
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LoginBox({
  onClose,
  onToken,
}: {
  onClose: () => void;
  onToken: (token: string) => void;
}) {
  useEffect(() => {
    // Carga del script de Google Identity
    const id = "google-identity";
    if (document.getElementById(id)) return;

    const s = document.createElement("script");
    s.id = id;
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    document.head.appendChild(s);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      // @ts-ignore
      const google = (window as any).google;
      if (!google?.accounts?.id) return;
      window.clearInterval(interval);

      // @ts-ignore
      google.accounts.id.initialize({
        client_id: import.meta.env.PUBLIC_GOOGLE_CLIENT_ID,
        callback: (resp: any) => {
          const t = resp?.credential;
          if (!t) return;
          try {
            localStorage.setItem(LS_KEY, t);
          } catch {}
          onToken(t);
        },
      });

      // @ts-ignore
      google.accounts.id.renderButton(document.getElementById("gsi-btn"), {
        theme: "outline",
        size: "large",
        width: 300,
        text: "signin_with",
        shape: "pill",
      });
    }, 250);

    return () => window.clearInterval(interval);
  }, [onToken]);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-extrabold" style={{ color: "var(--sb-ink)" }}>
            Accede con Google
          </div>
          <div className="text-sm" style={{ color: "var(--sb-ink2)" }}>
            Para publicar, guardar favoritos y entrar a tu panel.
          </div>
        </div>
        <button
          type="button"
          className="h-9 w-9 rounded-full inline-flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.05)" }}
          onClick={onClose}
          aria-label="Cerrar"
        >
          ✕
        </button>
      </div>

      <div className="flex justify-center">
        <div id="gsi-btn" />
      </div>

      <div className="text-xs" style={{ color: "var(--sb-ink2)" }}>
        No guardamos tu contraseña. Usamos el inicio de sesión de Google.
      </div>
    </div>
  );
}
