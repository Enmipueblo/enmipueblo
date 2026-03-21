const express = require("express");
const Servicio = require("../models/servicio.model.js");
const mongoose = require("mongoose");

const { S3Client, DeleteObjectsCommand } = require("@aws-sdk/client-s3");
const { authRequired } = require("../auth.cjs");

const router = express.Router();

// ======================
// Helpers auth / owner
// ======================
async function loadServicio(req, res, next) {
  try {
    const s = await Servicio.findById(req.params.id);
    if (!s) return res.status(404).json({ error: "Servicio no encontrado" });
    req.servicio = s;
    next();
  } catch (e) {
    console.error("❌ loadServicio", e);
    res.status(400).json({ error: "ID inválido" });
  }
}

function normalizeEmail(v) {
  return String(v || "").trim().toLowerCase();
}

function isOwner(req) {
  const email = normalizeEmail(req?.user?.email);
  const ownerEmail = normalizeEmail(req?.servicio?.usuarioEmail);
  return email && ownerEmail && email === ownerEmail;
}

// ======================
// Media sanitización + normalización
// ======================
function getMediaBase() {
  const raw =
    process.env.R2_PUBLIC_BASE_URL ||
    process.env.MEDIA_PUBLIC_BASE_URL ||
    "https://media.enmipueblo.com";
  return String(raw).replace(/\/$/, "");
}

function sanitizeMediaUrl(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  if (s.startsWith("data:image/")) return s;
  if (!/^https?:\/\//i.test(s)) return "";
  return s;
}

function urlToServiceKey(url) {
  const u = String(url || "").trim();
  if (!u) return null;

  if (u.startsWith("data:image/")) return null;

  const idx = u.indexOf("service_images/");
  if (idx >= 0) {
    let key = u.slice(idx);
    const q = key.indexOf("?");
    if (q >= 0) key = key.slice(0, q);
    key = key.replace(/^\/+/, "");
    return key.startsWith("service_images/") ? key : null;
  }

  try {
    const parsed = new URL(u);
    const p = parsed.pathname || "";
    const marker = "/o/";
    const j = p.indexOf(marker);
    if (j >= 0) {
      const enc = p.slice(j + marker.length);
      const dec = decodeURIComponent(enc);
      if (dec.startsWith("service_images/")) return dec;
    }
  } catch {}

  return null;
}

function normalizePublicMediaUrl(url) {
  const s = sanitizeMediaUrl(url);
  if (!s) return "";

  if (s.startsWith("data:image/")) return s;

  const key = urlToServiceKey(s);
  if (!key) return s;

  return `${getMediaBase()}/${key}`;
}

function normalizeServicioMedia(serv) {
  const out = { ...serv };
  out.imagenes = Array.isArray(out.imagenes)
    ? out.imagenes.map((x) => normalizePublicMediaUrl(x)).filter(Boolean)
    : [];
  out.videoUrl = out.videoUrl ? normalizePublicMediaUrl(out.videoUrl) : "";
  return out;
}

// ======================
// R2 delete
// ======================
let _r2 = null;

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error("Falta env: " + name);
  return v;
}

