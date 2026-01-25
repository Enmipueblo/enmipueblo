const express = require("express");
const Servicio = require("../models/servicio.model.js");

const r2 = require("../r2.cjs");
const deleteObject = typeof r2.deleteObject === "function" ? r2.deleteObject : async () => {};
const keyFromPublicUrl =
  typeof r2.keyFromPublicUrl === "function" ? r2.keyFromPublicUrl : () => null;

const router = express.Router();

// Limpieza best-effort de destacados vencidos (throttle 10 min)
let _lastCleanupDestacadosMs = 0;
async function cleanupExpiredDestacadosOnce() {
  const now = Date.now();
  if (now - _lastCleanupDestacadosMs < 10 * 60 * 1000) return;
  _lastCleanupDestacadosMs = now;

  try {
    await Servicio.updateMany(
      { destacado: true, destacadoHasta: { $ne: null, $lte: new Date() } },
      { $set: { destacado: false, destacadoHasta: null } }
    );
  } catch (e) {
    console.warn("⚠️ cleanupExpiredDestacadosOnce falló:", e?.message || e);
  }
}

// ------------------------------
// Helpers
// ------------------------------
function sanitizeText(v, maxLen) {
  if (v === undefined || v === null) return "";
  return String(v).replace(/\s+/g, " ").trim().slice(0, maxLen);
}

function sanitizeLongText(v, maxLen) {
  if (v === undefined || v === null) return "";
  return String(v).trim().slice(0, maxLen);
}

function sanitizePhoneLoose(v, maxLen = 40) {
  const s = sanitizeText(v, maxLen);
  return s.replace(/[^0-9+()\-\s]/g, "").trim();
}

function sanitizeMediaUrl(v, maxLen = 2000) {
  const s = sanitizeText(v, maxLen);
  if (!s) return "";
  if (!/^(https?:\/\/|data:)/i.test(s)) return "";
  return s;
}

function escapeRegex(str = "") {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeEmail(e) {
  return String(e || "").trim().toLowerCase();
}

function requireAuth(req, res, next) {
  if (!req.user || !req.user.email) {
    return res.status(401).json({ error: "No autorizado. Debes iniciar sesión." });
  }
  next();
}

async function loadServicio(req, res, next) {
  try {
    const s = await Servicio.findById(req.params.id);
    if (!s) return res.status(404).json({ error: "Servicio no encontrado" });
    req.servicio = s;
    next();
  } catch {
    res.status(400).json({ error: "ID inválido" });
  }
}

function requireOwner(req, res, next) {
  const owner = normalizeEmail(req.servicio?.usuarioEmail);
  const me = normalizeEmail(req.user?.email);
  if (!me || !owner || me !== owner) {
    return res.status(403).json({ error: "No puedes modificar este servicio" });
  }
  next();
}

function parseNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function cleanLocName(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  return s.split(",")[0].trim();
}

function exactLooseCiRegex(v) {
  const s = cleanLocName(v);
  if (!s) return null;
  return new RegExp(`^\\s*${escapeRegex(s)}\\s*$`, "i");
}

function buildPointFromBody(body) {
  const lat = parseNum(body?.lat);
  const lng = parseNum(body?.lng);

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { type: "Point", coordinates: [lng, lat] };
  }

  const coords = body?.location?.coordinates;
  if (Array.isArray(coords) && coords.length === 2) {
    const lng2 = parseNum(coords[0]);
    const lat2 = parseNum(coords[1]);
    if (Number.isFinite(lat2) && Number.isFinite(lng2)) {
      return { type: "Point", coordinates: [lng2, lat2] };
    }
  }

  return null;
}

function isGeoIndexError(err) {
  const msg = String(err?.message || err || "");
  return (
    msg.includes("unable to find index for $geoNear query") ||
    msg.includes("unable to find index for $near query") ||
    msg.includes("geoNear") ||
    msg.includes("2dsphere") ||
    msg.includes("can't find index")
  );
}

// ---- R2 deletes best-effort ----
function collectKeysFromServicio(servicio) {
  const keys = new Set();
  const imgs = Array.isArray(servicio?.imagenes) ? servicio.imagenes : [];
  for (const u of imgs) {
    const k = keyFromPublicUrl(u);
    if (k) keys.add(k);
  }
  const vk = keyFromPublicUrl(servicio?.videoUrl || "");
  if (vk) keys.add(vk);
  return keys;
}

async function deleteKeysBestEffort(keysSet) {
  const keys = Array.from(keysSet || []);
  if (!keys.length) return;

  const results = await Promise.allSettled(keys.map((k) => deleteObject(k)));
  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length) {
    console.warn("⚠️ Algunos deletes en R2 fallaron:", {
      total: keys.length,
      failed: failed.length,
      sample: failed.slice(0, 3).map((f) => String(f.reason || "")),
    });
  }
}

