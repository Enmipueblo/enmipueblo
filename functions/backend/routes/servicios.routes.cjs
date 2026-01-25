const express = require("express");
const Servicio = require("../models/servicio.model.js");
const { deleteObject, keyFromPublicUrl } = require("../r2.cjs");

const router = express.Router();

// ------------------------------
// Sanitización/validación simple
// ------------------------------
function sanitizeText(v, maxLen) {
  if (v === undefined || v === null) return "";
  return String(v)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function sanitizeLongText(v, maxLen) {
  // permite saltos de línea, pero limpia espacios extremos
  if (v === undefined || v === null) return "";
  return String(v).trim().slice(0, maxLen);
}

function sanitizePhoneLoose(v, maxLen = 40) {
  const s = sanitizeText(v, maxLen);
  // dejamos +, números, espacios y algunos separadores
  return s.replace(/[^0-9+()\-\s]/g, "").trim();
}

function sanitizeMediaUrl(v, maxLen = 2000) {
  const s = sanitizeText(v, maxLen);
  if (!s) return "";

  // Evitar "javascript:" u otros esquemas raros.
  // Permitimos https/http (dev) y data: (compat legacy).
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

router.get("/", async (req, res) => {
  try {
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

      // ✅ CLAVE: si estamos en modo GEO, IGNORAMOS pueblo/provincia/comunidad
      // porque si no te deja pegado al “pueblo centro”.
      if (!withGeo) {
        const puebloRx = exactLooseCiRegex(pueblo);
        const provinciaRx = exactLooseCiRegex(provincia);
        const comunidadRx = exactLooseCiRegex(comunidad);

        if (puebloRx) andConds.push({ pueblo: puebloRx });
        if (provinciaRx) andConds.push({ provincia: provinciaRx });
        if (comunidadRx) andConds.push({ comunidad: comunidadRx });
      }

      if (typeof destacado !== "undefined") {
        const want = String(destacado) === "true";
        if (want) {
          // Solo destacados vigentes
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

      let findQ = Servicio.find(queryObj)
        .select(projectionPublica)
        .skip(skip)
        .limit(limitNum);

      // si NO es geo, orden por fecha
      if (!usingGeo) findQ = findQ.sort({ creadoEn: -1, _id: -1 });

      const [data, total] = await Promise.all([
        findQ.lean(),
        Servicio.countDocuments(queryObj),
      ]);

      return { data, total };
    };

    try {
      const r1 = await run(wantsGeo);
      return res.json({
        ok: true,
        page: pageNum,
        totalPages: Math.ceil(r1.total / limitNum),
        totalItems: r1.total,
        data: r1.data,
      });
    } catch (err) {
      if (err?.code === "NOAUTH") {
        return res.status(401).json({ error: "No autorizado. Inicia sesión." });
      }

      // si falló geo, reintentar sin geo
      if (wantsGeo && isGeoIndexError(err)) {
        console.error("⚠️ Geo falló. Reintentando sin geo:", err);
        const r2 = await run(false);
        return res.json({
          ok: true,
          page: pageNum,
          totalPages: Math.ceil(r2.total / limitNum),
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

router.post("/", requireAuth, async (req, res) => {
  try {
    const body = req.body || {};

    const profesionalNombre = sanitizeText(body.profesionalNombre, 80);
    const nombre = sanitizeText(body.nombre, 120);
    const categoria = sanitizeText(body.categoria, 60);
    const oficio = sanitizeText(body.oficio, 80);
    const descripcion = sanitizeLongText(body.descripcion, 2200);
    const contacto = sanitizeText(body.contacto, 120);
    const whatsapp = sanitizePhoneLoose(body.whatsapp, 40);
    const pueblo = cleanLocName(body.pueblo);
    const provincia = cleanLocName(body.provincia);
    const comunidad = cleanLocName(body.comunidad);

    const imagenesIn = Array.isArray(body.imagenes) ? body.imagenes : [];
    const imagenes = imagenesIn.map((x) => sanitizeMediaUrl(x)).filter(Boolean).slice(0, 12);
    const videoUrl = sanitizeMediaUrl(body.videoUrl);

    // Validaciones mínimas
    if (!nombre || !categoria || !oficio || !descripcion || !contacto || !pueblo) {
      return res.status(400).json({
        error: "Faltan campos obligatorios.",
      });
    }

    // GEO (opcional)
    const point = buildPointFromBody(body);

    const doc = await Servicio.create({
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
      location: point || undefined,

      estado: "activo",
      revisado: false,
      destacado: false,
      destacadoHasta: null,
      destacadoHome: false,
    });

    return res.json({ ok: true, servicio: doc });
  } catch (err) {
    console.error("❌ POST /api/servicios", err);
    return res.status(500).json({ error: "Error al crear servicio" });
  }
});

router.put("/:id", requireAuth, loadServicio, requireOwner, async (req, res) => {
  try {
    const body = req.body || {};

    const patch = {};

    if (body.profesionalNombre !== undefined) patch.profesionalNombre = sanitizeText(body.profesionalNombre, 80);
    if (body.nombre !== undefined) patch.nombre = sanitizeText(body.nombre, 120);
    if (body.categoria !== undefined) patch.categoria = sanitizeText(body.categoria, 60);
    if (body.oficio !== undefined) patch.oficio = sanitizeText(body.oficio, 80);
    if (body.descripcion !== undefined) patch.descripcion = sanitizeLongText(body.descripcion, 2200);
    if (body.contacto !== undefined) patch.contacto = sanitizeText(body.contacto, 120);
    if (body.whatsapp !== undefined) patch.whatsapp = sanitizePhoneLoose(body.whatsapp, 40);

    if (body.pueblo !== undefined) patch.pueblo = cleanLocName(body.pueblo);
    if (body.provincia !== undefined) patch.provincia = cleanLocName(body.provincia);
    if (body.comunidad !== undefined) patch.comunidad = cleanLocName(body.comunidad);

    if (body.imagenes !== undefined) {
      const imagenesIn = Array.isArray(body.imagenes) ? body.imagenes : [];
      patch.imagenes = imagenesIn.map((x) => sanitizeMediaUrl(x)).filter(Boolean).slice(0, 12);
    }

    if (body.videoUrl !== undefined) {
      patch.videoUrl = sanitizeMediaUrl(body.videoUrl);
    }

    // GEO update (opcional)
    const point = buildPointFromBody(body);
    if (point) patch.location = point;

    const s = await Servicio.findByIdAndUpdate(req.params.id, patch, { new: true }).lean();
    if (!s) return res.status(404).json({ error: "Servicio no encontrado" });

    return res.json({ ok: true, servicio: s });
  } catch (err) {
    console.error("❌ PUT /api/servicios/:id", err);
    res.status(500).json({ error: "Error actualizando servicio" });
  }
});

router.delete("/:id", requireAuth, loadServicio, requireOwner, async (req, res) => {
  try {
    // Guardamos media antes de borrar el doc (para poder limpiar R2)
    const imagenes = Array.isArray(req.servicio?.imagenes) ? [...req.servicio.imagenes] : [];
    const videoUrl = req.servicio?.videoUrl || "";

    await req.servicio.deleteOne();

    // Best-effort: borrar media en R2 (siempre que podamos extraer la key).
    const keys = [];

    for (const u of imagenes) {
      const k = keyFromPublicUrl(u);
      if (k) keys.push(k);
    }
    const vk = keyFromPublicUrl(videoUrl);
    if (vk) keys.push(vk);

    if (keys.length) {
      const results = await Promise.allSettled(keys.map((k) => deleteObject(k)));
      const failed = results.filter((r) => r.status === "rejected");

      if (failed.length) {
        console.warn("⚠️ No se pudieron borrar algunos objetos en R2:", {
          total: keys.length,
          failed: failed.length,
          reasons: failed.slice(0, 3).map((f) => String(f.reason || "")),
        });
      }
    }

    res.json({ ok: true, deletedMedia: keys.length });
  } catch (err) {
    console.error("❌ DELETE /api/servicios/:id", err);
    res.status(500).json({ error: "Error eliminando servicio" });
  }
});

module.exports = router;
