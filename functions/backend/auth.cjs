const admin = require("firebase-admin");

let _inited = false;

function initFirebaseAdminOnce() {
  if (_inited) return;
  _inited = true;

  if (!admin.apps.length) {
    admin.initializeApp();
  }
  console.log("Firebase Admin inicializado");
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
  const s = String(h || "");
  if (!s.toLowerCase().startsWith("bearer ")) return null;
  return s.slice(7).trim();
}

async function verifyIdToken(idToken) {
  initFirebaseAdminOnce();
  return admin.auth().verifyIdToken(idToken);
}

async function authRequired(req, res, next) {
  const token = readBearerToken(req);
  try {
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
  const token = readBearerToken(req);
  try {
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
    console.warn("authOptional token no verificable:", err?.message || err);
    return next();
  }
}

module.exports = {
  authRequired,
  authOptional,
  isAdminEmail,
};