// ======================
// LISTADO PUBLICO / MINE
// ======================
router.get("/", async (req, res) => {
  try {
    await cleanupExpiredDestacadosOnce();

    const {
      q,
      texto,
      categoria,
      pueblo,
      provincia,
      comunidad,
      page = 1,
      limit = 12,
      estado,
      destacado,
      destacadoHome,
      email,
      mine,
      lat,
      lng,
      radiusKm,
      km,
      maxKm,
    } = req.query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumRaw = parseInt(limit, 10) || 12;
    const limitNum = Math.min(Math.max(limitNumRaw, 1), 50);
    const skip = (pageNum - 1) * limitNum;

    const buscandoMisAnuncios =
      String(mine || "").toLowerCase() === "1" ||
      String(mine || "").toLowerCase() === "true" ||
      !!email;

    const latN0 = parseNum(lat);
    const lngN0 = parseNum(lng);
    const wantsGeo = Number.isFinite(latN0) && Number.isFinite(lngN0);

    const buildQuery = (withGeo) => {
      const queryObj = {};
      const andConds = [];

      if (buscandoMisAnuncios) {
        if (!req.user || !req.user.email) {
          const e = new Error("NOAUTH");
          e.code = "NOAUTH";
          throw e;
        }
        queryObj.usuarioEmail = normalizeEmail(req.user.email);
        if (estado) queryObj.estado = estado;
      } else {
        andConds.push({ $or: [{ estado: { $exists: false } }, { estado: "activo" }] });
      }

      if (categoria) andConds.push({ categoria });

      // ✅ si estamos en modo GEO, ignoramos pueblo/provincia/comunidad
      if (!withGeo) {
        const puebloRx = exactLooseCiRegex(pueblo);
        const provinciaRx = exactLooseCiRegex(provincia);
        const comunidadRx = exactLooseCiRegex(comunidad);

        if (puebloRx) andConds.push({ pueblo: puebloRx });
        if (provinciaRx) andConds.push({ provincia: provinciaRx });
        if (comunidadRx) andConds.push({ comunidad: comunidadRx });
      }

      // ✅ destacado vigentes
      if (typeof destacado !== "undefined") {
        const want = String(destacado) === "true";
        if (want) {
          andConds.push({ destacado: true, destacadoHasta: { $gt: new Date() } });
        } else {
          andConds.push({ destacado: false });
        }
      }

      if (typeof destacadoHome !== "undefined") {
        andConds.push({ destacadoHome: String(destacadoHome) === "true" });
      }

      const term = (texto || q || "").toString().trim();
      if (term) {
        const safe = escapeRegex(term);
        const regex = new RegExp(safe, "i");
        andConds.push({
          $or: [
            { nombre: regex },
            { oficio: regex },
            { descripcion: regex },
            { pueblo: regex },
            { provincia: regex },
            { comunidad: regex },
          ],
        });
      }

      const latN = parseNum(lat);
      const lngN = parseNum(lng);
      const rN = parseNum(radiusKm ?? km ?? maxKm);
      const canGeo = Number.isFinite(latN) && Number.isFinite(lngN);

      if (withGeo && canGeo) {
        const maxKmNum = Number.isFinite(rN) ? Math.min(Math.max(rN, 1), 300) : 25;
        andConds.push({
          location: {
            $near: {
              $geometry: { type: "Point", coordinates: [lngN, latN] },
              $maxDistance: maxKmNum * 1000,
            },
          },
        });
      }

      if (andConds.length) queryObj.$and = andConds;
      return { queryObj, usingGeo: withGeo && canGeo };
    };

    const projectionPublica = buscandoMisAnuncios ? "" : "-usuarioEmail";

    const run = async (withGeo) => {
      const { queryObj, usingGeo } = buildQuery(withGeo);

      let findQ = Servicio.find(queryObj).select(projectionPublica).skip(skip).limit(limitNum);

      if (!usingGeo) findQ = findQ.sort({ creadoEn: -1, _id: -1 });

      const [data, total] = await Promise.all([findQ.lean(), Servicio.countDocuments(queryObj)]);
      return { data, total };
    };

    try {
      const r1 = await run(wantsGeo);
      return res.json({
        ok: true,
        page: pageNum,
        // ✅ FIX: nunca 0
        totalPages: Math.max(1, Math.ceil(r1.total / limitNum)),
        totalItems: r1.total,
        data: r1.data,
      });
    } catch (err) {
      if (err?.code === "NOAUTH") {
        return res.status(401).json({ error: "No autorizado. Inicia sesión." });
      }

      if (wantsGeo && isGeoIndexError(err)) {
        console.error("⚠️ Geo falló. Reintentando sin geo:", err);
        const r2 = await run(false);
        return res.json({
          ok: true,
          page: pageNum,
          // ✅ FIX: nunca 0
          totalPages: Math.max(1, Math.ceil(r2.total / limitNum)),
          totalItems: r2.total,
          data: r2.data,
        });
      }

      console.error("❌ GET /api/servicios", err);
      return res.status(500).json({ error: "Error al listar servicios" });
    }
  } catch (err) {
    console.error("❌ GET /api/servicios outer", err);
    return res.status(500).json({ error: "Error al listar servicios" });
  }
});

