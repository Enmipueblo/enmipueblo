const express = require("express");
const Servicio = require("../models/servicio.model.js");

const router = express.Router();

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
    } = req.query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumRaw = parseInt(limit, 10) || 12;
    const limitNum = Math.min(Math.max(limitNumRaw, 1), 50);
    const skip = (pageNum - 1) * limitNum;

    const query = {};

    const buscandoMisAnuncios = !!email;
    if (buscandoMisAnuncios) {
      if (!req.user || !req.user.email) {
        return res.status(401).json({ error: "No autorizado. Inicia sesión." });
      }
      query.usuarioEmail = normalizeEmail(req.user.email);
      if (estado) query.estado = estado;
    } else {
      query.$or = [{ estado: { $exists: false } }, { estado: "activo" }];
    }

    if (categoria) query.categoria = categoria;
    if (pueblo) query.pueblo = pueblo;
    if (provincia) query.provincia = provincia;
    if (comunidad) query.comunidad = comunidad;

    if (typeof destacado !== "undefined") {
      query.destacado = String(destacado) === "true";
    }
    if (typeof destacadoHome !== "undefined") {
      query.destacadoHome = String(destacadoHome) === "true";
    }

    const term = (texto || q || "").toString().trim();
    if (term) {
      const safe = escapeRegex(term);
      const regex = new RegExp(safe, "i");
      query.$and = query.$and || [];
      query.$and.push({
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

    const projectionPublica = buscandoMisAnuncios ? "" : "-usuarioEmail";

    const [data, total] = await Promise.all([
      Servicio.find(query)
        .select(projectionPublica)
        .skip(skip)
        .limit(limitNum)
        .sort({ creadoEn: -1, _id: -1 })
        .lean(),
      Servicio.countDocuments(query),
    ]);

    res.json({
      ok: true,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      totalItems: total,
      data,
    });
  } catch (err) {
    console.error("❌ GET /api/servicios", err);
    res.status(500).json({ error: "Error al listar servicios" });
  }
});

/**
 * ✅ IMPORTANTE: esta ruta debe ir ANTES que "/:id"
 */
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

    const match = {
      _id: { $ne: base._id },
      $and: [statusOr, { $or: ors }],
    };

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
      const da = new Date(a.creadoEn || a.creado || 0).getTime();
      const db = new Date(b.creadoEn || b.creado || 0).getTime();
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

    if (!(isOwner || isAdmin)) {
      delete s.usuarioEmail;
    }

    res.json(s);
  } catch {
    res.status(400).json({ error: "ID inválido" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const {
      nombre,
      categoria,
      oficio,
      descripcion,
      contacto,
      whatsapp = "",
      pueblo,
      provincia = "",
      comunidad = "",
      imagenes = [],
      videoUrl = "",
    } = req.body || {};

    if (!nombre || !categoria || !oficio || !descripcion || !contacto || !pueblo) {
      return res.status(400).json({ error: "Faltan campos obligatorios" });
    }

    const nuevo = await Servicio.create({
      nombre,
      categoria,
      oficio,
      descripcion,
      contacto,
      whatsapp,
      pueblo,
      provincia,
      comunidad,
      imagenes: Array.isArray(imagenes) ? imagenes.filter(Boolean).slice(0, 12) : [],
      videoUrl: String(videoUrl || ""),
      usuarioEmail: normalizeEmail(req.user.email),
      estado: "activo",
      revisado: false,
      destacado: false,
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

    const ALLOWED = [
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
      if (Object.prototype.hasOwnProperty.call(body, k)) {
        update[k] = body[k];
      }
    }

    if (Object.prototype.hasOwnProperty.call(update, "imagenes")) {
      update.imagenes = Array.isArray(update.imagenes)
        ? update.imagenes.filter(Boolean).slice(0, 12)
        : [];
    }
    if (Object.prototype.hasOwnProperty.call(update, "videoUrl")) {
      update.videoUrl = String(update.videoUrl || "");
    }
    if (Object.prototype.hasOwnProperty.call(update, "whatsapp")) {
      update.whatsapp = String(update.whatsapp || "").trim();
    }

    Object.assign(req.servicio, update);
    await req.servicio.save();

    res.json({ ok: true, servicio: req.servicio });
  } catch (err) {
    console.error("❌ PUT /api/servicios/:id", err);
    res.status(500).json({ error: "Error actualizando servicio" });
  }
});

router.delete("/:id", requireAuth, loadServicio, requireOwner, async (req, res) => {
  try {
    await req.servicio.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    console.error("❌ DELETE /api/servicios/:id", err);
    res.status(500).json({ error: "Error eliminando servicio" });
  }
});

module.exports = router;
