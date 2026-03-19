const express = require("express");
const mongoose = require("mongoose");
const Servicio = require("../models/servicio.model.js");
const { authRequired } = require("../auth.cjs");

const router = express.Router();

function isAdmin(req) {
  return !!(req.user?.isAdmin || req.user?.is_admin);
}

function normalizeText(s) {
  return String(s || "").trim();
}

function escapeRegex(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function asArray(v) {
  if (Array.isArray(v)) return v.filter(Boolean);
  if (!v) return [];
  return [v].filter(Boolean);
}

function pickFirst(...values) {
  for (const v of values) {
    const x = normalizeText(v);
    if (x) return x;
  }
  return "";
}

function buildPublicFilter(req) {
  const and = [];
  const texto = normalizeText(req.query.texto || req.query.q || "");
  const categoria = normalizeText(req.query.categoria || "");
  const oficio = normalizeText(req.query.oficio || "");
  const pueblo = normalizeText(req.query.pueblo || "");
  const provincia = normalizeText(req.query.provincia || "");
  const comunidad = normalizeText(req.query.comunidad || "");

  and.push({
    $or: [{ estado: "activo" }, { estado: { $exists: false } }, { estado: "" }],
  });

  if (texto) {
    const rx = new RegExp(escapeRegex(texto), "i");
    and.push({
      $or: [
        { nombre: rx },
        { profesionalNombre: rx },
        { oficio: rx },
        { categoria: rx },
        { descripcion: rx },
        { pueblo: rx },
        { provincia: rx },
        { comunidad: rx },
      ],
    });
  }

  if (categoria) and.push({ categoria: new RegExp(escapeRegex(categoria), "i") });
  if (oficio) and.push({ oficio: new RegExp(escapeRegex(oficio), "i") });
  if (pueblo) and.push({ pueblo: new RegExp(escapeRegex(pueblo), "i") });
  if (provincia) and.push({ provincia: new RegExp(escapeRegex(provincia), "i") });
  if (comunidad) and.push({ comunidad: new RegExp(escapeRegex(comunidad), "i") });

  return and.length ? { $and: and } : {};
}

function sanitizeServicioInput(body, req) {
  const pueblo = pickFirst(body.pueblo, body.localidad?.nombre, body.localidadNombre);
  const provincia = pickFirst(body.provincia, body.localidad?.provincia);
  const comunidad = pickFirst(
    body.comunidad,
    body.ccaa,
    body.localidad?.ccaa,
    body.localidad?.comunidad
  );

  const oficio = pickFirst(body.oficio, body.categoria);
  const categoria = pickFirst(body.categoria, body.oficio);

  const email = pickFirst(body.email, req.user?.email);
  const telefono = pickFirst(body.telefono);
  const whatsapp = pickFirst(body.whatsapp);
  const contacto = pickFirst(body.contacto, email, telefono, whatsapp);

  const nombre = pickFirst(
    body.nombre,
    body.titulo,
    body.profesionalNombre && oficio && pueblo ? `${oficio} en ${pueblo}` : "",
    oficio && pueblo ? `${oficio} en ${pueblo}` : ""
  );

  return {
    nombre,
    profesionalNombre: pickFirst(body.profesionalNombre, req.user?.name),
    oficio,
    categoria,
    descripcion: pickFirst(body.descripcion),
    email,
    telefono,
    whatsapp,
    contacto,
    pueblo,
    provincia,
    comunidad,
    usuarioEmail: pickFirst(body.usuarioEmail, req.user?.email),
    imagenes: asArray(body.imagenes),
    videoUrl: pickFirst(body.videoUrl),
    // se ignoran coords y mapa a propósito
  };
}

function requireOwnerOrAdmin(req, servicio) {
  if (isAdmin(req)) return true;
  const ownerEmail = normalizeText(servicio.usuarioEmail).toLowerCase();
  const me = normalizeText(req.user?.email).toLowerCase();
  return !!ownerEmail && !!me && ownerEmail === me;
}

router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limitRaw = parseInt(String(req.query.limit || "12"), 10) || 12;
    const limit = Math.min(60, Math.max(1, limitRaw));
    const skip = (page - 1) * limit;

    const filter = buildPublicFilter(req);

    const [totalItems, data] = await Promise.all([
      Servicio.countDocuments(filter),
      Servicio.find(filter)
        .sort({ destacadoHome: -1, destacado: -1, actualizadoEn: -1, creadoEn: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    res.json({
      ok: true,
      page,
      totalPages: Math.max(1, Math.ceil(totalItems / limit)),
      totalItems,
      data,
    });
  } catch (err) {
    console.error("❌ servicios list error:", err);
    res.status(500).json({ ok: false, error: "Error listando servicios" });
  }
});

router.get("/mios", authRequired, async (req, res) => {
  try {
    const email = normalizeText(req.user?.email);
    const data = await Servicio.find({ usuarioEmail: email })
      .sort({ actualizadoEn: -1, creadoEn: -1, _id: -1 })
      .lean();

    res.json({ ok: true, data });
  } catch (err) {
    console.error("❌ servicios mios error:", err);
    res.status(500).json({ ok: false, error: "Error listando tus servicios" });
  }
});

router.get("/:id/relacionados", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, error: "Invalid id" });
    }

    const cur = await Servicio.findById(id).lean();
    if (!cur) {
      return res.status(404).json({ ok: false, error: "No encontrado" });
    }

    const and = [
      { _id: { $ne: cur._id } },
      { $or: [{ estado: "activo" }, { estado: { $exists: false } }, { estado: "" }] },
    ];

    const or = [];
    if (cur.oficio) or.push({ oficio: new RegExp(escapeRegex(cur.oficio), "i") });
    if (cur.categoria) or.push({ categoria: new RegExp(escapeRegex(cur.categoria), "i") });
    if (cur.pueblo) or.push({ pueblo: new RegExp(escapeRegex(cur.pueblo), "i") });
    if (cur.provincia) or.push({ provincia: new RegExp(escapeRegex(cur.provincia), "i") });

    if (or.length) and.push({ $or: or });

    const data = await Servicio.find({ $and: and })
      .sort({ destacado: -1, actualizadoEn: -1, creadoEn: -1, _id: -1 })
      .limit(6)
      .lean();

    res.json({ ok: true, data });
  } catch (err) {
    console.error("❌ servicios relacionados error:", err);
    res.status(500).json({ ok: false, error: "Error cargando relacionados" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, error: "Invalid id" });
    }

    const data = await Servicio.findById(id).lean();
    if (!data) {
      return res.status(404).json({ ok: false, error: "No encontrado" });
    }

    res.json({ ok: true, data });
  } catch (err) {
    console.error("❌ servicios detalle error:", err);
    res.status(500).json({ ok: false, error: "Error cargando servicio" });
  }
});

