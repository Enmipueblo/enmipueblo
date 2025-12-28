import React, { useEffect, useRef, useState } from "react";
import {
  onUserStateChange,
  loginWithEmail,
  registerWithEmail,
  signInWithGoogle,
  signOut,
  resetPassword,
} from "../lib/firebase.js";

type Message = {
  text: string;
  type: "info" | "success" | "error" | "";
};

declare global {
  interface Window {
    showAuthModal?: () => void;
    hideAuthModal?: () => void;
    __enmiPuebloUser__?: any;
  }
}

const GoogleIcon = () => (
  <svg width="22" height="22" viewBox="0 0 48 48" className="inline mr-2 -mt-0.5">
    <g>
      <path
        fill="#4285F4"
        d="M44.5 20H24v8.5h11.7C34.4 33 29.7 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.7 2.9l6.4-6.4C34.1 5.1 29.3 3 24 3 12.9 3 4 11.9 4 23s8.9 20 20 20c11.5 0 19.5-8.1 19.5-19.5 0-1.3-.2-2.3-.5-3.5z"
      />
      <path
        fill="#34A853"
        d="M6.3 14.7l7 5.1C15 16 19.2 13 24 13c3 0 5.7 1.1 7.7 2.9l6.4-6.4C34.1 5.1 29.3 3 24 3 16.3 3 9.6 7.3 6.3 14.7z"
      />
      <path
        fill="#FBBC05"
        d="M24 43c5.6 0 10.3-1.9 13.7-5.2l-6.3-5.2c-1.9 1.3-4.3 2.1-7.4 2.1-5.7 0-10.5-3.9-12.2-9.1l-7 5.4C7.9 38 15.3 43 24 43z"
      />
      <path
        fill="#EA4335"
        d="M44.5 20H24v8.5h11.7c-.8 2.4-2.4 4.4-4.7 5.7l6.3 5.2C41 36 43.5 30.8 43.5 23.5c0-1.3-.2-2.3-.5-3.5z"
      />
    </g>
  </svg>
);

