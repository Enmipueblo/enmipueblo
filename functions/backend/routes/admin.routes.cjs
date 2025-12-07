// functions/backend/routes/admin.routes.cjs
const express = require("express");
const Servicio = require("../models/servicio.model.js");
const { authRequired } = require("../auth.cjs");

const router = express.Router();

function requireAdmin(req, res, next) {
  const claims = (req.user && req.user.token) || {};
  const isAdmin =
    claims.isAdmin === true ||
    claims.admin === true ||
    claims.role === "admin";

  if (!isAdmin) {
    return res.status(403).json({ error: "Solo administradores" });
  }
  next();
}

// ----------------------------------------
// GET /api/admin/servicios  (listado moderación)
// ----------------------------------------
router.get("/servicios", authRequired, requireAdmin, async (req, res) => {
  try {
    const {
      texto,
      estado,
      pueblo,
      destacado,
      page = 1,
      limit = 20,
    } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNumRaw = parseInt(limit, 10) || 20;
    const limitNum = Math.min(Math.max(limitNumRaw, 1), 100);
    const skip = (pageNum - 1) * limitNum;

    const query = {};

    if (estado) query.estado = estado;
    if (pueblo) query.pueblo = pueblo;

    if (destacado === "true") {
      query.destacado = true;
    } else if (destacado === "false") {
      query.destacado = { $ne: true };
    }

    if (texto) {
      const regex = new RegExp(texto, "i");
      query.$or = [
        { nombre: regex },
        { oficio: regex },
        { descripcion: regex },
        { pueblo: regex },
        { provincia: regex },
        { comunidad: regex },
        { usuarioEmail: regex },
      ];
    }

    const [data, totalItems] = await Promise.all([
      Servicio.find(query)
        .sort({ creadoEn: -1 })
        .skip(skip)
        .limit(limitNum),
      Servicio.countDocuments(query),
    ]);

    const totalPages = Math.ceil(totalItems / limitNum);

    res.json({ data, page: pageNum, totalPages, totalItems });
  } catch (err) {
    console.error("❌ Error GET /admin/servicios:", err);
    res.status(500).json({ error: "Error obteniendo servicios" });
  }
});

// ----------------------------------------
// POST /api/admin/servicios/:id/destacar
// ----------------------------------------
router.post(
  "/servicios/:id/destacar",
  authRequired,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const dias = parseInt(req.body?.dias, 10) || 7;

      const servicio = await Servicio.findById(id);
      if (!servicio) {
        return res.status(404).json({ error: "Servicio no encontrado" });
      }

      const ahora = new Date();
      const hasta = new Date(ahora.getTime() + dias * 24 * 60 * 60 * 1000);

      servicio.destacado = true;
      servicio.destacadoHasta = hasta;

      await servicio.save();

      res.json({ ok: true, servicio });
    } catch (err) {
      console.error("❌ Error POST /admin/servicios/:id/destacar:", err);
      res
        .status(500)
        .json({ error: "Error al marcar el servicio como destacado" });
    }
  }
);

// ----------------------------------------
// POST /api/admin/servicios/:id/estado
// ----------------------------------------
router.post(
  "/servicios/:id/estado",
  authRequired,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { estado } = req.body;

      const estadosValidos = ["activo", "pendiente", "pausado", "eliminado"];
      if (!estadosValidos.includes(String(estado))) {
        return res.status(400).json({ error: "Estado no válido" });
      }

      const servicio = await Servicio.findById(id);
      if (!servicio) {
        return res.status(404).json({ error: "Servicio no encontrado" });
      }

      servicio.estado = estado;
      await servicio.save();

      res.json({ ok: true, servicio });
    } catch (err) {
      console.error("❌ Error POST /admin/servicios/:id/estado:", err);
      res
        .status(500)
        .json({ error: "Error al actualizar el estado del servicio" });
    }
  }
);

// ----------------------------------------
// POST /api/admin/servicios/:id/revisado
// ----------------------------------------
router.post(
  "/servicios/:id/revisado",
  authRequired,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;

      const servicio = await Servicio.findById(id);
      if (!servicio) {
        return res.status(404).json({ error: "Servicio no encontrado" });
      }

      servicio.revisado = true;
      await servicio.save();

      res.json({ ok: true, servicio });
    } catch (err) {
      console.error("❌ Error POST /admin/servicios/:id/revisado:", err);
      res
        .status(500)
        .json({ error: "Error al marcar el servicio como revisado" });
    }
  }
);

module.exports = router;
