import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
} from "firebase/auth";

const env = import.meta.env || {};

const CFG = {
  apiKey: env.PUBLIC_FIREBASE_API_KEY,
  authDomain: env.PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.PUBLIC_FIREBASE_APP_ID,
  measurementId: env.PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const BACKEND_BASE = env.PUBLIC_BACKEND_URL || "/api";

function missingFirebaseEnvs() {
  return (
    !CFG.apiKey ||
    !CFG.authDomain ||
    !CFG.projectId ||
    !CFG.storageBucket ||
    !CFG.messagingSenderId ||
    !CFG.appId
  );
}

let app = null;
let auth = null;

if (missingFirebaseEnvs()) {
  console.warn("[firebase] Faltan envs PUBLIC_FIREBASE_* (no se inicializa).");
} else {
  app = getApps().length ? getApps()[0] : initializeApp(CFG);
  auth = getAuth(app);
}

export function onUserStateChange(cb) {
  if (!auth) {
    cb(null);
    return () => {};
  }
  return onAuthStateChanged(auth, cb);
}

export async function signInWithGoogle() {
  if (!auth) throw new Error("Firebase no configurado");
  const provider = new GoogleAuthProvider();
  const res = await signInWithPopup(auth, provider);
  return res.user;
}

export async function signOut() {
  if (!auth) return;
  await fbSignOut(auth);
}

async function getIdTokenOrThrow() {
  if (!auth) throw new Error("Firebase no configurado");
  const user = auth.currentUser;
  if (!user) throw new Error("No autorizado (sin sesión)");
  return await user.getIdToken();
}

function randomId(len = 10) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function safeName(name) {
  return String(name || "file")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .slice(0, 80);
}

function pickKeyPrefix(opts) {
  if (!opts) return "service_images/fotos";
  if (opts.keyPrefix) return opts.keyPrefix;
  if (opts.prefix) return opts.prefix;
  if (opts.folder) return opts.folder;
  if (opts.path) return opts.path;
  return "service_images/fotos";
}

export async function uploadFile(file, opts = {}) {
  if (!file) throw new Error("Archivo vacío");

  const token = await getIdTokenOrThrow();

  const contentType = file.type || "application/octet-stream";
  const prefix = pickKeyPrefix(opts);

  const uid = auth.currentUser?.uid || "anon";
  const ext =
    opts.ext ||
    (() => {
      const n = file.name || "";
      const i = n.lastIndexOf(".");
      return i >= 0 ? n.slice(i) : "";
    })();

  const key =
    (opts.key && String(opts.key)) ||
    `${prefix}/${uid}/${Date.now()}_${randomId(8)}_${safeName(file.name)}${ext && !String(file.name).endsWith(ext) ? ext : ""}`;

  const signPayload = {
    key,
    contentType,
  };

  if (typeof opts.contentLength === "number") {
    signPayload.contentLength = opts.contentLength;
  } else if (typeof file.size === "number") {
    signPayload.contentLength = file.size;
  }

  const signRes = await fetch(`${BACKEND_BASE}/uploads/sign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(signPayload),
  });

  const signTxt = await signRes.text();
  let signJson = null;
  try {
    signJson = JSON.parse(signTxt);
  } catch {
    signJson = null;
  }

  if (!signRes.ok) {
    const msg = signJson?.error ? String(signJson.error) : signTxt || "sign failed";
    throw new Error(`sign failed ${signRes.status}: ${msg}`);
  }

  const uploadUrl =
    signJson?.uploadUrl ||
    signJson?.putUrl ||
    signJson?.signedUrl ||
    signJson?.url;

  const publicUrl =
    signJson?.publicUrl ||
    signJson?.publicURL ||
    signJson?.public ||
    signJson?.fileUrl ||
    null;

  if (!uploadUrl) throw new Error("sign ok pero falta uploadUrl");

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
    },
    body: file,
  });

  if (!putRes.ok) {
    const t = await putRes.text().catch(() => "");
    throw new Error(`upload failed ${putRes.status}: ${t}`);
  }

  return {
    key,
    url: publicUrl || null,
    publicUrl: publicUrl || null,
    contentType,
    size: file.size,
  };
}
