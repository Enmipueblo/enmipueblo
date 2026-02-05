// functions/backend/auth.cjs
// Auth SIN Firebase: verificamos el Google ID Token (JWT) con google-auth-library.
//
// Flujo:
// - Frontend obtiene un ID token con Google Identity Services (GIS).
// - Frontend envía: Authorization: Bearer <ID_TOKEN>
// - Backend verifica firma/audience y exp, y expone req.user.
//
// Requisitos ENV (backend):
// - GOOGLE_CLIENT_ID  (OAuth Client ID de tipo "Web application")

const { OAuth2Client } = require("google-auth-library");

const oauthClient = new OAuth2Client();

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

function mustEnv(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error(`Falta variable de entorno: ${name}`);
  return String(v).trim();
}

async function verifyGoogleIdToken(idToken) {
  const audience = mustEnv("GOOGLE_CLIENT_ID");
  const ticket = await oauthClient.verifyIdToken({ idToken, audience });
  const payload = ticket.getPayload();
  if (!payload) throw new Error("Token sin payload");
  return payload;
}

function buildReqUserFromPayload(payload) {
  return {
    uid: payload.sub || "",
    email: payload.email || "",
    name: payload.name || "",
    picture: payload.picture || "",
    isAdmin: isAdminEmail(payload.email || ""),
  };
}

async function authRequired(req, res, next) {
  const token = readBearerToken(req);
  try {
    if (!token) return res.status(401).json({ error: "No autorizado" });

    const payload = await verifyGoogleIdToken(token);
    req.user = buildReqUserFromPayload(payload);

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

    const payload = await verifyGoogleIdToken(token);
    req.user = buildReqUserFromPayload(payload);

    return next();
  } catch (err) {
    // En opcional no bloqueamos el request, solo ignoramos el token.
    console.warn("authOptional token no verificable:", err?.message || err);
    return next();
  }
}

module.exports = {
  authRequired,
  authOptional,
  isAdminEmail,
};
