const express = require("express");
const mongoose = require("mongoose");
const Servicio = require("../models/servicio.model.js");
const { authRequired, requireAdmin } = require("../auth.cjs");

const router = express.Router();

function asBool(v) {
  if (v === true || v === "true" || v === 1 || v === "1") return true;
  if (v === false || v === "false" || v === 0 || v === "0") return false;
  return undefined;
}

function addDays(d, days) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

// ✅ logged user can call /me (admin or not)
router.use(authRequired);

router.get("/me", (req, res) => {
  res.json({
    ok: true,
    email: req.user?.email || null,
    isAdmin: !!req.user?.is_admin,
  });
});

// ✅ the rest requires admin
router.use(requireAdmin);

router.get("/servicios", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limitRaw = parseInt(String(req.query.limit || "60"), 10) || 60;
    const limit = Math.min(200, Math.max(1, limitRaw));
    const skip = (page - 1) * limit;

    const q = String(req.query.q || "").trim();
    const estado = String(req.query.estado || "").trim();
    const revisadoQ = String(req.query.revisado || "").trim();

    const filter = {};

    const and = [];

    if (estado) {
      and.push({ estado });
    }

    if (revisadoQ === "true" || revisadoQ === "false") {
      and.push({ revisado: revisadoQ === "true" });
    }

    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      and.push({
        $or: [
          { nombre: rx },
          { oficio: rx },
          { pueblo: rx },
          { provincia: rx },
          { comunidad: rx },
          { contacto: rx },
          { usuarioEmail: rx },
          { profesionalNombre: rx },
        ],
      });
    }

    const finalFilter = and.length ? { $and: and } : {};

    const [totalItems, items] = await Promise.all([
      Servicio.countDocuments(finalFilter),
      Servicio.find(finalFilter)
        .sort({ creadoEn: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalItems / limit));

    res.json({
      ok: true,
      page,
      totalPages,
      totalItems,
      data: items || [],
    });
  } catch (err) {
    console.error("❌ admin2 list error:", err);
    res.status(500).json({ ok: false, error: "Error listando servicios" });
  }
});

router.patch("/servicios/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, error: "Invalid id" });
    }

    const patch = req.body || {};

    const allowed = {};
    const estado = patch.estado != null ? String(patch.estado) : null;

    if (estado != null) {
      if (estado !== "activo" && estado !== "inactivo") {
        return res.status(400).json({ ok: false, error: "estado inválido" });
      }
      allowed.estado = estado;
    }

    const revisado = asBool(patch.revisado);
    if (revisado !== undefined) allowed.revisado = revisado;

    const destacado = asBool(patch.destacado);
    if (destacado !== undefined) allowed.destacado = destacado;

    const destacadoHome = asBool(patch.destacadoHome);
    if (destacadoHome !== undefined) allowed.destacadoHome = destacadoHome;

    // si no hay nada válido, corta con 400
    if (!Object.keys(allowed).length) {
      return res.status(400).json({ ok: false, error: "No hay campos para actualizar" });
    }

    const current = await Servicio.findById(id);
    if (!current) {
      return res.status(404).json({ ok: false, error: "No encontrado" });
    }

    // aplicar patch
    Object.assign(current, allowed);

    // manejar destacadoHasta: si activas alguno -> +30 días, si desactivas ambos -> null
    const willBeFeatured = !!(current.destacado || current.destacadoHome);

    if (willBeFeatured) {
      const now = new Date();
      const base = current.destacadoHasta ? new Date(current.destacadoHasta) : now;
      const baseOk = !Number.isNaN(base.getTime()) ? base : now;
      // si estaba vencido, reinicia desde ahora
      const start = baseOk.getTime() < now.getTime() ? now : baseOk;
      current.destacadoHasta = addDays(start, 30);
    } else {
      current.destacadoHasta = null;
    }

    await current.save();

    res.json({ ok: true, data: current.toObject() });
  } catch (err) {
    console.error("❌ admin2 patch error:", err);
    res.status(500).json({ ok: false, error: "Error actualizando servicio" });
  }
});

module.exports = router;
