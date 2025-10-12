// src/lib/firebase.js
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// Configuración de Firebase
const firebaseConfig = {
  apiKey: import.meta.env.PUBLIC_FIREBASE_API_KEY,
  authDomain: import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.PUBLIC_FIREBASE_APP_ID,
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const storage = getStorage(app);

// Funciones de Autenticación
export const registerWithEmail = async (email, password) => {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  // Guardar email en cookie para perfil y anuncios
  document.cookie = `userEmail=${result.user.email}; path=/; max-age=${
    60 * 60 * 24
  }`;
  return result;
};

export const loginWithEmail = async (email, password) => {
  const result = await signInWithEmailAndPassword(auth, email, password);
  // Guardar email en cookie para perfil y anuncios
  document.cookie = `userEmail=${result.user.email}; path=/; max-age=${
    60 * 60 * 24
  }`;
  return result;
};

export const signOut = async () => {
  await firebaseSignOut(auth);
  // Eliminar cookie al cerrar sesión
  document.cookie = 'userEmail=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
};

export const signInWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  // Guardar email en cookie al iniciar con Google
  document.cookie = `userEmail=${result.user.email}; path=/; max-age=${
    60 * 60 * 24
  }`;
  return result;
};

// Función: Subir archivo a Firebase Storage
export async function uploadFile(file, path) {
  if (!file) {
    throw new Error('No se proporcionó ningún archivo para subir.');
  }
  const storageRef = ref(storage, path);
  const uploadTask = uploadBytes(storageRef, file);

  try {
    const snapshot = await uploadTask;
    const downloadURL = await getDownloadURL(snapshot.ref);
    console.log('Archivo subido exitosamente:', downloadURL);
    return downloadURL;
  } catch (error) {
    console.error('Error al subir archivo a Firebase Storage:', error);
    throw error;
  }
}

// ...tu código...

export const getUserCache = () => {
  if (typeof window !== 'undefined' && window.__enmiPuebloUser__) {
    return window.__enmiPuebloUser__;
  }
  return null;
};

export const onUserStateChange = callback => {
  return onAuthStateChanged(auth, user => {
    // Guarda usuario en variable global
    if (typeof window !== 'undefined') window.__enmiPuebloUser__ = user;
    callback(user);
    // cookies igual que antes...
    if (user) {
      document.cookie = `userEmail=${user.email}; path=/; max-age=${
        60 * 60 * 24
      }`;
    } else {
      document.cookie =
        'userEmail=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    }
  });
};