const AuthIsland = ({
  className = "",
  size = "normal",
}: {
  className?: string;
  size?: "normal" | "large";
}) => {
  const [user, setUser] = useState<any>(undefined);
  const [showModal, setShowModal] = useState(false);
  const [registerMode, setRegisterMode] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    password2: "",
  });
  const [message, setMessage] = useState<Message>({ text: "", type: "" });
  const [busy, setBusy] = useState(false);

  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const unsub = onUserStateChange((u: any) => {
      setUser(u || null);
      if (typeof window !== "undefined") window.__enmiPuebloUser__ = u || null;
    });
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, []);

  useEffect(() => {
    window.showAuthModal = () => setShowModal(true);
    window.hideAuthModal = () => setShowModal(false);
    return () => {
      window.showAuthModal = undefined;
      window.hideAuthModal = undefined;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowModal(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (!showModal) return;
      const el = modalRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setShowModal(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [showModal]);

  async function doGoogle() {
    setBusy(true);
    setMessage({ text: "", type: "" });
    try {
      await signInWithGoogle();
      setShowModal(false);
    } catch (error: any) {
      setMessage({
        text: error?.message || "No se pudo iniciar sesión con Google. Inténtalo de nuevo.",
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function doEmailLogin() {
    setBusy(true);
    setMessage({ text: "", type: "" });
    try {
      await loginWithEmail(form.email.trim(), form.password);
      setShowModal(false);
    } catch (error: any) {
      setMessage({
        text: error?.message || "No se pudo iniciar sesión. Revisa tus datos.",
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function doEmailRegister() {
    if (form.password !== form.password2) {
      setMessage({ text: "Las contraseñas no coinciden.", type: "error" });
      return;
    }
    setBusy(true);
    setMessage({ text: "", type: "" });
    try {
      await registerWithEmail(form.email.trim(), form.password);
      setShowModal(false);
    } catch (error: any) {
      setMessage({
        text: error?.message || "No se pudo crear la cuenta. Inténtalo de nuevo.",
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function doResetPassword() {
    const email = form.email.trim();
    if (!email) {
      setMessage({ text: "Escribe tu email para enviarte el enlace de recuperación.", type: "info" });
      return;
    }

    setBusy(true);
    setMessage({ text: "", type: "" });
    try {
      await resetPassword(email);
      setMessage({
        text: "Perfecto, te hemos enviado un email para restablecer la contraseña.",
        type: "success",
      });
    } catch (error: any) {
      setMessage({
        text: error?.message || "No se pudo enviar el correo de recuperación. Inténtalo de nuevo.",
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  const buttonBase =
    size === "large"
      ? "font-extrabold py-3 px-8 rounded-xl shadow-lg border transition"
      : "px-3 py-1 rounded-lg font-semibold border transition";

  const loginBtn =
    size === "large"
      ? "text-[#F6FFE8] bg-[color:var(--sb-ink)] hover:opacity-95 border-[rgba(47,91,53,0.30)]"
      : "bg-white/70 text-[color:var(--sb-ink)] border-[color:var(--sb-border)] hover:bg-white";

  const username = user?.email?.split("@")[0] || "Cuenta";
  const initial = (username?.[0] || "U").toUpperCase();

  return (
    <>
      {user ? (
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-8 h-8 rounded-full border flex items-center justify-center text-xs font-extrabold uppercase shadow-sm"
              style={{
                background: "rgba(255,255,255,0.65)",
                borderColor: "rgba(47,91,53,0.18)",
                color: "var(--sb-ink)",
              }}
              title={user?.email || ""}
            >
              {initial}
            </div>
            <span
              className="text-sm md:text-base font-bold truncate max-w-[160px]"
              style={{ color: "var(--sb-ink)" }}
            >
              {username}
            </span>
          </div>

          <a
            href="/usuario/panel"
            className="inline-flex items-center gap-2 text-xs md:text-sm px-3 py-1.5 rounded-full border transition font-bold shadow-sm"
            style={{
              background: "rgba(255,255,255,0.70)",
              color: "var(--sb-ink)",
              borderColor: "rgba(47,91,53,0.18)",
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 13h8V3H3v10zM13 21h8v-8h-8v8zM13 3h8v6h-8V3zM3 21h8v-6H3v6z" />
            </svg>
            <span className="hidden sm:inline">Mi panel</span>
          </a>

          <button
            onClick={async () => {
              try {
                await signOut();
              } catch (e) {
                console.error(e);
              }
            }}
            className="inline-flex items-center gap-2 text-xs md:text-sm px-3 py-1.5 rounded-full font-bold border transition shadow-sm"
            style={{
              background: "rgba(255,255,255,0.70)",
              color: "var(--sb-purple)",
              borderColor: "rgba(123,90,198,0.22)",
            }}
            type="button"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
            <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowModal(true)}
          className={`${buttonBase} ${loginBtn} ${className}`}
          type="button"
        >
          Iniciar sesión
        </button>
      )}

      {showModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 px-4">
          <div
            ref={modalRef}
            className="w-full max-w-md rounded-2xl shadow-2xl border overflow-hidden"
            style={{ background: "rgba(255,255,255,0.95)", borderColor: "rgba(47,91,53,0.18)" }}
            role="dialog"
            aria-modal="true"
            aria-label="Iniciar sesión"
          >
            <div
              className="flex items-center justify-between px-5 py-4 border-b"
              style={{
                borderColor: "rgba(47,91,53,0.16)",
                background: "linear-gradient(120deg, rgba(168,232,106,0.55), rgba(228,255,183,0.65))",
              }}
            >
              <div className="font-extrabold" style={{ color: "var(--sb-ink)" }}>
                {registerMode ? "Crear cuenta" : "Iniciar sesión"}
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="w-9 h-9 rounded-full flex items-center justify-center transition"
                style={{ color: "var(--sb-ink)", background: "rgba(255,255,255,0.75)" }}
                type="button"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <div className="px-5 pt-4">
              {message.text && (
                <div
                  className={`mb-3 rounded-xl px-4 py-3 text-sm border ${
                    message.type === "error"
                      ? "bg-red-50 text-red-700 border-red-100"
                      : message.type === "success"
                      ? "bg-green-50 text-green-800 border-green-100"
                      : "bg-amber-50 text-amber-800 border-amber-100"
                  }`}
                >
                  {message.text}
                </div>
              )}

              <button
                onClick={doGoogle}
                disabled={busy}
                className="w-full mb-4 inline-flex items-center justify-center rounded-xl border bg-white hover:bg-green-50 font-bold py-3 transition disabled:opacity-60"
                style={{ borderColor: "rgba(47,91,53,0.18)", color: "var(--sb-ink)" }}
                type="button"
              >
                <GoogleIcon />
                Continuar con Google
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="h-px flex-1" style={{ background: "rgba(47,91,53,0.16)" }} />
                <div className="text-xs font-bold" style={{ color: "var(--sb-ink2)" }}>o</div>
                <div className="h-px flex-1" style={{ background: "rgba(47,91,53,0.16)" }} />
              </div>

              <label className="block text-sm font-bold mb-1" style={{ color: "var(--sb-ink)" }}>
                Email
              </label>
              <input
                className="w-full rounded-xl border px-4 py-3 placeholder:text-gray-400 focus:outline-none focus:ring-2 bg-white"
                style={{
                  borderColor: "rgba(47,91,53,0.18)",
                  color: "var(--sb-ink)",
                }}
                type="email"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="tu@email.com"
                autoComplete="email"
              />

              <label className="block text-sm font-bold mb-1 mt-3" style={{ color: "var(--sb-ink)" }}>
                Contraseña
              </label>
              <input
                className="w-full rounded-xl border px-4 py-3 placeholder:text-gray-400 focus:outline-none focus:ring-2 bg-white"
                style={{
                  borderColor: "rgba(47,91,53,0.18)",
                  color: "var(--sb-ink)",
                }}
                type="password"
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                placeholder="••••••••"
                autoComplete={registerMode ? "new-password" : "current-password"}
              />

              {registerMode && (
                <>
                  <label className="block text-sm font-bold mb-1 mt-3" style={{ color: "var(--sb-ink)" }}>
                    Repetir contraseña
                  </label>
                  <input
                    className="w-full rounded-xl border px-4 py-3 placeholder:text-gray-400 focus:outline-none focus:ring-2 bg-white"
                    style={{
                      borderColor: "rgba(47,91,53,0.18)",
                      color: "var(--sb-ink)",
                    }}
                    type="password"
                    value={form.password2}
                    onChange={(e) => setForm((p) => ({ ...p, password2: e.target.value }))}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                </>
              )}

              <button
                onClick={registerMode ? doEmailRegister : doEmailLogin}
                disabled={busy}
                className="w-full mt-4 rounded-xl font-extrabold py-3 transition disabled:opacity-60 border"
                style={{
                  background: "var(--sb-ink)",
                  color: "#F6FFE8",
                  borderColor: "rgba(47,91,53,0.30)",
                }}
                type="button"
              >
                {registerMode ? "Crear cuenta" : "Entrar"}
              </button>

              <div className="mt-3 flex items-center justify-between text-sm">
                <button
                  onClick={doResetPassword}
                  disabled={busy}
                  className="font-bold hover:underline"
                  style={{ color: "var(--sb-ink2)" }}
                  type="button"
                >
                  ¿Olvidaste tu contraseña?
                </button>

                <button
                  onClick={() => {
                    setMessage({ text: "", type: "" });
                    setRegisterMode((v) => !v);
                  }}
                  className="font-extrabold hover:underline"
                  style={{ color: "var(--sb-purple)" }}
                  type="button"
                >
                  {registerMode ? "Ya tengo cuenta" : "Regístrate"}
                </button>
              </div>

              <div className="h-5" />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AuthIsland;
