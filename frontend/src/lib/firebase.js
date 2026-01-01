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
  uploadBytesResumable,
  getDownloadURL,
} from "firebase/storage";

// -----------------------------------------------------
// CONFIGURACIÓN DE FIREBASE
// -----------------------------------------------------
const firebaseConfig = {
  apiKey: import.meta.env.PUBLIC_FIREBASE_API_KEY,
  authDomain: import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:
    import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET ||
    "enmipueblo-2504f.appspot.com",
  messagingSenderId: import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
const storage = getStorage(app);
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
// AUTH
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

export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
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

// -----------------------------------------------------
// SUBIDA DE ARCHIVOS A FIREBASE STORAGE (con progreso)
// -----------------------------------------------------
export async function uploadFile(file, tipo = "otros", onProgress) {
  if (!file) throw new Error("No se proporcionó archivo");

  // 🔒 Para escribir en Storage exigimos sesión: las reglas también lo requieren.
  const user = auth.currentUser;
  if (!user || !user.uid) {
    throw new Error("Debes iniciar sesión para subir archivos");
  }

  const timestamp = Date.now();
  const safeName = file.name
    .replace(/[\/\\]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);

  const basePath = String(tipo || "otros").replace(/^\/+/, "").replace(/\/+$/, "");
  // Estructura recomendada: <base>/<uid>/<timestamp>_file.ext
  const filePath = `${basePath}/${user.uid}/${timestamp}_${safeName}`;

  const storageRef = ref(storage, filePath);

  return await new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file);

    task.on(
      "state_changed",
      (snapshot) => {
        if (typeof onProgress === "function" && snapshot.totalBytes > 0) {
          const pct = Math.round(
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100
          );
          onProgress(pct);
        }
      },
      (err) => reject(err),
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        resolve(url);
      }
    );
  });
}
