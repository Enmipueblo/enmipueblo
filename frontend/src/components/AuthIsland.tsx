import React, { useState, useEffect, useRef } from 'react';
import {
  onUserStateChange,
  loginWithEmail,
  registerWithEmail,
  signInWithGoogle,
  signOut,
} from '../lib/firebase.js';

const GoogleIcon = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 48 48"
    className="inline mr-2 -mt-0.5"
  >
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

const AuthIsland = ({
  className = '',
  size = 'normal',
}: {
  className?: string;
  size?: 'normal' | 'large';
}) => {
  const [user, setUser] = useState<any>(undefined);
  const [showModal, setShowModal] = useState(false);
  const [registerMode, setRegisterMode] = useState(false);
  const [form, setForm] = useState({ email: '', password: '' });
  const [message, setMessage] = useState({ text: '', type: '' });

  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.showAuthModal = () => setShowModal(true);
    window.hideAuthModal = () => setShowModal(false);
    return () => {
      window.showAuthModal = undefined;
      window.hideAuthModal = undefined;
    };
  }, []);

  // Esc para cerrar modal
  useEffect(() => {
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowModal(false);
    };
    if (showModal) window.addEventListener('keydown', escHandler);
    return () => window.removeEventListener('keydown', escHandler);
  }, [showModal]);

  // Clic fuera cierra modal
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        modalRef.current &&
        !modalRef.current.contains(event.target as Node)
      ) {
        setShowModal(false);
      }
    }
    if (showModal) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showModal]);

  useEffect(() => {
    const unsub = onUserStateChange(u => {
      setUser(u);
      if (u) setShowModal(false);
    });
    return () => unsub && unsub();
  }, []);

  if (user === undefined) return null;

  const handleSubmit = async e => {
    e.preventDefault();
    setMessage({ text: 'Procesando...', type: 'info' });
    try {
      if (registerMode) {
        await registerWithEmail(form.email, form.password);
        setMessage({ text: 'Registro exitoso. ¡Bienvenido!', type: 'success' });
      } else {
        await loginWithEmail(form.email, form.password);
        setMessage({
          text: 'Inicio de sesión exitoso. ¡Bienvenido!',
          type: 'success',
        });
      }
      setTimeout(() => setShowModal(false), 900);
    } catch (error) {
      let msg = 'Ocurrió un error. Inténtalo de nuevo.';
      switch (error.code) {
        case 'auth/email-already-in-use':
          msg = 'Este email ya está registrado.';
          break;
        case 'auth/invalid-email':
          msg = 'Formato de email inválido.';
          break;
        case 'auth/weak-password':
          msg = 'La contraseña debe tener al menos 6 caracteres.';
          break;
        case 'auth/user-not-found':
        case 'auth/wrong-password':
          msg = 'Email o contraseña incorrectos.';
          break;
        case 'auth/user-disabled':
          msg = 'Tu cuenta ha sido deshabilitada.';
          break;
        case 'auth/popup-closed-by-user':
          msg = 'Ventana de Google cerrada.';
          break;
        default:
          msg = error.message;
      }
      setMessage({ text: msg, type: 'error' });
    }
  };

  const handleGoogle = async () => {
    setMessage({ text: 'Iniciando sesión con Google...', type: 'info' });
    try {
      await signInWithGoogle();
      setMessage({ text: '¡Bienvenido!', type: 'success' });
      setTimeout(() => setShowModal(false), 800);
    } catch (error) {
      setMessage({
        text: error.message || 'Error con Google Auth.',
        type: 'error',
      });
    }
  };

  const nombreUsuario = user?.email?.split('@')[0] || '';

  const buttonBase =
    size === 'large'
      ? 'bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-8 rounded-xl shadow-lg text-lg transition'
      : 'bg-white text-emerald-700 border border-emerald-200 px-3 py-1 rounded-lg font-medium text-sm hover:bg-emerald-50 transition';

  return (
    <>
      {user ? (
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-white truncate max-w-[90px]">
            {nombreUsuario}
          </span>
          <a
            href="/usuario/panel"
            className="text-xs text-emerald-100 hover:text-emerald-300 underline font-medium"
            style={{ minWidth: 0 }}
          >
            Panel
          </a>
          <button
            onClick={signOut}
            className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-md text-xs font-bold hover:bg-emerald-200 border border-emerald-300 transition"
            title="Cerrar sesión"
            style={{ minWidth: 0, fontWeight: 500 }}
          >
            salir
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowModal(true)}
          className={buttonBase + ' ' + className}
        >
          Iniciar Sesión
        </button>
      )}

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[3px] animate-fadein"
          style={{ animation: 'fadeInBg 0.35s' }}
        >
          <div
            ref={modalRef}
            className="relative w-full max-w-sm bg-white/70 dark:bg-slate-900/70 rounded-2xl px-8 py-9 shadow-2xl border border-gray-100 flex flex-col items-stretch gap-2
            backdrop-blur-xl
            animate-modalpop"
            style={{
              minWidth: '330px',
              boxShadow:
                '0 8px 40px 0 rgba(22, 101, 52, 0.20), 0 1.5px 10px 0 rgba(0,0,0,.13)',
              animation: 'modalPopIn 0.35s cubic-bezier(.51,.92,.24,1.3)',
            }}
            aria-modal="true"
            role="dialog"
          >
            {/* Cerrar */}
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-3 right-3 text-gray-400 hover:text-emerald-600 text-2xl transition"
              aria-label="Cerrar"
            >
              &times;
            </button>

            {/* Título CON margen */}
            <h2 className="text-2xl font-bold text-center text-emerald-700 mb-7 drop-shadow-sm tracking-tight select-none">
              {registerMode ? 'Crear cuenta' : 'Iniciar sesión'}
            </h2>

            {/* Mensaje feedback */}
            {message.text && (
              <div
                className={
                  'text-center text-xs rounded px-3 py-2 mb-2 select-none ' +
                  (message.type === 'success'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                    : message.type === 'error'
                    ? 'bg-red-50 text-red-600 border border-red-100'
                    : 'bg-gray-50 text-gray-700 border border-gray-100')
                }
              >
                {message.text}
              </div>
            )}

            <form
              className="flex flex-col gap-6"
              onSubmit={handleSubmit}
              autoComplete="on"
            >
              {/* EMAIL */}
              <div className="relative">
                <input
                  type="email"
                  id="login-email"
                  required
                  autoFocus
                  className="peer w-full border-0 border-b-2 border-emerald-600 bg-transparent pt-6 pb-2 px-0 text-base text-white focus:outline-none focus:border-emerald-400 transition"
                  value={form.email}
                  onChange={e =>
                    setForm(f => ({ ...f, email: e.target.value }))
                  }
                  autoComplete="username"
                />
                <label
                  htmlFor="login-email"
                  className={
                    'absolute left-0 pointer-events-none transition-all duration-200 font-semibold select-none ' +
                    (form.email
                      ? 'top-1.5 text-xs text-emerald-400 opacity-90'
                      : 'top-5 text-base text-emerald-400 opacity-100') +
                    ' peer-focus:top-1.5 peer-focus:text-xs peer-focus:text-emerald-600 peer-focus:opacity-90'
                  }
                  style={{
                    background: 'transparent',
                    zIndex: 10,
                    paddingLeft: '2px',
                    letterSpacing: '0.02em',
                  }}
                >
                  Correo electrónico
                </label>
              </div>
              {/* PASSWORD */}
              <div className="relative">
                <input
                  type="password"
                  id="login-password"
                  required
                  className="peer w-full border-0 border-b-2 border-emerald-600 bg-transparent pt-6 pb-2 px-0 text-base text-white focus:outline-none focus:border-emerald-400 transition"
                  value={form.password}
                  onChange={e =>
                    setForm(f => ({ ...f, password: e.target.value }))
                  }
                  autoComplete={
                    registerMode ? 'new-password' : 'current-password'
                  }
                />
                <label
                  htmlFor="login-password"
                  className={
                    'absolute left-0 pointer-events-none transition-all duration-200 font-semibold select-none ' +
                    (form.password
                      ? 'top-1.5 text-xs text-emerald-400 opacity-90'
                      : 'top-5 text-base text-emerald-400 opacity-100') +
                    ' peer-focus:top-1.5 peer-focus:text-xs peer-focus:text-emerald-600 peer-focus:opacity-90'
                  }
                  style={{
                    background: 'transparent',
                    zIndex: 10,
                    paddingLeft: '2px',
                    letterSpacing: '0.02em',
                  }}
                >
                  Contraseña
                </label>
              </div>
              <button
                type="submit"
                className="w-full mt-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition text-base shadow-lg shadow-emerald-100/20"
              >
                {registerMode ? 'Registrarse' : 'Entrar'}
              </button>
            </form>

            <button
              type="button"
              onClick={handleGoogle}
              className="mt-3 w-full py-3 rounded-xl bg-white/70 hover:bg-emerald-50/70 border border-gray-200 text-emerald-700 font-semibold flex items-center justify-center transition text-base shadow shadow-emerald-100/10"
              style={{
                backdropFilter: 'blur(4px)',
                WebkitBackdropFilter: 'blur(4px)',
              }}
            >
              <GoogleIcon />
              <span className="ml-1">Entrar con Google</span>
            </button>

            <div className="text-center text-xs text-gray-400 mt-2 select-none">
              {registerMode ? (
                <>
                  ¿Ya tienes cuenta?{' '}
                  <button
                    onClick={() => {
                      setRegisterMode(false);
                      setMessage({ text: '', type: '' });
                    }}
                    className="text-emerald-600 underline hover:text-emerald-800 font-semibold"
                    type="button"
                  >
                    Inicia sesión
                  </button>
                </>
              ) : (
                <>
                  ¿No tienes cuenta?{' '}
                  <button
                    onClick={() => {
                      setRegisterMode(true);
                      setMessage({ text: '', type: '' });
                    }}
                    className="text-emerald-600 underline hover:text-emerald-800 font-semibold"
                    type="button"
                  >
                    Regístrate
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      <style>{`
        @keyframes fadeInBg {
          0% { background: rgba(16,16,16,0); }
          100% { background: rgba(16,16,16,0.38);}
        }
        @keyframes modalPopIn {
          0% { transform: translateY(40px) scale(.92); opacity: 0; }
          100% { transform: none; opacity: 1; }
        }
      `}</style>
    </>
  );
};

export default AuthIsland;