// ======================
// RELACIONADOS / DETALLE
// ======================
router.get("/relacionados/:id", async (req, res) => {
  try {
    const base = await Servicio.findById(req.params.id).lean();
    if (!base) return res.json({ ok: true, data: [] });

    const visiblePublico = !base.estado || base.estado === "activo";
    const me = normalizeEmail(req.user?.email);
    const owner = normalizeEmail(base.usuarioEmail);
    const isOwner = me && owner && me === owner;
    const isAdmin = !!req.user?.isAdmin;

    if (!visiblePublico && !(isOwner || isAdmin)) {
      return res.json({ ok: true, data: [] });
    }

    const statusOr = { $or: [{ estado: { $exists: false } }, { estado: "activo" }] };

    const ors = [];
    if (base.pueblo) ors.push({ pueblo: base.pueblo });
    if (base.provincia) ors.push({ provincia: base.provincia });
    if (base.comunidad) ors.push({ comunidad: base.comunidad });
    if (base.categoria) ors.push({ categoria: base.categoria });

    if (!ors.length) return res.json({ ok: true, data: [] });

    const match = { _id: { $ne: base._id }, $and: [statusOr, { $or: ors }] };

    const candidatos = await Servicio.find(match)
      .select("-usuarioEmail")
      .limit(60)
      .sort({ creadoEn: -1 })
      .lean();

    const score = (s) => {
      let p = 0;
      if (base.pueblo && s.pueblo === base.pueblo) p += 4;
      if (base.provincia && s.provincia === base.provincia) p += 3;
      if (base.comunidad && s.comunidad === base.comunidad) p += 2;
      if (base.categoria && s.categoria === base.categoria) p += 1;
      return p;
    };

    candidatos.sort((a, b) => {
      const sa = score(a);
      const sb = score(b);
      if (sb !== sa) return sb - sa;
      const da = new Date(a.creadoEn || 0).getTime();
      const db = new Date(b.creadoEn || 0).getTime();
      return db - da;
    });

    res.json({ ok: true, data: candidatos.slice(0, 12) });
  } catch (err) {
    console.error("❌ relacionados", err);
    res.json({ ok: true, data: [] });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const s = await Servicio.findById(req.params.id).lean();
    if (!s) return res.status(404).json({ error: "Servicio no encontrado" });

    const visiblePublico = !s.estado || s.estado === "activo";
    const me = normalizeEmail(req.user?.email);
    const owner = normalizeEmail(s.usuarioEmail);
    const isOwner = me && owner && me === owner;
    const isAdmin = !!req.user?.isAdmin;

    if (!visiblePublico && !(isOwner || isAdmin)) {
      return res.status(404).json({ error: "Servicio no disponible" });
    }

    if (!(isOwner || isAdmin)) delete s.usuarioEmail;

    res.json(s);
  } catch {
    res.status(400).json({ error: "ID inválido" });
  }
});

// ======================
// CRUD (owner)
// ======================
router.post("/", requireAuth, async (req, res) => {
  try {
    const body = req.body || {};

    const profesionalNombre = sanitizeText(body.profesionalNombre, 80);
    const nombre = sanitizeText(body.nombre, 120);
    const categoria = sanitizeText(body.categoria, 60);
    const oficio = sanitizeText(body.oficio, 80);
    const descripcion = sanitizeLongText(body.descripcion, 3000);
    const contacto = sanitizeText(body.contacto, 120);
    const whatsapp = sanitizePhoneLoose(body.whatsapp || "", 40);

    const pueblo = cleanLocName(body.pueblo);
    const provincia = cleanLocName(body.provincia || "");
    const comunidad = cleanLocName(body.comunidad || "");

    const imagenesRaw = Array.isArray(body.imagenes) ? body.imagenes : [];
    const imagenes = imagenesRaw
      .map((u) => sanitizeMediaUrl(u, 2000))
      .filter(Boolean)
      .slice(0, 12);

    const videoUrl = sanitizeMediaUrl(body.videoUrl || "", 2000);

    if (!profesionalNombre || !nombre || !categoria || !oficio || !descripcion || !contacto || !pueblo) {
      return res.status(400).json({ error: "Faltan campos obligatorios" });
    }

    const point = buildPointFromBody(body);

    const nuevo = await Servicio.create({
      profesionalNombre,
      nombre,
      categoria,
      oficio,
      descripcion,
      contacto,
      whatsapp,
      pueblo,
      provincia,
      comunidad,
      imagenes,
      videoUrl,
      usuarioEmail: normalizeEmail(req.user.email),

      ...(point ? { location: point } : {}),

      estado: "activo",
      revisado: false,
      destacado: false,
      destacadoHasta: null,
      destacadoHome: false,
    });

    res.json({ ok: true, servicio: nuevo });
  } catch (err) {
    console.error("❌ POST /api/servicios", err);
    res.status(500).json({ error: "Error creando servicio" });
  }
});

