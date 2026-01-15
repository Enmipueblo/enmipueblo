// frontend/src/lib/firebase.js
import { initializeApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";

// -----------------------------------------------------
// CONFIGURACIÓN DE FIREBASE
// -----------------------------------------------------
const firebaseConfig = {
  apiKey: import.meta.env.PUBLIC_FIREBASE_API_KEY,
  authDomain: import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();

// -----------------------------------------------------
// Helpers internos: cookies y usuario global
// -----------------------------------------------------
function setUserCookie(user) {
  if (typeof document === "undefined") return;

  if (user && user.email) {
    const maxAge = 60 * 60 * 24 * 30;
    document.cookie = `userEmail=${user.email}; path=/; max-age=${maxAge}`;
  } else {
    document.cookie =
      "userEmail=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  }
}

function setGlobalUser(user) {
  if (typeof window !== "undefined") {
    window.__enmiPuebloUser__ = user || null;
  }
}

// -----------------------------------------------------
// AUTH (SOLO GOOGLE)
// -----------------------------------------------------
export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  const user = result.user;
  setUserCookie(user);
  setGlobalUser(user);
  return user;
}

export async function signOut() {
  await firebaseSignOut(auth);
  setUserCookie(null);
  setGlobalUser(null);
}

// -----------------------------------------------------
// OBSERVADOR DE USUARIO
// -----------------------------------------------------
export function onUserStateChange(callback) {
  if (typeof window === "undefined") {
    callback(null);
    return () => {};
  }

  return onAuthStateChanged(auth, async (user) => {
    setUserCookie(user);
    setGlobalUser(user);

    if (user) {
      try {
        const tokenResult = await user.getIdTokenResult();
        const role = tokenResult.claims?.role || null;
        user.role = role;
        user.isAdmin = role === "admin" || role === "superadmin";
      } catch (err) {
        console.warn("No se pudieron leer los claims de rol:", err);
      }
    }

    callback(user);
  });
}
