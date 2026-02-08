const express = require("express");
const { MongoClient } = require("mongodb");

const router = express.Router();

const { authOptional, authRequired, isAdmin } = require("../auth.cjs");

let _mongoClient = null;

function mongoUri() {
  return (
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    process.env.MONGO_URL ||
    process.env.DATABASE_URL ||
    ""
  ).trim();
}

async function db() {
  const uri = mongoUri();
  if (!uri) throw new Error("Falta MONGO_URI / MONGODB_URI en env");

  if (!_mongoClient) {
    _mongoClient = new MongoClient(uri);
    await _mongoClient.connect();
  }
  return _mongoClient.db(); // usa el DB del URI (ej: .../enmipueblo)
}

function normEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function getEntitlementByEmail(email) {
  const e = normEmail(email);
  if (!e) return null;
  const database = await db();
  return await database.collection("entitlements").findOne({ email: e });
}

function computeIsPro(ent) {
  if (!ent) return { isPro: false, proUntil: null, source: null };
  if (ent.status !== "pro") return { isPro: false, proUntil: ent.proUntil || null, source: ent.source || null };

  const until = ent.proUntil ? new Date(ent.proUntil) : null;
  if (!until) return { isPro: true, proUntil: null, source: ent.source || null };
  return { isPro: until.getTime() > Date.now(), proUntil: until.toISOString(), source: ent.source || null };
}

async function requirePro(req, res, next) {
  if (!req.user?.email) return res.status(401).json({ ok: false, error: "No autorizado" });
  if (isAdmin(req)) return next();

  try {
    const ent = await getEntitlementByEmail(req.user.email);
    const p = computeIsPro(ent);
    if (!p.isPro) return res.status(402).json({ ok: false, error: "Requiere PRO" });
    req.pro = p;
    return next();
  } catch (e) {
    return res.status(500).json({ ok: false, error: "Error validando PRO" });
  }
}

/**
 * GET /api/billing/me
 * Devuelve: usuario + estado PRO
 */
router.get("/me", authOptional, async (req, res) => {
  try {
    if (!req.user?.email) {
      return res.json({ ok: true, user: null, pro: { isPro: false, proUntil: null } });
    }

    const ent = await getEntitlementByEmail(req.user.email);
    const pro = computeIsPro(ent);

    return res.json({
      ok: true,
      user: {
        email: req.user.email,
        name: req.user.name || null,
        picture: req.user.picture || null,
      },
      pro,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "Error leyendo /me" });
  }
});

/**
 * GET /api/billing/pro/ping (PROTECT)
 */
router.get("/pro/ping", authRequired, requirePro, async (_req, res) => {
  return res.json({ ok: true, pro: true });
});

/**
 * ADMIN: dar pro manual
 * POST /api/billing/admin/grant-pro
 * body: { email, days? }
 */
router.post("/admin/grant-pro", authRequired, async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ ok: false, error: "Forbidden" });

  try {
    const email = normEmail(req.body?.email);
    const days = Number(req.body?.days || 30);

    if (!email) return res.status(400).json({ ok: false, error: "Falta email" });
    if (!Number.isFinite(days) || days <= 0 || days > 3650) {
      return res.status(400).json({ ok: false, error: "days inválido" });
    }

    const proUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const database = await db();
    await database.collection("entitlements").updateOne(
      { email },
      {
        $set: {
          email,
          status: "pro",
          proUntil,
          source: "manual",
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );

    return res.json({ ok: true, email, proUntil: proUntil.toISOString() });
  } catch (e) {
    console.error("grant-pro error:", e);
    return res.status(500).json({ ok: false, error: "Error grant-pro" });
  }
});

/**
 * ADMIN: quitar pro
 * POST /api/billing/admin/revoke-pro
 * body: { email }
 */
router.post("/admin/revoke-pro", authRequired, async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ ok: false, error: "Forbidden" });

  try {
    const email = normEmail(req.body?.email);
    if (!email) return res.status(400).json({ ok: false, error: "Falta email" });

    const database = await db();
    await database.collection("entitlements").updateOne(
      { email },
      {
        $set: {
          status: "free",
          proUntil: null,
          source: "manual",
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );

    return res.json({ ok: true, email });
  } catch (e) {
    console.error("revoke-pro error:", e);
    return res.status(500).json({ ok: false, error: "Error revoke-pro" });
  }
});

module.exports = router;
