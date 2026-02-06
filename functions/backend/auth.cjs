const { OAuth2Client } = require("google-auth-library");

const client = new OAuth2Client();

function getBearerToken(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function normalizeUser(payload) {
  if (!payload) return null;
  return {
    uid: payload.sub,
    email: payload.email || null,
    email_verified: !!payload.email_verified,
    name: payload.name || null,
    picture: payload.picture || null
  };
}

async function verifyGoogleIdToken(idToken) {
  const audience = (process.env.GOOGLE_CLIENT_ID || "").trim();

  // Si no hay audience, intentamos verificar igual (no rompe el deploy),
  // pero lo correcto es setear GOOGLE_CLIENT_ID en prod.
  const ticket = await client.verifyIdToken({
    idToken,
    ...(audience ? { audience } : {})
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
    // Token inválido: seguimos como "no logueado"
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
  } catch (e) {
    return res.status(401).json({ ok: false, error: "Invalid token" });
  }
}

function isAdmin(req) {
  const email = (req.user?.email || "").toLowerCase().trim();
  const admins = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  return email && admins.includes(email);
}

module.exports = { authOptional, authRequired, isAdmin };
