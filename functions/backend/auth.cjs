// functions/backend/auth.cjs
const admin = require("firebase-admin");

// ----------------------------------------
// Inicializar Firebase Admin una sola vez
// ----------------------------------------
if (!admin.apps.length) {
  admin.initializeApp();
  console.log("✅ Firebase Admin inicializado");
}

function extractTokenFromReq(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (authHeader && typeof authHeader === "string") {
    const parts = authHeader.split(" ");
    if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
      return parts[1];
    }
  }

  if (req.headers["x-access-token"]) {
    return req.headers["x-access-token"];
  }

  return null;
}

function buildUser(decoded) {
  const isAdmin =
    decoded.isAdmin === true ||
    decoded.admin === true ||
    decoded.role === "admin";

  return {
    uid: decoded.uid,
    email: decoded.email || null,
    isAdmin,
    token: decoded,
  };
}

// ----------------------------------------
// authOptional: intenta decodificar token
// ----------------------------------------
async function authOptional(req, res, next) {
  if (req.user) return next();

  const token = extractTokenFromReq(req);
  if (!token) return next();

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = buildUser(decoded);
  } catch (err) {
    console.warn(
      "⚠️ Token Firebase inválido / expirado:",
      err.code || err.message || err
    );
  }

  return next();
}

// ----------------------------------------
// authRequired: exige token válido
// ----------------------------------------
async function authRequired(req, res, next) {
  if (req.user && req.user.uid) return next();

  const token = extractTokenFromReq(req);
  if (!token) {
    return res.status(401).json({ error: "No autorizado (sin token)" });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = buildUser(decoded);
    return next();
  } catch (err) {
    console.warn(
      "⚠️ Error verificando token en authRequired:",
      err.code || err.message || err
    );
    return res.status(401).json({ error: "No autorizado (token inválido)" });
  }
}

// ----------------------------------------
// Helper: comparar email body/query con user
// ----------------------------------------
function ensureSameUserEmail(req, emailFrom = "email") {
  if (!req.user || !req.user.email) return false;

  const bodyEmail = req.body?.[emailFrom];
  const queryEmail = req.query?.[emailFrom];
  const value = bodyEmail || queryEmail || null;
  if (!value) return false;

  return String(value).toLowerCase() === String(req.user.email).toLowerCase();
}

module.exports = {
  admin,
  authOptional,
  authRequired,
  ensureSameUserEmail,
};
