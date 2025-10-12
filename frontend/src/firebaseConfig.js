// src/firebaseConfig.js
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'; // Importar Storage

const firebaseConfig = {
  apiKey: import.meta.env.PUBLIC_FIREBASE_API_KEY,
  authDomain: import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET, // Añadir storageBucket
  // messagingSenderId, appId si los tienes
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const storage = getStorage(app); // Inicializar Storage

// Métodos de Auth (ya existentes)
export function signInWithGoogle() {
  return signInWithPopup(auth, provider);
}
export function registerWithEmail(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}
export function loginWithEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}
export function signOut() {
  return firebaseSignOut(auth);
}
export function onUserStateChange(callback) {
  return onAuthStateChanged(auth, callback);
}

// Función para subir archivos a Firebase Storage en la carpeta adecuada
export async function uploadFileToFirebase(file, tipo = 'otros') {
  const timestamp = Date.now();
  const safeName = file.name.replace(/\s+/g, '_'); // reemplaza espacios por _
  const path = `${tipo}/${timestamp}_${safeName}`;
  const storageRef = ref(storage, path);
  const snapshot = await uploadBytes(storageRef, file);
  const downloadURL = await getDownloadURL(snapshot.ref);
  return downloadURL;
}