function getR2() {
  if (_r2) return _r2;
  _r2 = new S3Client({
    region: "auto",
    endpoint: mustEnv("R2_ENDPOINT"),
    credentials: {
      accessKeyId: mustEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: mustEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
  return _r2;
}

async function deleteR2Keys(keys) {
  const uniq = Array.from(new Set((keys || []).filter(Boolean)));
  const safe = uniq.filter((k) => String(k).startsWith("service_images/"));
  if (safe.length === 0) return;

  try {
    const Bucket = mustEnv("R2_BUCKET");
    const r2 = getR2();

    await r2.send(
      new DeleteObjectsCommand({
        Bucket,
        Delete: { Objects: safe.map((Key) => ({ Key })), Quiet: true },
      })
    );

    console.log("✅ R2 deleteObjects:", safe.length);
  } catch (e) {
    console.error("⚠️ No se pudo borrar en R2 (continuo igual):", e?.message || e);
  }
}

function collectServiceKeysFromUrls(urls) {
  const keys = [];
  for (const u of urls || []) {
    const key = urlToServiceKey(u);
    if (key) keys.push(key);
  }
  return keys;
}

function collectKeysFromServicioLike(s) {
  const imgs = Array.isArray(s?.imagenes) ? s.imagenes : [];
  const vid = s?.videoUrl ? [s.videoUrl] : [];
  return collectServiceKeysFromUrls([...imgs, ...vid]);
}

// ======================
// Location legacy opcional
// ======================
function buildOptionalLocation(body) {
  if (body?.location?.coordinates && Array.isArray(body.location.coordinates) && body.location.coordinates.length === 2) {
    const lng = Number(body.location.coordinates[0]);
    const lat = Number(body.location.coordinates[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { type: "Point", coordinates: [lng, lat] };
    }
  }

  if (body?.lng !== undefined || body?.lat !== undefined) {
    const lng = Number(body.lng);
    const lat = Number(body.lat);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { type: "Point", coordinates: [lng, lat] };
    }
  }

  return undefined;
}

// ======================
// GET /api/servicios
// ======================
router.get("/", async (req, res) => {
  try {
    const {
      texto,
      pueblo,
      provincia,
      comunidad,
      categoria,
      oficio,
      page = 1,
      limit = 12,
      mine,
      estado,
      destacado,
      destacadoHome,
      nearLat,
      nearLng,
      maxKm,
    } = req.query;

    const pageNum = Math.max(parseInt(String(page), 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(String(limit), 10) || 12, 1), 100);
    const skip = (pageNum - 1) * limitNum;

    const wantMine = String(mine) === "1" || String(mine).toLowerCase() === "true";
    const me = normalizeEmail(req.user?.email);

    if (wantMine && !me) return res.status(401).json({ error: "No autorizado" });

    const and = [];

    if (wantMine) {
      and.push({ usuarioEmail: me });
      if (estado) and.push({ estado: String(estado) });
    } else {
      and.push({ $or: [{ estado: { $exists: false } }, { estado: "activo" }] });
    }

    if (pueblo) and.push({ pueblo: String(pueblo) });
    if (provincia) and.push({ provincia: String(provincia) });
    if (comunidad) and.push({ comunidad: String(comunidad) });
    if (categoria) and.push({ categoria: String(categoria) });
    if (oficio) and.push({ oficio: String(oficio) });

    const now = new Date();

    if (String(destacado) === "true") {
      and.push({ destacado: true });
      and.push({ destacadoHasta: { $gt: now } });
    } else if (String(destacado) === "false") {
      and.push({ destacado: false });
    }

    if (String(destacadoHome) === "true") and.push({ destacadoHome: true });
    else if (String(destacadoHome) === "false") and.push({ destacadoHome: false });

    const term = String(texto || "").trim();
    if (term) {
      const safe = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(safe, "i");
      and.push({
        $or: [
          { nombre: regex },
          { profesionalNombre: regex },
          { oficio: regex },
          { categoria: regex },
          { descripcion: regex },
          { pueblo: regex },
          { provincia: regex },
          { comunidad: regex },
          { usuarioEmail: regex },
        ],
      });
    }

    const queryObj = and.length ? { $and: and } : {};

    const lat = Number(nearLat);
    const lng = Number(nearLng);
    const hasGeo = Number.isFinite(lat) && Number.isFinite(lng);

    let data = [];
    let total = 0;

    if (hasGeo) {
      const maxDistance = Math.max(Number(maxKm) || 50, 1) * 1000;

      const pipeline = [
        {
          $geoNear: {
            near: { type: "Point", coordinates: [lng, lat] },
            distanceField: "dist",
            spherical: true,
            maxDistance,
            query: queryObj,
          },
        },
        { $sort: { dist: 1, _id: -1 } },
        {
          $facet: {
            data: [{ $skip: skip }, { $limit: limitNum }],
            meta: [{ $count: "total" }],
          },
        },
        {
          $project: {
            data: 1,
            total: { $ifNull: [{ $arrayElemAt: ["$meta.total", 0] }, 0] },
          },
        },
      ];

      try {
        const agg = await Servicio.aggregate(pipeline);
        data = agg?.[0]?.data || [];
        total = agg?.[0]?.total || 0;
      } catch (e) {
        console.error("⚠️ GEO fallback:", e?.message || e);
        const [d, t] = await Promise.all([
          Servicio.find(queryObj)
            .skip(skip)
            .limit(limitNum)
            .sort({ creadoEn: -1, _id: -1 })
            .lean(),
          Servicio.countDocuments(queryObj),
        ]);
        data = d || [];
        total = t || 0;
      }
    } else {
      const [d, t] = await Promise.all([
        Servicio.find(queryObj)
          .skip(skip)
          .limit(limitNum)
          .sort({ creadoEn: -1, _id: -1 })
          .lean(),
        Servicio.countDocuments(queryObj),
      ]);
      data = d || [];
      total = t || 0;
    }

    const totalPages = Math.max(1, Math.ceil(total / limitNum));

    const out = (data || []).map((s) => {
      const norm = normalizeServicioMedia(s);
      if (!wantMine) delete norm.usuarioEmail;
      return norm;
    });

    res.json({ ok: true, page: pageNum, totalPages, totalItems: total, data: out });
  } catch (err) {
    console.error("❌ GET /api/servicios", err);
    res.status(500).json({ error: "Error listando servicios" });
  }
});

// ======================
// GET /api/servicios/mios
// ======================
router.get("/mios", authRequired, async (req, res) => {
  try {
    const { page = 1, limit = 12, estado } = req.query;

    const pageNum = Math.max(parseInt(String(page), 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(String(limit), 10) || 12, 1), 100);
    const skip = (pageNum - 1) * limitNum;

    const me = normalizeEmail(req.user?.email);
    if (!me) return res.status(401).json({ error: "No autorizado" });

    const and = [{ usuarioEmail: me }];
    if (estado) and.push({ estado: String(estado) });

    const queryObj = { $and: and };

    const [d, t] = await Promise.all([
      Servicio.find(queryObj)
        .skip(skip)
        .limit(limitNum)
        .sort({ creadoEn: -1, _id: -1 })
        .lean(),
      Servicio.countDocuments(queryObj),
    ]);

    const total = t || 0;
    const totalPages = Math.max(1, Math.ceil(total / limitNum));

    const out = (d || []).map((s) => normalizeServicioMedia(s));

    return res.json({ ok: true, page: pageNum, totalPages, totalItems: total, data: out });
  } catch (err) {
    console.error("❌ GET /api/servicios/mios", err);
    return res.status(500).json({ error: "Error obteniendo mis servicios" });
  }
});

// ======================
// GET /api/servicios/:id/relacionados
// ======================
router.get("/:id/relacionados", async (req, res) => {
  try {
    const id = req.params.id;

    const base = await Servicio.findById(id).lean();
    if (!base) return res.status(404).json({ error: "Servicio no encontrado" });

    const relOr = [];
    if (base.categoria) relOr.push({ categoria: base.categoria });
    if (base.oficio) relOr.push({ oficio: base.oficio });
    if (base.pueblo) relOr.push({ pueblo: base.pueblo });
    if (base.provincia) relOr.push({ provincia: base.provincia });

    if (!relOr.length) return res.json({ ok: true, data: [] });

    const query = {
      _id: { $ne: base._id },
      $and: [
        { $or: [{ estado: { $exists: false } }, { estado: "activo" }] },
        { $or: relOr },
      ],
    };

    const data = await Servicio.find(query)
      .limit(6)
      .sort({ creadoEn: -1, _id: -1 })
      .lean();

    const out = (data || []).map((s) => {
      const norm = normalizeServicioMedia(s);
      delete norm.usuarioEmail;
      return norm;
    });

    res.json({ ok: true, data: out });
  } catch (err) {
    console.error("❌ GET relacionados", err);
    res.status(500).json({ error: "Error obteniendo relacionados" });
  }
});

// ======================
// GET relacionados legacy
// ======================
router.get("/relacionados/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const base = await Servicio.findById(id).lean();
    if (!base) return res.status(404).json({ error: "Servicio no encontrado" });

    const relOr = [];
    if (base.categoria) relOr.push({ categoria: base.categoria });
    if (base.oficio) relOr.push({ oficio: base.oficio });
    if (base.pueblo) relOr.push({ pueblo: base.pueblo });
    if (base.provincia) relOr.push({ provincia: base.provincia });

    if (!relOr.length) return res.json({ ok: true, data: [] });

    const query = {
      _id: { $ne: base._id },
      $and: [
        { $or: [{ estado: { $exists: false } }, { estado: "activo" }] },
        { $or: relOr },
      ],
    };

    const data = await Servicio.find(query)
      .limit(6)
      .sort({ creadoEn: -1, _id: -1 })
      .lean();

    const out = (data || []).map((s) => {
      const norm = normalizeServicioMedia(s);
      delete norm.usuarioEmail;
      return norm;
    });

    res.json({ ok: true, data: out });
  } catch (err) {
    console.error("❌ GET relacionados (legacy)", err);
    res.status(500).json({ error: "Error obteniendo relacionados" });
  }
});

// ======================
// GET /api/servicios/:id
// ======================
router.get("/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "ID requerido" });

    let s = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      s = await Servicio.findById(id).lean();
    }

    if (!s) {
      s = await Servicio.collection.findOne({ _id: id });
    }

    if (!s) return res.status(404).json({ error: "Servicio no encontrado" });

    const me = normalizeEmail(req?.user?.email);
    const owner = normalizeEmail(s?.usuarioEmail);
    const isMine = me && owner && me === owner;

    if (!isMine && s.estado !== "activo") {
      return res.status(404).json({ error: "Servicio no encontrado" });
    }

    const out = normalizeServicioMedia(s);
    delete out.usuarioEmail;

    return res.json({ ok: true, data: out, servicio: out });
  } catch (e) {
    console.error("❌ GET /api/servicios/:id", e);
    res.status(500).json({ error: "Error obteniendo servicio" });
  }
});

