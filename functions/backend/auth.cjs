// functions/backend/auth.cjs
const admin = require("firebase-admin");

// ----------------------------------------
// 🔐 Inicializar Firebase Admin (una sola vez)
// ----------------------------------------
if (!admin.apps.length) {
  admin.initializeApp();
  console.log("✅ Firebase Admin inicializado");
}

// Emails que SIEMPRE serán admin aunque el claim falle
const ADMIN_EMAILS = [
  "serviciosenmipueblo@gmail.com",
];

// Extrae token de Authorization: Bearer xxx o cabeceras alternativas
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

function buildUserFromDecoded(decoded) {
  const email = decoded.email || null;

  const claimAdmin =
    decoded.admin === true ||
    decoded.isAdmin === true ||
    decoded.role === "admin";

  const emailAdmin =
    email &&
    ADMIN_EMAILS.includes(String(email).toLowerCase());

  const isAdmin = !!(claimAdmin || emailAdmin);

  return {
    uid: decoded.uid,
    email,
    isAdmin,
    token: decoded,
  };
}

// ----------------------------------------
// 🟢 Middleware: intenta decodificar token (NO obliga)
//    - Si hay token válido → req.user = { uid, email, isAdmin, token }
//    - Si no hay token o es inválido → sigue como anónimo
// ----------------------------------------
async function authOptional(req, res, next) {
  if (req.user) return next(); // por si otro middleware ya lo puso

  const token = extractTokenFromReq(req);
  if (!token) {
    return next();
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = buildUserFromDecoded(decoded);
  } catch (err) {
    console.warn(
      "⚠️ Token Firebase inválido / expirado:",
      err.code || err.message || err
    );
  }

  return next();
}

// ----------------------------------------
// 🔒 Middleware: requiere estar autenticado
// ----------------------------------------
async function authRequired(req, res, next) {
  if (req.user && req.user.uid) return next();

  const token = extractTokenFromReq(req);
  if (!token) {
    return res.status(401).json({ error: "No autorizado (sin token)" });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = buildUserFromDecoded(decoded);
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
// 🧩 Helper para asegurar que el email del body/query
//     coincide con el usuario autenticado
// ----------------------------------------
function ensureSameUserEmail(req, emailFrom = "email") {
  if (!req.user || !req.user.email) return false;

  const bodyEmail = req.body?.[emailFrom];
  const queryEmail = req.query?.[emailFrom];

  const value = bodyEmail || queryEmail || null;
  if (!value) return false;

  return (
    String(value).toLowerCase() ===
    String(req.user.email).toLowerCase()
  );
}

module.exports = {
  admin,
  authOptional,
  authRequired,
  ensureSameUserEmail,
};
