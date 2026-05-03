"use strict";

const express = require("express");
const router = express.Router();
const { MongoClient, ObjectId } = require("mongodb");

// ✅ FIX: migrado de auth.cjs legacy a auth.middleware.cjs unificado
const { authRequired } = require("../middleware/auth.middleware.cjs");

function mustInt(v, def) {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

function str(v) {
  return typeof v === "string" ? v : "";
}

function escapeRegex(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeEmail(s) {
  return String(s || "").trim().toLowerCase();
}

function nowDate() {
  return new Date();
}

function getMongoUri() {
  return (
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    process.env.MONGO_URL ||
    process.env.DATABASE_URL ||
    ""
  ).trim();
}

let _client = null;
let _clientPromise = null;

async function getDb() {
  const uri = getMongoUri();
  if (!uri) throw new Error("Falta MONGO_URI en env");

  if (_client) return _client.db(process.env.MONGO_DB_NAME || "enmipueblo");
  if (_clientPromise) {
    const c = await _clientPromise;
    return c.db(process.env.MONGO_DB_NAME || "enmipueblo");
  }

  const client = new MongoClient(uri, { maxPoolSize: 10, minPoolSize: 0 });
  _clientPromise = client.connect().then((c) => { _client = c; return c; });
  const c = await _clientPromise;
  return c.db(process.env.MONGO_DB_NAME || "enmipueblo");
}

function serviciosCol(db) {
  return db.collection("servicios");
}

async function cleanupExpiredFeatured(db) {
  await serviciosCol(db).updateMany(
    {
      $or: [{ destacado: true }, { destacadoHome: true }],
      destacadoHasta: { $type: "date", $lte: nowDate() },
    },
    { $set: { destacado: false, destacadoHome: false, destacadoHasta: null } }
  );
}

async function getProUntil(db, uid) {
  if (!uid) return null;

  const ent = await db.collection("entitlements").findOne(
    { uid },
    { projection: { pro_until: 1, proUntil: 1 } }
  );
  if (ent?.pro_until || ent?.proUntil) return ent.pro_until || ent.proUntil;

  const u = await db.collection("users").findOne(
    { uid },
    { projection: { pro_until: 1, proUntil: 1 } }
  );
  return u?.pro_until || u?.proUntil || null;
}

function isProActive(proUntil) {
  if (!proUntil) return false;
  const d = proUntil instanceof Date ? proUntil : new Date(proUntil);
  return !Number.isNaN(d.getTime()) && d.getTime() > Date.now();
}

// ✅ FIX OWNERSHIP: ahora busca por usuarioEmail y usuarioUid
// Antes buscaba uid/contacto que nunca coincidían con lo guardado al crear
function ownerMatchQuery(uid, email) {
  const em = normalizeEmail(email);
  const ors = [];

  if (em) {
    ors.push({ usuarioEmail: em });
    // compat: algunos docs viejos pueden tener contacto en vez de usuarioEmail
    ors.push({ contacto: em });
  }
  if (uid) {
    ors.push({ usuarioUid: uid });
    // compat legacy
    ors.push({ uid });
    ors.push({ userId: uid });
  }

  return ors.length ? { $or: ors } : { _id: "__nope__" };
}

function isOwner(doc, uid, email) {
  const em = normalizeEmail(email);
  // ✅ FIX: comprueba usuarioEmail primero (campo real guardado al crear)
  const emailOk = em && (
    normalizeEmail(doc.usuarioEmail) === em ||
    normalizeEmail(doc.contacto) === em
  );
  const uidOk = uid && (
    doc.usuarioUid === uid ||
    doc.uid === uid ||
    doc.userId === uid
  );
  return !!(emailOk || uidOk);
}

function buildSearchFilter(q) {
  const filter = { estado: "activo", revisado: true };

  const categoria = str(q.categoria).trim();
  const provincia = str(q.provincia).trim();
  const comunidad = str(q.comunidad).trim();
  const pueblo = str(q.pueblo).trim();

  if (categoria) filter.categoria = categoria;
  if (provincia) filter.provincia = provincia;
  if (comunidad) filter.comunidad = comunidad;
  if (pueblo) filter.pueblo = pueblo;

  const text = str(q.q || q.text || "").trim();
  if (text) {
    const rx = new RegExp(escapeRegex(text), "i");
    filter.$or = [
      { nombre: rx },
      { oficio: rx },
      { categoria: rx },
      { descripcion: rx },
      { pueblo: rx },
      { provincia: rx },
      { comunidad: rx },
      { profesionalNombre: rx },
    ];
  }

  return filter;
}

// GET /api/featured/portada?limit=18
router.get("/portada", async (req, res) => {
  try {
    const db = await getDb();
    await cleanupExpiredFeatured(db);

    const limit = Math.min(48, mustInt(req.query.limit, 18));
    const col = serviciosCol(db);
    const now = nowDate();
    const baseFilter = { estado: "activo", revisado: true };

    const featured = await col
      .find({
        ...baseFilter,
        destacadoHome: true,
        destacadoHasta: { $type: "date", $gt: now },
      })
      .sort({ destacadoHasta: -1, actualizadoEn: -1, creadoEn: -1 })
      .limit(limit)
      .toArray();

    const featuredIds = new Set(featured.map((d) => String(d._id)));
    const remaining = Math.max(0, limit - featured.length);

    let fill = [];
    if (remaining > 0) {
      fill = await col
        .find({
          ...baseFilter,
          $or: [
            { destacadoHome: { $ne: true } },
            { destacadoHasta: null },
            { destacadoHasta: { $type: "date", $lte: now } },
          ],
          _id: { $nin: [...featuredIds].map((s) => new ObjectId(s)) },
        })
        .sort({ actualizadoEn: -1, creadoEn: -1 })
        .limit(remaining)
        .toArray();
    }

    return res.json({
      ok: true,
      limit,
      featuredCount: featured.length,
      data: [...featured, ...fill],
    });
  } catch (e) {
    console.error("featured/portada error:", e);
    return res.status(500).json({ ok: false, error: "Error portada destacados" });
  }
});

// GET /api/featured/search?page=1&limit=12&...
router.get("/search", async (req, res) => {
  try {
    const db = await getDb();
    await cleanupExpiredFeatured(db);

    const page = mustInt(req.query.page, 1);
    const limit = Math.min(50, mustInt(req.query.limit, 12));
    const skip = (page - 1) * limit;
    const col = serviciosCol(db);
    const now = nowDate();
    const filter = buildSearchFilter(req.query);

    const pipeline = [
      { $match: filter },
      {
        $addFields: {
          _isFeatHome: { $and: [{ $eq: ["$destacadoHome", true] }, { $gt: ["$destacadoHasta", now] }] },
          _isFeat: { $and: [{ $eq: ["$destacado", true] }, { $gt: ["$destacadoHasta", now] }] },
        },
      },
      { $addFields: { _rank: { $cond: ["$_isFeatHome", 2, { $cond: ["$_isFeat", 1, 0] }] } } },
      { $sort: { _rank: -1, actualizadoEn: -1, creadoEn: -1 } },
      { $facet: { data: [{ $skip: skip }, { $limit: limit }], total: [{ $count: "n" }] } },
    ];

    const out = await col.aggregate(pipeline).toArray();
    const data = out?.[0]?.data || [];
    const totalItems = out?.[0]?.total?.[0]?.n || 0;
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));

    const cleaned = data.map((d) => {
      const x = { ...d };
      delete x._rank;
      delete x._isFeat;
      delete x._isFeatHome;
      return x;
    });

    return res.json({ ok: true, page, totalPages, totalItems, data: cleaned });
  } catch (e) {
    console.error("featured/search error:", e);
    return res.status(500).json({ ok: false, error: "Error búsqueda destacados" });
  }
});

