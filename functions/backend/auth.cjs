const { OAuth2Client } = require("google-auth-library");

const client = new OAuth2Client();

function getBearerToken(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function adminEmailSet() {
  const raw = String(process.env.ADMIN_EMAILS || "");
  const arr = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return new Set(arr);
}

function computeIsAdmin(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return false;
  return adminEmailSet().has(e);
}

function normalizeUser(payload) {
  if (!payload) return null;

  const email = payload.email || null;
  const is_admin = computeIsAdmin(email);

  const user = {
    uid: payload.sub,
    email,
    email_verified: !!payload.email_verified,
    name: payload.name || null,
    picture: payload.picture || null,
    is_admin,
    isAdmin: is_admin, // compat por si algún código usa camelCase
  };

  return user;
}

async function verifyGoogleIdToken(idToken) {
  const audience = String(process.env.GOOGLE_CLIENT_ID || "").trim();

  // Si no hay audience, verificamos igual (firma/exp),
  // pero idealmente GOOGLE_CLIENT_ID debería estar seteado en prod.
  const ticket = await client.verifyIdToken({
    idToken,
    ...(audience ? { audience } : {}),
  });

  return ticket.getPayload();
}

async function authOptional(req, _res, next) {
  try {
    const token = getBearerToken(req);
    if (!token) return next();

    const payload = await verifyGoogleIdToken(token);
    req.user = normalizeUser(payload);
    return next();
  } catch (_e) {
    return next();
  }
}

async function authRequired(req, res, next) {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ ok: false, error: "No token" });

    const payload = await verifyGoogleIdToken(token);
    const user = normalizeUser(payload);

    if (!user?.email) {
      return res.status(401).json({ ok: false, error: "Invalid token" });
    }

    req.user = user;
    return next();
  } catch (_e) {
    return res.status(401).json({ ok: false, error: "Invalid token" });
  }
}

function isAdmin(req) {
  return !!req.user?.is_admin;
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req)) {
    return res.status(403).json({
      ok: false,
      error: "admin_required",
      email: req.user?.email || null,
    });
  }
  return next();
}

module.exports = { authOptional, authRequired, isAdmin, requireAdmin };
