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

router.use(authRequired);

router.get("/me", (req, res) => {
  res.json({
    ok: true,
    email: req.user?.email || null,
    isAdmin: !!req.user?.is_admin,
  });
});

// todo lo demás requiere admin
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

    const and = [];

    if (estado) and.push({ estado });

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

    const filter = and.length ? { $and: and } : {};

    const [totalItems, items] = await Promise.all([
      Servicio.countDocuments(filter),
      Servicio.find(filter)
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

    const body = req.body || {};

    // Traemos el doc actual SIN validarlo (lean)
    const cur = await Servicio.findById(id).lean();
    if (!cur) return res.status(404).json({ ok: false, error: "No encontrado" });

    const $set = {};

    // estado
    if (body.estado != null) {
      const estado = String(body.estado);
      if (estado !== "activo" && estado !== "inactivo") {
        return res.status(400).json({ ok: false, error: "estado inválido" });
      }
      $set.estado = estado;
    }

    // revisado
    const revisado = asBool(body.revisado);
    if (revisado !== undefined) $set.revisado = revisado;

    // destacado / destacadoHome
    const destacado = asBool(body.destacado);
    if (destacado !== undefined) $set.destacado = destacado;

    const destacadoHome = asBool(body.destacadoHome);
    if (destacadoHome !== undefined) $set.destacadoHome = destacadoHome;

    // si no hay nada, 400
    if (!Object.keys($set).length) {
      return res.status(400).json({ ok: false, error: "No hay campos para actualizar" });
    }

    // ✅ destacadoHasta: SOLO si tocaron destacado/destacadoHome
    const touchedFeatured = ("destacado" in $set) || ("destacadoHome" in $set);
    if (touchedFeatured) {
      const nextDestacado =
        "destacado" in $set ? !!$set.destacado : !!cur.destacado;
      const nextDestacadoHome =
        "destacadoHome" in $set ? !!$set.destacadoHome : !!cur.destacadoHome;

      const willBeFeatured = !!(nextDestacado || nextDestacadoHome);

      if (willBeFeatured) {
        const now = new Date();
        const base = cur.destacadoHasta ? new Date(cur.destacadoHasta) : now;
        const baseOk = !Number.isNaN(base.getTime()) ? base : now;
        const start = baseOk.getTime() < now.getTime() ? now : baseOk;
        $set.destacadoHasta = addDays(start, 30);
      } else {
        $set.destacadoHasta = null;
      }
    }

    // ✅ UPDATE sin save(): NO revalida docs viejos (clave para tu caso)
    const updated = await Servicio.findByIdAndUpdate(
      id,
      { $set },
      { new: true } // devuelve el doc actualizado
    ).lean();

    res.json({ ok: true, data: updated });
  } catch (err) {
    console.error("❌ admin2 patch error:", err);
    res.status(500).json({ ok: false, error: "Error actualizando servicio" });
  }
});

module.exports = router;