router.put("/:id", requireAuth, loadServicio, requireOwner, async (req, res) => {
  try {
    const body = req.body || {};

    // ✅ para borrar media R2 que se quite
    const oldKeys = collectKeysFromServicio(req.servicio);

    const ALLOWED = [
      "profesionalNombre",
      "nombre",
      "categoria",
      "oficio",
      "descripcion",
      "contacto",
      "whatsapp",
      "pueblo",
      "provincia",
      "comunidad",
      "imagenes",
      "videoUrl",
    ];

    const update = {};
    for (const k of ALLOWED) {
      if (Object.prototype.hasOwnProperty.call(body, k)) update[k] = body[k];
    }

    if (Object.prototype.hasOwnProperty.call(update, "profesionalNombre")) {
      update.profesionalNombre = sanitizeText(update.profesionalNombre, 80);
    }
    if (Object.prototype.hasOwnProperty.call(update, "nombre")) {
      update.nombre = sanitizeText(update.nombre, 120);
    }
    if (Object.prototype.hasOwnProperty.call(update, "categoria")) {
      update.categoria = sanitizeText(update.categoria, 60);
    }
    if (Object.prototype.hasOwnProperty.call(update, "oficio")) {
      update.oficio = sanitizeText(update.oficio, 80);
    }
    if (Object.prototype.hasOwnProperty.call(update, "descripcion")) {
      update.descripcion = sanitizeLongText(update.descripcion, 3000);
    }
    if (Object.prototype.hasOwnProperty.call(update, "contacto")) {
      update.contacto = sanitizeText(update.contacto, 120);
    }
    if (Object.prototype.hasOwnProperty.call(update, "whatsapp")) {
      update.whatsapp = sanitizePhoneLoose(update.whatsapp, 40);
    }
    if (Object.prototype.hasOwnProperty.call(update, "pueblo")) {
      update.pueblo = sanitizeText(update.pueblo, 80);
    }
    if (Object.prototype.hasOwnProperty.call(update, "provincia")) {
      update.provincia = sanitizeText(update.provincia, 80);
    }
    if (Object.prototype.hasOwnProperty.call(update, "comunidad")) {
      update.comunidad = sanitizeText(update.comunidad, 80);
    }

    if (Object.prototype.hasOwnProperty.call(update, "imagenes")) {
      const arr = Array.isArray(update.imagenes) ? update.imagenes : [];
      update.imagenes = arr
        .map((u) => sanitizeMediaUrl(u, 2000))
        .filter(Boolean)
        .slice(0, 12);
    }
    if (Object.prototype.hasOwnProperty.call(update, "videoUrl")) {
      update.videoUrl = sanitizeMediaUrl(update.videoUrl, 2000);
    }

    const point = buildPointFromBody(body);
    if (point) update.location = point;

    Object.assign(req.servicio, update);
    await req.servicio.save();

    // ✅ borrar lo que estaba antes y ya no está
    const newKeys = collectKeysFromServicio(req.servicio);
    const removed = new Set();
    for (const k of oldKeys) {
      if (!newKeys.has(k)) removed.add(k);
    }
    await deleteKeysBestEffort(removed);

    res.json({ ok: true, servicio: req.servicio });
  } catch (err) {
    console.error("❌ PUT /api/servicios/:id", err);
    res.status(500).json({ error: "Error actualizando servicio" });
  }
});

router.delete("/:id", requireAuth, loadServicio, requireOwner, async (req, res) => {
  try {
    const keys = collectKeysFromServicio(req.servicio);

    await req.servicio.deleteOne();

    // ✅ best-effort delete media R2
    await deleteKeysBestEffort(keys);

    res.json({ ok: true, deletedMedia: keys.size });
  } catch (err) {
    console.error("❌ DELETE /api/servicios/:id", err);
    res.status(500).json({ error: "Error eliminando servicio" });
  }
});

module.exports = router;
