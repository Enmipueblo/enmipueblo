// src/lib/firebase.js
import { initializeApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
} from "firebase/auth";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";

// -----------------------------------------------------
// CONFIGURACIÓN DE FIREBASE
// (usa las vars PUBLIC_ del .env del frontend)
// -----------------------------------------------------
const firebaseConfig = {
  apiKey: import.meta.env.PUBLIC_FIREBASE_API_KEY,
  authDomain: import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID,
  // Forzamos el bucket correcto por seguridad
  storageBucket:
    import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET ||
    "enmipueblo-2504f.appspot.com",
  messagingSenderId: import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const storage = getStorage(app);
const googleProvider = new GoogleAuthProvider();

// -----------------------------------------------------
// Helpers internos: cookies y usuario global
// -----------------------------------------------------
function setUserCookie(user) {
  if (typeof document === "undefined") return;

  if (user && user.email) {
    // cookie por 30 días
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
// AUTH: REGISTRO / LOGIN / LOGOUT
// -----------------------------------------------------
export async function registerWithEmail(email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const user = cred.user;
  setUserCookie(user);
  setGlobalUser(user);
  return user;
}

export async function loginWithEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const user = cred.user;
  setUserCookie(user);
  setGlobalUser(user);
  return user;
}

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

// Recuperar contraseña por correo
export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

// -----------------------------------------------------
// OBSERVADOR DE USUARIO
// -----------------------------------------------------
// Se usa en: AuthIsland, FavoritosIsland, SearchServiciosIsland, etc.
export function onUserStateChange(callback) {
  // En SSR no hacemos nada
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

        // Mutamos el objeto FirebaseUser (no perdemos métodos)
        user.role = role;
        user.isAdmin = role === "admin" || role === "superadmin";
      } catch (err) {
        console.warn("No se pudieron leer los claims de rol:", err);
      }
    }

    callback(user);
  });
}

// -----------------------------------------------------
// SUBIDA DE ARCHIVOS A FIREBASE STORAGE
// -----------------------------------------------------
// Se usa en OfrecerServicioIsland como `uploadFile`
export async function uploadFile(file, tipo = "otros") {
  if (!file) throw new Error("No se proporcionó archivo");

  const timestamp = Date.now();
  const safeName = file.name.replace(/\s+/g, "_");
  const filePath = `${tipo}/${timestamp}_${safeName}`;

  const storageRef = ref(storage, filePath);
  const snapshot = await uploadBytes(storageRef, file);
  const downloadURL = await getDownloadURL(snapshot.ref);

  return downloadURL;
}
