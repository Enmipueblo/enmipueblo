// functions/backend/auth.cjs
const admin = require("firebase-admin");

// ----------------------------------------
// 🔐 Inicializar Firebase Admin (una sola vez)
// ----------------------------------------
if (!admin.apps.length) {
  admin.initializeApp();
  console.log("✅ Firebase Admin inicializado");
}

// Extrae token de Authorization: Bearer xxx o cabeceras alternativas
function extractTokenFromReq(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (authHeader && typeof authHeader === "string") {
    const parts = authHeader.split(" ");
    if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
      return parts[1];
    }
  }

  // Opcional: otras cabeceras por si en el futuro las usas
  if (req.headers["x-access-token"]) {
    return req.headers["x-access-token"];
  }

  return null;
}

// ----------------------------------------
// 🟢 Middleware: intenta decodificar token (NO obliga)
//    - Si hay token válido → req.user = { uid, email, token }
//    - Si no hay token o es inválido → sigue como anónimo
// ----------------------------------------
async function authOptional(req, res, next) {
  // Si ya está seteado por algún otro middleware, seguimos
  if (req.user) return next();

  const token = extractTokenFromReq(req);
  if (!token) {
    return next();
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = {
      uid: decoded.uid,
      email: decoded.email || null,
      token: decoded,
    };
  } catch (err) {
    // Log suave, sin cortar la petición
    console.warn(
      "⚠️ Token Firebase inválido / expirado:",
      err.code || err.message || err
    );
  }

  return next();
}

// ----------------------------------------
// 🔒 Middleware: requiere estar autenticado
//    (lo usaremos luego en rutas sensibles)
// ----------------------------------------
async function authRequired(req, res, next) {
  // Si ya hay user (porque pasó por authOptional antes)
  if (req.user && req.user.uid) return next();

  const token = extractTokenFromReq(req);
  if (!token) {
    return res.status(401).json({ error: "No autorizado (sin token)" });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = {
      uid: decoded.uid,
      email: decoded.email || null,
      token: decoded,
    };
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
//     (lo usaremos luego en POST/PUT/DELETE)
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
