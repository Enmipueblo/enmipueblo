import React, { useEffect, useMemo, useState } from "react";
import { auth, signInWithGoogle, signOutUser } from "../lib/firebase";

type Props = { className?: string };

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function AuthIsland({ className = "" }: Props) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u: any) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const displayName = useMemo(() => {
    if (!user) return "";
    return user.displayName || user.email || "Usuario";
  }, [user]);

  const btnBase =
    "inline-flex items-center justify-center rounded-2xl px-4 py-2.5 font-extrabold shadow-sm transition active:opacity-95 focus:outline-none focus:ring-2 focus:ring-[rgba(196,91,52,0.25)]";

  const primaryBtn = cx(
    btnBase,
    "bg-[var(--sb-accent)] text-[var(--sb-on-accent)] border border-[color:var(--sb-border)] hover:opacity-95"
  );

  const ghostBtn = cx(
    btnBase,
    "bg-white/60 text-[var(--sb-ink)] border border-[color:var(--sb-border)] hover:bg-white"
  );

  const chip = "inline-flex items-center gap-2 rounded-2xl border bg-white/60 px-3 py-2 text-sm font-bold";
  const chipStyle: React.CSSProperties = { borderColor: "var(--sb-border)", color: "var(--sb-ink)" };

  if (loading) {
    return (
      <div className={cx("text-sm font-semibold", className)} style={{ color: "var(--sb-muted)" }}>
        Cargando…
      </div>
    );
  }

  if (!user) {
    return (
      <div className={cx("flex items-center gap-2", className)}>
        <button
          className={primaryBtn}
          onClick={() => {
            signInWithGoogle();
          }}
          type="button"
        >
          Iniciar sesión
        </button>
      </div>
    );
  }

  return (
    <div className={cx("flex items-center gap-2", className)}>
      <span className={chip} style={chipStyle} title={displayName}>
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--sb-accent)" }} />
        <span className="max-w-[140px] truncate">{displayName}</span>
      </span>

      <a className={ghostBtn} href="/mi-panel">
        Mi panel
      </a>

      <button
        className={ghostBtn}
        onClick={() => {
          signOutUser();
        }}
        type="button"
      >
        Salir
      </button>
    </div>
  );
}
