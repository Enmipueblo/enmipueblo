import React, { useEffect, useState, useRef } from "react";
import {
  onUserStateChange,
  loginWithEmail,
  registerWithEmail,
  signInWithGoogle,
  signOut,
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

const AuthIsland = ({ className = "", size = "normal" }) => {
  const [user, setUser] = useState<any>(undefined);
  const [showModal, setShowModal] = useState(false);
  const [registerMode, setRegisterMode] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });
  const [message, setMessage] = useState({ text: "", type: "" });

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
  async function handleSubmit(e: any) {
    e.preventDefault();
    setMessage({ text: "Procesando...", type: "info" });

    try {
      if (registerMode) {
        await registerWithEmail(form.email, form.password);
        setMessage({ text: "Registro exitoso", type: "success" });
      } else {
        await loginWithEmail(form.email, form.password);
        setMessage({ text: "Bienvenido!", type: "success" });
      }
    } catch (error: any) {
      const map: Record<string, string> = {
        "auth/email-already-in-use": "Este email ya está registrado.",
        "auth/invalid-email": "Email inválido.",
        "auth/weak-password": "La contraseña es muy corta.",
        "auth/wrong-password": "Contraseña incorrecta.",
        "auth/user-not-found": "Usuario no encontrado.",
        "auth/popup-closed-by-user": "Ventana cerrada.",
      };
      setMessage({
        text: map[error.code] || error.message || "Error inesperado",
        type: "error",
      });
    }
  }

  // =======================
  // GOOGLE LOGIN (SAFARI SAFE)
  // =======================
  async function handleGoogle() {
    setMessage({ text: "Abriendo Google…", type: "info" });

    try {
      await signInWithGoogle(); // ya está preparado para Safari
      setMessage({ text: "¡Bienvenido!", type: "success" });
    } catch (err: any) {
      setMessage({
        text: err?.message || "Error iniciando Google",
        type: "error",
      });
    }
  }

  // =======================
  // BUTTON STYLE
  // =======================
  const buttonBase =
    size === "large"
      ? "bg-emerald-600 hover:bg-emerald-700 text-black font-bold py-3 px-8 rounded-xl shadow-lg"
      : "bg-white text-emerald-700 border border-emerald-200 px-3 py-1 rounded-lg font-medium";

  const username = user?.email?.split("@")[0];

  return (
    <>
      {user ? (
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-black truncate max-w-[90px]">
            {username}
          </span>
          <a
            href="/usuario/panel"
            className="text-xs text-emerald-100 underline hover:text-emerald-300"
          >
            Panel
          </a>
          <button
            onClick={signOut}
            className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-md text-xs font-bold hover:bg-emerald-200"
          >
            salir
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowModal(true)}
          className={`${buttonBase} ${className}`}
        >
          Iniciar Sesión
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

            <h2 className="text-2xl font-bold text-center text-emerald-700 mb-6">
              {registerMode ? "Crear cuenta" : "Iniciar sesión"}
            </h2>

            {message.text && (
              <div
                className={`text-center text-xs rounded px-3 py-2 mb-3 ${
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

            <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
              <input
                type="email"
                required
                placeholder="Correo"
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
                className="w-full border-b-2 border-emerald-600 bg-transparent py-2 focus:outline-none"
              />

              <input
                type="password"
                required
                placeholder="Contraseña"
                value={form.password}
                onChange={(e) =>
                  setForm((f) => ({ ...f, password: e.target.value }))
                }
                className="w-full border-b-2 border-emerald-600 bg-transparent py-2"
              />

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-lg"
              >
                {registerMode ? "Registrarse" : "Entrar"}
              </button>
            </form>

            {/* GOOGLE */}
            <button
              type="button"
              onClick={handleGoogle}
              className="mt-3 w-full py-3 rounded-xl bg-white border border-gray-200 text-emerald-700 font-semibold flex items-center justify-center shadow"
            >
              <GoogleIcon /> Entrar con Google
            </button>

            <div className="text-center text-xs text-gray-500 mt-3">
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
