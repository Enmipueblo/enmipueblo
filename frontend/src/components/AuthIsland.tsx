import React, { useEffect, useState, useRef } from "react";
import {
  onUserStateChange,
  loginWithEmail,
  registerWithEmail,
  signInWithGoogle,
  signOut,
  resetPassword,
} from "../lib/firebase.js";

const GoogleIcon = () => (
  <svg width="22" height="22" viewBox="0 0 48 48" className="inline mr-2 -mt-0.5">
    <g>
      <path
        fill="#4285F4"
        d="M44.5 20H24v8.5h11.7C34.4 33 29.7 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.7 2.9l6.4-6.4C34.1 5.1 29.3 3 24 3 12.9 3 4 11.9 4 23s8.9 20 20 20c10 0 18.3-7.2 18.3-19 0-1.3-.1-2.4-.3-3.5z"
      />
      <path
        fill="#34A853"
        d="M6.3 14.7l7 5.1C15.5 16 19.4 13 24 13c3 0 5.7 1.1 7.7 2.9l6.4-6.4C34.1 5.1 29.3 3 24 3c-7.6 0-14.3 4.4-17.7 10.7z"
      />
      <path
        fill="#FBBC05"
        d="M24 44c5.7 0 10.4-1.9 13.8-5.1l-6.4-5.2c-2 1.4-4.7 2.3-7.4 2.3-5.7 0-10.4-3.8-12.1-8.8l-7.1 5.4C7.6 39.6 15 44 24 44z"
      />
      <path
        fill="#EA4335"
        d="M44.5 20H24v8.5h11.7c-1.1 3.3-4.7 7.5-11.7 7.5-6.6 0-12-5.4-12-12 0-2 .5-3.9 1.4-5.6l-7-5.1C6.2 16.7 4 19.7 4 23c0 11.1 8.9 20 20 20 10 0 18.3-7.2 18.3-19 0-1.3-.1-2.4-.3-3.5z"
      />
    </g>
  </svg>
);

type MessageState = {
  text: string;
  type: "info" | "success" | "error" | "";
};

declare global {
  interface Window {
    showAuthModal?: () => void;
    hideAuthModal?: () => void;
  }
}

