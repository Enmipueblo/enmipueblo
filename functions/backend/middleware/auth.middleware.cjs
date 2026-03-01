"use strict";

const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");

function parseAdminEmails() {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function getBearerToken(req) {
  const h = req.headers?.authorization || req.headers?.Authorization;
  if (!h) return "";
  const s = String(h);
  if (!s.toLowerCase().startsWith("bearer ")) return "";
  return s.slice(7).trim();
}

function getCookie(req, name) {
  const raw = req.headers?.cookie;
  if (!raw) return "";
  const parts = String(raw).split(";").map((p) => p.trim());
  for (const p of parts) {
    const idx = p.indexOf("=");
    if (idx === -1) continue;
    const k = p.slice(0, idx).trim();
    const v = p.slice(idx + 1).trim();
    if (k === name) return decodeURIComponent(v);
  }
  return "";
}

function getToken(req) {
  // prioridad: Authorization: Bearer ...
  const bearer = getBearerToken(req);
  if (bearer) return bearer;

  // fallback cookies comunes (por compatibilidad)
  return (
    getCookie(req, "emp_token") ||
    getCookie(req, "token") ||
    getCookie(req, "auth_token") ||
    ""
  );
}

function looksLikeJwt(token) {
  // 3 partes base64url
  return token.split(".").length === 3;
}

function getJwtSecret() {
  return (
    process.env.JWT_SECRET ||
    process.env.AUTH_JWT_SECRET ||
    process.env.SESSION_SECRET ||
    ""
  );
}

async function verifyJwt(token) {
  const secret = getJwtSecret();
  if (!secret) return null;
  try {
    return jwt.verify(token, secret);
  } catch (_e) {
    return null;
  }
}

async function verifyGoogleIdToken(token) {
  // client id puede venir con distintos nombres (compatibilidad)
  const clientId =
    process.env.PUBLIC_GOOGLE_CLIENT_ID ||
    process.env.GOOGLE_CLIENT_ID ||
    process.env.GOOGLE_OAUTH_CLIENT_ID ||
    "";

  if (!clientId) return null;

  try {
    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: clientId,
    });
    const payload = ticket.getPayload();
    if (!payload) return null;

    // Normalizamos a un shape parecido a "user"
    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      iss: payload.iss,
      aud: payload.aud,
      exp: payload.exp,
      iat: payload.iat,
      provider: "google",
    };
  } catch (_e) {
    return null;
  }
}

function normalizeUser(decoded) {
  if (!decoded || typeof decoded !== "object") return null;

  const email = (decoded.email || decoded.mail || "").toString().toLowerCase();
  const name = decoded.name || decoded.nombre || decoded.displayName || "";
  const picture = decoded.picture || decoded.avatar || decoded.photoURL || "";

  return {
    id: decoded.sub || decoded.id || decoded.uid || null,
    email: email || null,
    name: name || null,
    picture: picture || null,
    raw: decoded,
  };
}

function markAdmin(user) {
  if (!user || !user.email) return false;
  const admins = parseAdminEmails();
  return admins.includes(user.email.toLowerCase());
}

/**
 * authOptional:
 * - Si hay token válido, setea req.user
 * - Si no hay token o es inválido, sigue sin romper
 */
async function authOptional(req, _res, next) {
  try {
    const token = getToken(req);
    if (!token) return next();

    let decoded = null;

    // 1) Probar JWT propio si hay secret
    if (looksLikeJwt(token)) {
      decoded = await verifyJwt(token);
    }

    // 2) Probar Google ID token (si hay client id)
    if (!decoded) {
      decoded = await verifyGoogleIdToken(token);
    }

    const user = normalizeUser(decoded);
    if (user) {
      req.user = user;
      req.isAdmin = markAdmin(user);
    }

    return next();
  } catch (e) {
    // Nunca romper por auth opcional
    console.warn("⚠️ authOptional error:", e?.message || e);
    return next();
  }
}

/**
 * authRequired:
 * - Requiere usuario válido
 */
async function authRequired(req, res, next) {
  await authOptional(req, res, async () => {
    if (!req.user) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    return next();
  });
}

/**
 * requireAdmin:
 * - Requiere usuario y que esté en ADMIN_EMAILS
 */
async function requireAdmin(req, res, next) {
  await authRequired(req, res, async () => {
    if (!req.isAdmin) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }
    return next();
  });
}

module.exports = {
  authOptional,
  authRequired,
  requireAdmin,
};