router.post("/", authRequired, async (req, res) => {
  try {
    const payload = sanitizeServicioInput(req.body || {}, req);

    if (!payload.oficio) {
      return res.status(400).json({ ok: false, error: "El oficio es obligatorio" });
    }

    if (!payload.descripcion) {
      return res.status(400).json({ ok: false, error: "La descripción es obligatoria" });
    }

    if (!payload.pueblo) {
      return res.status(400).json({ ok: false, error: "Debes seleccionar una localidad válida" });
    }

    if (!payload.usuarioEmail) {
      return res.status(400).json({ ok: false, error: "No se pudo determinar el usuario del anuncio" });
    }

    const now = new Date();

    const doc = await Servicio.create({
      ...payload,
      estado: "pendiente",
      revisado: false,
      destacado: false,
      destacadoHome: false,
      destacadoHasta: null,
      creadoEn: now,
      actualizadoEn: now,
    });

    res.status(201).json({ ok: true, data: doc });
  } catch (err) {
    console.error("❌ servicios create error:", err);
    res.status(500).json({ ok: false, error: "Error creando servicio" });
  }
});

router.put("/:id", authRequired, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, error: "Invalid id" });
    }

    const cur = await Servicio.findById(id).lean();
    if (!cur) {
      return res.status(404).json({ ok: false, error: "No encontrado" });
    }

    if (!requireOwnerOrAdmin(req, cur)) {
      return res.status(403).json({ ok: false, error: "No autorizado" });
    }

    const payload = sanitizeServicioInput(req.body || {}, req);
    const isAdminReq = isAdmin(req);

    const $set = {
      ...payload,
      actualizadoEn: new Date(),
    };

    if (!isAdminReq) {
      if (cur.estado === "activo") {
        $set.estado = "pendiente";
        $set.revisado = false;
        $set.destacado = false;
        $set.destacadoHome = false;
        $set.destacadoHasta = null;
      }
    }

    const updated = await Servicio.findByIdAndUpdate(
      id,
      { $set },
      { new: true }
    ).lean();

    res.json({ ok: true, data: updated });
  } catch (err) {
    console.error("❌ servicios update error:", err);
    res.status(500).json({ ok: false, error: "Error actualizando servicio" });
  }
});

router.delete("/:id", authRequired, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, error: "Invalid id" });
    }

    const cur = await Servicio.findById(id).lean();
    if (!cur) {
      return res.status(404).json({ ok: false, error: "No encontrado" });
    }

    if (!requireOwnerOrAdmin(req, cur)) {
      return res.status(403).json({ ok: false, error: "No autorizado" });
    }

    await Servicio.findByIdAndDelete(id);

    res.json({ ok: true });
  } catch (err) {
    console.error("❌ servicios delete error:", err);
    res.status(500).json({ ok: false, error: "Error borrando servicio" });
  }
});

module.exports = router;