const AuthIsland = ({ className = "", size = "normal" }) => {
  const [user, setUser] = useState<any>(undefined);
  const [showModal, setShowModal] = useState(false);
  const [registerMode, setRegisterMode] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });

  const [resetEmail, setResetEmail] = useState("");
  const [showResetBox, setShowResetBox] = useState(false);

  const [message, setMessage] = useState<MessageState>({
    text: "",
    type: "",
  });

  const modalRef = useRef<HTMLDivElement>(null);

  // =======================
  // USER STATE
  // =======================
  useEffect(() => {
    const unsub = onUserStateChange((u) => {
      setUser(u);
      if (u) setShowModal(false);
    });
    return () => unsub?.();
  }, []);

  // =======================
  // GLOBAL OPEN FROM HEADER BUTTON
  // =======================
  useEffect(() => {
    window.showAuthModal = () => setShowModal(true);
    window.hideAuthModal = () => setShowModal(false);
    return () => {
      window.showAuthModal = undefined;
      window.hideAuthModal = undefined;
    };
  }, []);

  // =======================
  // ESC TO CLOSE
  // =======================
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowModal(false);
    };
    if (showModal) window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [showModal]);

  // =======================
  // CLICK OUTSIDE TO CLOSE
  // =======================
  useEffect(() => {
    const handler = (ev: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(ev.target as Node)) {
        setShowModal(false);
      }
    };
    if (showModal) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showModal]);

  if (user === undefined) return null;

  // =======================
  // FORM SUBMIT (email/pass)
  // =======================
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage({ text: "Procesando…", type: "info" });

    try {
      if (registerMode) {
        await registerWithEmail(form.email, form.password);
        setMessage({
          text: "Registro exitoso. Ya puedes entrar con tu correo y contraseña.",
          type: "success",
        });
      } else {
        await loginWithEmail(form.email, form.password);
        setMessage({ text: "¡Bienvenido!", type: "success" });
      }
    } catch (error: any) {
      const code = error?.code || "";
      let text =
        error?.message || "Error inesperado. Inténtalo de nuevo más tarde.";

      const map: Record<string, string> = {
        "auth/email-already-in-use":
          "Este email ya está registrado. Si creaste la cuenta con Google, usa el botón “Entrar con Google”.",
        "auth/invalid-email": "Email inválido.",
        "auth/weak-password": "La contraseña es muy corta.",
        "auth/wrong-password": "Contraseña incorrecta.",
        "auth/user-not-found":
          "Usuario no encontrado. Revisa el correo o regístrate.",
      };

      if (map[code]) text = map[code];

      setMessage({
        text,
        type: "error",
      });
    }
  }

  // =======================
  // GOOGLE LOGIN
  // =======================
  async function handleGoogle() {
    setMessage({ text: "Abriendo Google…", type: "info" });

    try {
      await signInWithGoogle();
      setMessage({ text: "¡Bienvenido!", type: "success" });
    } catch (error: any) {
      const code = error?.code || "";
      let text =
        error?.message || "Error iniciando sesión con Google. Inténtalo de nuevo.";

      if (code === "auth/account-exists-with-different-credential") {
        text =
          "Ya existe una cuenta con este correo pero con otro método de acceso. Entra con email/contraseña o usa la misma opción con la que te registraste.";
      }

      setMessage({
        text,
        type: "error",
      });
    }
  }

  // =======================
  // FORGOT PASSWORD (CAJA PROPIA)
  // =======================
  async function handleForgotPassword() {
    if (!resetEmail) {
      setMessage({
        text: "Escribe tu correo en la caja de recuperación.",
        type: "error",
      });
      return;
    }

    setMessage({ text: "Enviando enlace de recuperación…", type: "info" });

    try {
      await resetPassword(resetEmail);
      setMessage({
        text:
          "Si existe una cuenta con ese correo, te hemos enviado un email para restablecer la contraseña.",
        type: "success",
      });
    } catch (error: any) {
      setMessage({
        text:
          error?.message ||
          "No se pudo enviar el correo de recuperación. Inténtalo de nuevo.",
        type: "error",
      });
    }
  }

  // =======================
  // BUTTON STYLE EN HEADER
  // =======================
  const buttonBase =
    size === "large"
      ? "bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-8 rounded-xl shadow-lg"
      : "bg-white text-emerald-700 border border-emerald-200 px-3 py-1 rounded-lg font-medium";

  const username = user?.email?.split("@")[0] || "Cuenta";

  return (
    <>
      {/* HEADER (cuando está logueado) */}
      {user ? (
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs font-bold uppercase">
              {username.charAt(0)}
            </div>
            <span className="text-sm md:text-base font-semibold text-white truncate max-w-[120px]">
              {username}
            </span>
          </div>
          <a
            href="/usuario/panel"
            className="text-xs md:text-sm bg-emerald-900/40 text-emerald-50 px-3 py-1 rounded-full border border-emerald-100/60 hover:bg-emerald-900/70"
          >
            Panel
          </a>
          <button
            onClick={signOut}
            className="text-xs md:text-sm bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full font-semibold hover:bg-emerald-200"
          >
            salir
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowModal(true)}
          className={`${buttonBase} ${className}`}
        >
          Iniciar sesión
        </button>
      )}

      {/* =======================
          MODAL LOGIN
      ======================= */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div
            ref={modalRef}
            className="relative w-full max-w-sm bg-white rounded-2xl px-8 py-9 shadow-2xl border border-gray-100"
          >
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-3 right-3 text-gray-400 hover:text-emerald-600 text-2xl"
            >
              ×
            </button>

            <h2 className="text-2xl font-bold text-center text-emerald-700 mb-2">
              {registerMode ? "Crear cuenta" : "Iniciar sesión"}
            </h2>
            <p className="text-xs text-center text-gray-500 mb-4">
              Te recomendamos usar Google para entrar más rápido.
            </p>

            {message.text && (
              <div
                className={`text-center text-xs rounded px-3 py-2 mb-4 ${
                  message.type === "success"
                    ? "bg-emerald-50 text-emerald-700"
                    : message.type === "error"
                    ? "bg-red-50 text-red-600"
                    : "bg-gray-50 text-gray-700"
                }`}
              >
                {message.text}
              </div>
            )}

            {/* GOOGLE - opción principal */}
            <button
              type="button"
              onClick={handleGoogle}
              className="w-full py-3 rounded-xl bg-white hover:bg-gray-50 text-gray-900 font-semibold flex items-center justify-center shadow-md border border-gray-200"
            >
              <GoogleIcon />{" "}
              {registerMode ? "Registrarse con Google" : "Entrar con Google"}
            </button>

            {/* Separador */}
            <div className="flex items-center my-4">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="px-3 text-[11px] uppercase tracking-wide text-gray-400">
                o con tu correo
              </span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* FORM EMAIL/PASS */}
            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600">
                  Correo electrónico
                </label>
                <input
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="tucorreo@ejemplo.com"
                  value={form.email}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, email: e.target.value }))
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600">
                  Contraseña
                </label>
                <input
                  type="password"
                  autoComplete={registerMode ? "new-password" : "current-password"}
                  required
                  placeholder="********"
                  value={form.password}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, password: e.target.value }))
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
                />

                {/* Link que abre la cajita de recuperación */}
                {!registerMode && !showResetBox && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowResetBox(true);
                      setMessage({ text: "", type: "" });
                      if (!resetEmail && form.email) {
                        setResetEmail(form.email);
                      }
                    }}
                    className="self-end mt-1 text-[11px] text-emerald-600 hover:text-emerald-800 underline"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                )}
              </div>

              <button
                type="submit"
                className="mt-2 w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              >
                {registerMode ? "Registrarse con correo" : "Entrar con correo"}
              </button>
            </form>

            {/* Cajita de recuperación */}
            {!registerMode && showResetBox && (
              <div className="mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                <p className="text-xs text-emerald-800 mb-2">
                  Escribe el correo asociado a tu cuenta y te enviaremos un enlace
                  para restablecer la contraseña.
                </p>
                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="tucorreo@ejemplo.com"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="flex-1 border border-emerald-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
                  />
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
                  >
                    Enviar
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setShowResetBox(false)}
                  className="mt-1 text-[11px] text-emerald-700 underline"
                >
                  Cerrar recuperación
                </button>
              </div>
            )}

            <div className="text-center text-xs text-gray-500 mt-4">
              {registerMode ? (
                <>
                  ¿Ya tienes cuenta?{" "}
                  <button
                    onClick={() => {
                      setRegisterMode(false);
                      setMessage({ text: "", type: "" });
                    }}
                    className="text-emerald-600 underline"
                  >
                    Inicia sesión
                  </button>
                </>
              ) : (
                <>
                  ¿No tienes cuenta?{" "}
                  <button
                    onClick={() => {
                      setRegisterMode(true);
                      setMessage({ text: "", type: "" });
                    }}
                    className="text-emerald-600 underline"
                  >
                    Regístrate
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AuthIsland;
