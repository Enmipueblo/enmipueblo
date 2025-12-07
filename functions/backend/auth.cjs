// functions/backend/auth.cjs
const admin = require("firebase-admin");

// ----------------------------------------
// 🔐 Inicializar Firebase Admin (una sola vez)
// ----------------------------------------
if (!admin.apps.length) {
  admin.initializeApp();
  console.log("✅ Firebase Admin inicializado");
}

// ----------------------------------------
// 👑 Super-admins "de fábrica" (bootstrapping)
//  - Estos emails SIEMPRE son admins, aunque no tengan claim.
//  - Úsalos con mucho cuidado.
// ----------------------------------------
const SUPER_ADMIN_EMAILS = [
  "serviciosenmipueblo@gmail.com",
  // Puedes añadir más correos si quieres tener varios superadmins:
  // "otroadmin@ejemplo.com",
];

function isSuperAdminEmail(email) {
  if (!email) return false;
  const normalized = String(email).toLowerCase();
  return SUPER_ADMIN_EMAILS.includes(normalized);
}

// ----------------------------------------
// 🔎 Helper: obtener token del request
// ----------------------------------------
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
// 🧩 Construir objeto req.user a partir del token decodificado
// ----------------------------------------
function buildUserFromDecoded(decoded) {
  const email = decoded.email || null;

  // Rol desde custom claims (pro)
  const roleFromClaims =
    decoded.role || (decoded.admin === true ? "admin" : null);

  const superAdmin = isSuperAdminEmail(email);

  const role = roleFromClaims || (superAdmin ? "admin" : null);

  return {
    uid: decoded.uid,
    email,
    role,
    isAdmin: role === "admin",
    isSuperAdmin: superAdmin,
    token: decoded,
  };
}

// ----------------------------------------
// 🟢 Middleware: intenta decodificar token (NO obliga)
//    - Si hay token válido → req.user = {...}
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
    req.user = buildUserFromDecoded(decoded);
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
    String(value).toLowerCase() === String(req.user.email).toLowerCase()
  );
}

// ----------------------------------------
// 👮 Middleware: requiere rol admin/superadmin
// ----------------------------------------
async function adminRequired(req, res, next) {
  // Si ya tenemos req.user (authOptional o authRequired)
  if (req.user && (req.user.isSuperAdmin || req.user.isAdmin)) {
    return next();
  }

  // Si no hay user aún, intentamos verificar el token igual que authRequired
  const token = extractTokenFromReq(req);
  if (!token) {
    return res.status(401).json({ error: "No autorizado (sin token)" });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const user = buildUserFromDecoded(decoded);
    if (!user.isSuperAdmin && !user.isAdmin) {
      return res.status(403).json({ error: "Solo administradores" });
    }
    req.user = user;
    return next();
  } catch (err) {
    console.warn(
      "⚠️ Error verificando token en adminRequired:",
      err.code || err.message || err
    );
    return res.status(401).json({ error: "No autorizado (token inválido)" });
  }
}

module.exports = {
  admin,
  authOptional,
  authRequired,
  ensureSameUserEmail,
  adminRequired,
  isSuperAdminEmail,
};
