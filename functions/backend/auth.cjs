const { OAuth2Client } = require("google-auth-library");

const client = new OAuth2Client();

function getBearerToken(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function adminList() {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function isAdminEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return false;
  return adminList().includes(e);
}

function normalizeUser(payload) {
  if (!payload) return null;

  const email = payload.email || null;

  return {
    uid: payload.sub,
    email,
    email_verified: !!payload.email_verified,
    name: payload.name || null,
    picture: payload.picture || null,

    // ✅ CLAVE: marcar admin desde ADMIN_EMAILS
    is_admin: isAdminEmail(email),
  };
}

async function verifyGoogleIdToken(idToken) {
  const audience = (process.env.GOOGLE_CLIENT_ID || "").trim();

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
  // compat: por si algún código usa req.user.is_admin o solo email
  if (req?.user?.is_admin === true) return true;
  return isAdminEmail(req?.user?.email);
}

module.exports = { authOptional, authRequired, isAdmin, isAdminEmail };
