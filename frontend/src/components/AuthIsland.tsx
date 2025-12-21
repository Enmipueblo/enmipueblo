import React, { useEffect, useState, useRef } from "react";

type MessageState = {
  text: string;
  type: "info" | "success" | "error" | "";
};

declare global {
  interface Window {
    showAuthModal?: () => void;
    hideAuthModal?: () => void;
    mobileAuthAction?: () => void;
    __enmiPuebloUser__?: any;
  }
}

let firebaseApiPromise: Promise<any> | null = null;
function getFirebaseApi() {
  if (!firebaseApiPromise) firebaseApiPromise = import("../lib/firebase.js");
  return firebaseApiPromise;
}

const GoogleIcon = () => (
  <svg width="22" height="22" viewBox="0 0 48 48" className="inline mr-2 -mt-0.5">
    <g>
      <path
        fill="#4285F4"
        d="M44.5 20H24v8.5h11.7C34.4 33 29.7 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8.1 3.1l5.7-5.7C34.4 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c10 0 18.3-7.2 18.3-19 0-1.3-.1-2.4-.3-3.5z"
      />
      <path
        fill="#34A853"
        d="M6.3 14.7l6.9 5.1C15 16.2 19.1 13 24 13c3.1 0 5.9 1.2 8.1 3.1l5.7-5.7C34.4 6.1 29.5 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"
      />
      <path
        fill="#FBBC05"
        d="M24 44c5.4 0 10.4-2 14.2-5.3l-6.6-5.4C29.7 36 27 37 24 37c-5.6 0-10.4-3.8-12.1-9l-7 5.4C8.1 39.7 15.5 44 24 44z"
      />
      <path
        fill="#EA4335"
        d="M44.5 20H24v8.5h11.7c-.7 2.2-2.1 4.1-4.1 5.4l6.6 5.4C41.9 36.6 44.5 31.8 44.5 24c0-1.3-.1-2.4-.3-3.5z"
      />
    </g>
  </svg>
);