// ======================
// POST /api/servicios
// ======================
router.post("/", authRequired, async (req, res) => {
  try {
    const b = req.body || {};

    const profesionalNombre = String(b.profesionalNombre || "").trim();
    const nombre = String(b.nombre || "").trim();
    const categoria = String(b.categoria || "").trim();
    const oficio = String(b.oficio || "").trim();
    const descripcion = String(b.descripcion || "").trim();
    const contacto = String(b.contacto || "").trim();
    const whatsapp = String(b.whatsapp || "").trim();
    const pueblo = String(b.pueblo || "").trim();
    const provincia = String(b.provincia || "").trim();
    const comunidad = String(b.comunidad || "").trim();

    if (!profesionalNombre) return res.status(400).json({ error: "Falta profesionalNombre" });
    if (!nombre) return res.status(400).json({ error: "Falta nombre" });
    if (!categoria) return res.status(400).json({ error: "Falta categoria" });
    if (!oficio) return res.status(400).json({ error: "Falta oficio" });
    if (!descripcion) return res.status(400).json({ error: "Falta descripcion" });
    if (!contacto) return res.status(400).json({ error: "Falta contacto" });
    if (!pueblo) return res.status(400).json({ error: "Falta pueblo" });

    const imagenes = Array.isArray(b.imagenes)
      ? b.imagenes.map((x) => normalizePublicMediaUrl(x)).filter(Boolean)
      : [];

    const videoUrl = b.videoUrl ? normalizePublicMediaUrl(b.videoUrl) : "";
    const location = buildOptionalLocation(b);

    const s = await Servicio.create({
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
      location,
      usuarioEmail: normalizeEmail(req.user.email),

      estado: "pendiente",
      revisado: false,
      destacado: false,
      destacadoHasta: null,
      destacadoHome: false,
    });

    res.json({ ok: true, servicio: normalizeServicioMedia(s.toObject()) });
  } catch (err) {
    console.error("❌ POST /api/servicios", err);
    res.status(500).json({ error: "Error creando servicio" });
  }
});