// GET /api/featured/me
router.get("/me", authRequired, async (req, res) => {
  try {
    const db = await getDb();
    await cleanupExpiredFeatured(db);

    // ✅ FIX: req.user.id viene del nuevo middleware (antes era req.user.uid del legacy)
    const uid = req.user?.id || req.user?.uid || "";
    const email = req.user?.email || "";
    const col = serviciosCol(db);
    const now = nowDate();

    const docs = await col
      .find({
        ...ownerMatchQuery(uid, email),
        $or: [{ destacado: true }, { destacadoHome: true }],
        destacadoHasta: { $type: "date", $gt: now },
      })
      .sort({ destacadoHasta: -1, actualizadoEn: -1 })
      .limit(200)
      .toArray();

    return res.json({ ok: true, data: docs });
  } catch (e) {
    console.error("featured/me error:", e);
    return res.status(500).json({ ok: false, error: "Error leyendo destacados del usuario" });
  }
});

// POST /api/featured/servicio/:id
router.post("/servicio/:id", authRequired, async (req, res) => {
  try {
    const db = await getDb();
    await cleanupExpiredFeatured(db);

    // ✅ FIX: req.user.id del nuevo middleware
    const uid = req.user?.id || req.user?.uid || "";
    const email = req.user?.email || "";
    const proUntil = await getProUntil(db, uid);

    if (!isProActive(proUntil)) {
      return res.status(402).json({ ok: false, error: "Necesitas PRO activo para destacar." });
    }

    const enabled = typeof req.body?.enabled === "boolean" ? req.body.enabled : true;

    let oid;
    try {
      oid = new ObjectId(String(req.params.id));
    } catch {
      return res.status(400).json({ ok: false, error: "ID inválido" });
    }

    const col = serviciosCol(db);
    const svc = await col.findOne({ _id: oid });
    if (!svc) return res.status(404).json({ ok: false, error: "Servicio no encontrado" });

    if (!isOwner(svc, uid, email)) {
      return res.status(403).json({ ok: false, error: "No eres dueño de este servicio" });
    }

    if (enabled) {
      const untilDate = proUntil instanceof Date ? proUntil : new Date(proUntil);
      await col.updateOne(
        { _id: oid },
        { $set: { destacado: true, destacadoHome: true, destacadoHasta: untilDate, actualizadoEn: new Date() } }
      );
    } else {
      await col.updateOne(
        { _id: oid },
        { $set: { destacado: false, destacadoHome: false, destacadoHasta: null, actualizadoEn: new Date() } }
      );
    }

    const updated = await col.findOne({ _id: oid });
    return res.json({ ok: true, data: updated });
  } catch (e) {
    console.error("featured/servicio error:", e);
    return res.status(500).json({ ok: false, error: "Error aplicando destacado" });
  }
});

module.exports = router;
