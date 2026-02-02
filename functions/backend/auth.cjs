// functions/backend/auth.cjs
const admin = require("firebase-admin");

let _inited = false;

function getFirebaseProjectId() {
  const v =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    "";
  return String(v || "").trim();
}

function initFirebaseAdminOnce() {
  if (_inited) return;
  _inited = true;

  const projectId = getFirebaseProjectId();

  if (!admin.apps.length) {
    // Para verifyIdToken NO necesitas credenciales si tienes projectId,
    // pero sin projectId normalmente falla con "Failed to determine project ID".
    const opts = {};
    if (projectId) opts.projectId = projectId;
    admin.initializeApp(opts);
  }

  const pid = getFirebaseProjectId();
  console.log(`✅ Firebase Admin inicializado${pid ? ` (projectId=${pid})` : " (SIN projectId)"}`);
}

function normalizeEmail(e) {
  return String(e || "").trim().toLowerCase();
}

function getAdminEmailsSet() {
  const raw = process.env.ADMIN_EMAILS || "";
  const emails = raw
    .split(",")
    .map((s) => normalizeEmail(s))
    .filter(Boolean);
  return new Set(emails);
}

function isAdminEmail(email) {
  const set = getAdminEmailsSet();
  if (!set.size) return false;
  return set.has(normalizeEmail(email));
}

function readBearerToken(req) {
  const h = req.headers.authorization || req.headers.Authorization || "";
  const s = String(h);
  if (!s.toLowerCase().startsWith("bearer ")) return null;
  return s.slice(7).trim();
}

async function verifyIdToken(idToken) {
  initFirebaseAdminOnce();

  const projectId = getFirebaseProjectId();
  if (!projectId) {
    // Esto te evita el “silencio” y te da un error claro en logs.
    throw new Error("FIREBASE_PROJECT_ID no configurado en el backend");
  }

  return admin.auth().verifyIdToken(idToken);
}

async function authRequired(req, res, next) {
  try {
    const token = readBearerToken(req);
    if (!token) return res.status(401).json({ error: "No autorizado" });

    const decoded = await verifyIdToken(token);

    req.user = {
      uid: decoded.uid,
      email: decoded.email || "",
      name: decoded.name || "",
      picture: decoded.picture || "",
      isAdmin: isAdminEmail(decoded.email || ""),
    };

    return next();
  } catch (err) {
    console.error("authRequired error:", err?.message || err);
    return res.status(401).json({ error: "Token inválido" });
  }
}

async function authOptional(req, _res, next) {
  try {
    const token = readBearerToken(req);
    if (!token) return next();

    const decoded = await verifyIdToken(token);

    req.user = {
      uid: decoded.uid,
      email: decoded.email || "",
      name: decoded.name || "",
      picture: decoded.picture || "",
      isAdmin: isAdminEmail(decoded.email || ""),
    };

    return next();
  } catch (err) {
    // Antes estaba SILENCIADO. Ahora queda un warning útil.
    console.warn("authOptional: token no verificable:", err?.message || err);
    return next();
  }
}

module.exports = {
  authRequired,
  authOptional,
  isAdminEmail,
};
