// functions/backend/routes/admin.routes.cjs
const express = require("express");
const Servicio = require("../models/servicio.model.js");
const { authRequired } = require("../auth.cjs");

const router = express.Router();

/**
 * Middleware: solo admins (req.user.isAdmin viene de auth.cjs)
 */
function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res
      .status(403)
      .json({ error: "Solo administradores pueden acceder a este panel." });
  }
  next();
}

// ----------------------------------------
// GET /api/admin/servicios
// ----------------------------------------
router.get("/servicios", authRequired, requireAdmin, async (req, res) => {
  try {
    const {
      texto,
      estado,
      pueblo,
      destacado,
      destacadoHome,
      page = 1,
      limit = 20,
    } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNumRaw = parseInt(limit, 10) || 20;
    const limitNum = Math.min(Math.max(limitNumRaw, 1), 100);
    const skip = (pageNum - 1) * limitNum;

    const query = {};

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

    if (estado) query.estado = estado;
    if (pueblo) query.pueblo = pueblo;

    if (typeof destacado !== "undefined") {
      if (destacado === "true") query.destacado = true;
      if (destacado === "false") query.destacado = { $ne: true };
    }

    if (typeof destacadoHome !== "undefined") {
      if (destacadoHome === "true") query.destacadoHome = true;
      if (destacadoHome === "false") query.destacadoHome = { $ne: true };
    }

    const [data, totalItems] = await Promise.all([
      Servicio.find(query)
        .skip(skip)
        .limit(limitNum)
        .sort({ creadoEn: -1 }),
      Servicio.countDocuments(query),
    ]);

    const totalPages = Math.ceil(totalItems / limitNum);

    res.json({ ok: true, data, page: pageNum, totalPages, totalItems });
  } catch (err) {
    console.error("❌ Error GET /api/admin/servicios:", err);
    res
      .status(500)
      .json({ error: "Error cargando servicios para admin." });
  }
});

// ----------------------------------------
// POST /api/admin/servicios/:id/destacar
//  - activo = true  → destacar X días (por defecto 30)
//  - activo = false → quitar destacado
// ----------------------------------------
router.post(
  "/servicios/:id/destacar",
  authRequired,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { activo, dias } = req.body || {};

      const servicio = await Servicio.findById(id);
      if (!servicio) {
        return res.status(404).json({ error: "Servicio no encontrado" });
      }

      const activar =
        typeof activo === "boolean" ? activo : true; // por defecto, activar

      if (!activar) {
        // Quitar destacado
        servicio.destacado = false;
        servicio.destacadoHasta = null;
        await servicio.save();
        return res.json({ ok: true, servicio });
      }

      const diasNum = Number(dias || 30);
      const ahora = new Date();
      const hasta = new Date(
        ahora.getTime() + diasNum * 24 * 60 * 60 * 1000
      );

      servicio.destacado = true;
      servicio.destacadoHasta = hasta;

      await servicio.save();

      res.json({ ok: true, servicio });
    } catch (err) {
      console.error("❌ Error POST /api/admin/servicios/:id/destacar:", err);
      res
        .status(500)
        .json({ error: "No se pudo actualizar el destacado." });
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

      if (
        !["activo", "pausado", "pendiente", "eliminado"].includes(estado)
      ) {
        return res
          .status(400)
          .json({ error: "Estado inválido" });
      }

      const servicio = await Servicio.findById(id);
      if (!servicio) {
        return res.status(404).json({ error: "Servicio no encontrado" });
      }

      servicio.estado = estado;
      await servicio.save();

      res.json({ ok: true, servicio });
    } catch (err) {
      console.error("❌ Error POST /api/admin/servicios/:id/estado:", err);
      res
        .status(500)
        .json({ error: "No se pudo actualizar el estado." });
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
      console.error("❌ Error POST /api/admin/servicios/:id/revisado:", err);
      res
        .status(500)
        .json({ error: "No se pudo marcar como revisado." });
    }
  }
);

// ----------------------------------------
// POST /api/admin/servicios/:id/destacar-home
//  - activo = true  → en portada
//  - activo = false → quitar de portada
// ----------------------------------------
router.post(
  "/servicios/:id/destacar-home",
  authRequired,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { activo } = req.body || {};

      const servicio = await Servicio.findById(id);
      if (!servicio) {
        return res.status(404).json({ error: "Servicio no encontrado" });
      }

      const activar =
        typeof activo === "boolean" ? activo : true;

      servicio.destacadoHome = activar;
      await servicio.save();

      res.json({ ok: true, servicio });
    } catch (err) {
      console.error(
        "❌ Error POST /api/admin/servicios/:id/destacar-home:",
        err
      );
      res
        .status(500)
        .json({ error: "No se pudo actualizar destacado en portada." });
    }
  }
);

module.exports = router;