const AuthIsland = ({ className = "", size = "normal" }: any) => {
  const [user, setUser] = useState<any>(undefined);
  const [showModal, setShowModal] = useState(false);
  const [registerMode, setRegisterMode] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });

  const [resetEmail, setResetEmail] = useState("");
  const [showResetBox, setShowResetBox] = useState(false);

  const [message, setMessage] = useState<MessageState>({ text: "", type: "" });

  const modalRef = useRef<HTMLDivElement>(null);

  // Auth subscription DIFERIDA
  useEffect(() => {
    let unsub: any = null;
    let canceled = false;

    const start = async () => {
      try {
        const fb = await getFirebaseApi();
        if (canceled) return;

        unsub = fb.onUserStateChange((u: any) => {
          setUser(u ? { email: u.email } : null);
          try {
            window.__enmiPuebloUser__ = u ? { email: u.email } : null;
            window.dispatchEvent(
              new CustomEvent("enmi:user", { detail: { user: u ? { email: u.email } : null } })
            );
          } catch {}
        });
      } catch {}
    };

    const w: any = window as any;
    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(start, { timeout: 2500 });
      return () => {
        canceled = true;
        try { w.cancelIdleCallback(id); } catch {}
        try { unsub?.(); } catch {}
      };
    } else {
      const t = setTimeout(start, 2500);
      return () => {
        canceled = true;
        clearTimeout(t);
        try { unsub?.(); } catch {}
      };
    }
  }, []);

  useEffect(() => {
    window.showAuthModal = () => setShowModal(true);
    window.hideAuthModal = () => setShowModal(false);

    window.mobileAuthAction = () => {
      if (user?.email) window.location.href = "/usuario/panel";
      else setShowModal(true);
    };
  }, [user]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowModal(false);
    }
    if (showModal) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showModal]);

  function closeSoon() {
    // cierra modal al loguear, como esperás
    setTimeout(() => setShowModal(false), 350);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage({ text: "Procesando…", type: "info" });

    try {
      const fb = await getFirebaseApi();
      if (registerMode) {
        await fb.registerWithEmail(form.email, form.password);
        setMessage({ text: "Registro exitoso. Ya puedes entrar.", type: "success" });
      } else {
        await fb.loginWithEmail(form.email, form.password);
        setMessage({ text: "¡Bienvenido!", type: "success" });
        closeSoon();
      }
    } catch (error: any) {
      const code = error?.code || "";
      let text = error?.message || "Error inesperado. Inténtalo de nuevo más tarde.";

      const map: Record<string, string> = {
        "auth/email-already-in-use": "Este email ya está registrado.",
        "auth/invalid-email": "Email inválido.",
        "auth/weak-password": "Contraseña débil.",
        "auth/invalid-credential": "Email o contraseña incorrectos.",
        "auth/wrong-password": "Email o contraseña incorrectos.",
        "auth/user-not-found": "Email o contraseña incorrectos.",
      };

      if (map[code]) text = map[code];
      setMessage({ text, type: "error" });
    }
  }

  async function handleGoogle() {
    setMessage({ text: "Abriendo Google…", type: "info" });

    try {
      const fb = await getFirebaseApi();
      await fb.signInWithGoogle();
      setMessage({ text: "¡Bienvenido!", type: "success" });
      closeSoon();
    } catch (error: any) {
      const code = error?.code || "";
      let text = error?.message || "Error iniciando sesión con Google. Inténtalo de nuevo.";

      const map: Record<string, string> = {
        "auth/popup-closed-by-user": "Cerraste la ventana de Google.",
        "auth/cancelled-popup-request": "Se canceló el popup anterior.",
        "auth/popup-blocked": "Tu navegador bloqueó el popup de Google.",
      };

      if (map[code]) text = map[code];
      setMessage({ text, type: "error" });
    }
  }

  async function handleLogout() {
    try {
      const fb = await getFirebaseApi();
      await fb.signOut();
      setMessage({ text: "Sesión cerrada.", type: "success" });
    } catch {
      setMessage({ text: "No se pudo cerrar sesión.", type: "error" });
    }
  }

  async function handleForgotPassword() {
    if (!resetEmail) {
      setMessage({ text: "Ingresa tu email.", type: "error" });
      return;
    }

    setMessage({ text: "Enviando…", type: "info" });

    try {
      const fb = await getFirebaseApi();
      await fb.resetPassword(resetEmail);
      setMessage({ text: "Email enviado. Revisa tu bandeja de entrada.", type: "success" });
      setShowResetBox(false);
      setResetEmail("");
    } catch (error: any) {
      const code = error?.code || "";
      let text = error?.message || "No se pudo enviar el email. Inténtalo de nuevo.";

      const map: Record<string, string> = {
        "auth/invalid-email": "Email inválido.",
        "auth/user-not-found": "No existe un usuario con ese email.",
      };

      if (map[code]) text = map[code];
      setMessage({ text, type: "error" });
    }
  }

  const buttonClass =
    size === "small" ? "px-3 py-2 text-sm rounded-xl" : "px-4 py-2 text-sm rounded-xl";

  return (
    <>
      {user?.email ? (
        <div className={`flex items-center gap-2 ${className}`}>
          <a
            href="/usuario/panel"
            className={`${buttonClass} bg-emerald-600 text-white hover:bg-emerald-700 font-semibold`}
          >
            Mi panel
          </a>
          <button
            onClick={handleLogout}
            className={`${buttonClass} bg-gray-100 hover:bg-gray-200 text-gray-900 border border-gray-200`}
            type="button"
          >
            Salir
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowModal(true)}
          className={`${buttonClass} bg-emerald-600 text-white hover:bg-emerald-700 font-semibold ${className}`}
          type="button"
        >
          Iniciar sesión
        </button>
      )}

      {showModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4 text-gray-900"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowModal(false);
          }}
        >
          <div
            ref={modalRef}
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-emerald-100 overflow-hidden text-gray-900"
          >
            <div className="p-5 border-b border-emerald-100 bg-emerald-50">
              <div className="flex items-center justify-between">
                <h2 className="font-extrabold text-emerald-900">
                  {registerMode ? "Crear cuenta" : "Iniciar sesión"}
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-600 hover:text-black"
                  aria-label="Cerrar"
                  type="button"
                >
                  ✕
                </button>
              </div>

              {message.text ? (
                <div
                  className={`mt-3 text-sm rounded-xl px-3 py-2 ${
                    message.type === "success"
                      ? "bg-emerald-100 text-emerald-900"
                      : message.type === "error"
                      ? "bg-red-100 text-red-900"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {message.text}
                </div>
              ) : null}
            </div>

            <div className="p-5 space-y-4">
              <button
                type="button"
                onClick={handleGoogle}
                className="w-full px-4 py-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 font-semibold text-gray-900"
              >
                <GoogleIcon />
                Continuar con Google
              </button>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-200"></div>
                <div className="text-xs text-gray-400">o</div>
                <div className="flex-1 h-px bg-gray-200"></div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                <input
                  type="email"
                  required
                  placeholder="Email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-400 text-gray-900 placeholder-gray-400 bg-white"
                />
                <input
                  type="password"
                  required
                  placeholder="Contraseña"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-400 text-gray-900 placeholder-gray-400 bg-white"
                />

                <button
                  type="submit"
                  className="w-full px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 font-semibold"
                >
                  {registerMode ? "Registrarme" : "Entrar"}
                </button>
              </form>

              {!registerMode && (
                <button
                  type="button"
                  onClick={() => setShowResetBox((v) => !v)}
                  className="text-xs text-emerald-700 underline"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              )}

              {showResetBox && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 space-y-2">
                  <div className="text-xs text-gray-700">
                    Te enviamos un email para restablecer la contraseña.
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      placeholder="tu@email.com"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      className="flex-1 border border-emerald-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white text-gray-900 placeholder-gray-400"
                    />
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
                    >
                      Enviar
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowResetBox(false)}
                    className="text-[11px] text-emerald-700 underline"
                  >
                    Cancelar
                  </button>
                </div>
              )}

              <div className="text-xs text-gray-600">
                {registerMode ? (
                  <>
                    ¿Ya tienes cuenta?{" "}
                    <button
                      type="button"
                      className="text-emerald-700 underline font-semibold"
                      onClick={() => setRegisterMode(false)}
                    >
                      Inicia sesión
                    </button>
                  </>
                ) : (
                  <>
                    ¿No tienes cuenta?{" "}
                    <button
                      type="button"
                      className="text-emerald-700 underline font-semibold"
                      onClick={() => setRegisterMode(true)}
                    >
                      Regístrate
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AuthIsland;