// ======================
// PUT /api/servicios/:id
// ======================
router.put("/:id", authRequired, loadServicio, async (req, res) => {
  try {
    if (!isOwner(req) && !req.user?.isAdmin) {
      return res.status(403).json({ error: "No autorizado" });
    }

    const b = req.body || {};
    const patch = {};

    const allowed = [
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
    ];

    for (const k of allowed) {
      if (b[k] !== undefined) patch[k] = String(b[k] || "").trim();
    }

    if (b.imagenes !== undefined) {
      patch.imagenes = Array.isArray(b.imagenes)
        ? b.imagenes.map((x) => normalizePublicMediaUrl(x)).filter(Boolean)
        : [];
    }

    if (b.videoUrl !== undefined) {
      patch.videoUrl = b.videoUrl ? normalizePublicMediaUrl(b.videoUrl) : "";
    }

    if (b.location !== undefined || b.lat !== undefined || b.lng !== undefined) {
      patch.location = buildOptionalLocation(b);
    }

    const beforeKeys = new Set(collectKeysFromServicioLike(req.servicio.toObject()));
    const afterSnapshot = {
      imagenes: patch.imagenes !== undefined ? patch.imagenes : req.servicio.imagenes,
      videoUrl: patch.videoUrl !== undefined ? patch.videoUrl : req.servicio.videoUrl,
    };
    const afterKeys = new Set(collectKeysFromServicioLike(afterSnapshot));

    const removed = [];
    for (const k of beforeKeys) if (!afterKeys.has(k)) removed.push(k);
    await deleteR2Keys(removed);

    const wasActive = String(req.servicio.estado || "activo") === "activo";
    const isAdmin = !!req.user?.isAdmin;
    const touchedSomething = Object.keys(patch).length > 0;

    if (!isAdmin && wasActive && touchedSomething) {
      patch.estado = "pendiente";
      patch.revisado = false;
      patch.destacado = false;
      patch.destacadoHasta = null;
      patch.destacadoHome = false;
    }

    const updated = await Servicio.findByIdAndUpdate(req.params.id, patch, { new: true }).lean();
    if (!updated) return res.status(404).json({ error: "Servicio no encontrado" });

    res.json({ ok: true, servicio: normalizeServicioMedia(updated) });
  } catch (err) {
    console.error("❌ PUT /api/servicios/:id", err);
    res.status(500).json({ error: "Error actualizando servicio" });
  }
});

// ======================
// DELETE /api/servicios/:id
// ======================
router.delete("/:id", authRequired, loadServicio, async (req, res) => {
  try {
    if (!isOwner(req) && !req.user?.isAdmin) {
      return res.status(403).json({ error: "No autorizado" });
    }

    const keys = collectKeysFromServicioLike(req.servicio.toObject());
    await deleteR2Keys(keys);

    await Servicio.deleteOne({ _id: req.servicio._id });

    res.json({ ok: true });
  } catch (err) {
    console.error("❌ DELETE /api/servicios/:id", err);
    res.status(500).json({ error: "Error eliminando servicio" });
  }
});

module.exports = router;