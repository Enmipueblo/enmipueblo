const express = require("express");
const Servicio = require("../models/servicio.model.js");
const { authRequired } = require("../auth.cjs");

const router = express.Router();

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res
      .status(403)
      .json({ error: "Solo administradores pueden acceder a este panel." });
  }
  next();
}

function escapeRegex(str = "") {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
      const safe = escapeRegex(texto);
      const regex = new RegExp(safe, "i");
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
        .sort({ creadoEn: -1 })
        .lean(),
      Servicio.countDocuments(query),
    ]);

    const totalPages = Math.ceil(totalItems / limitNum);

    res.json({ ok: true, data, page: pageNum, totalPages, totalItems });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Error cargando servicios para admin." });
  }
});

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

      const activar = typeof activo === "boolean" ? activo : true;

      if (!activar) {
        servicio.destacado = false;
        servicio.destacadoHasta = null;
        await servicio.save();
        return res.json({ ok: true, servicio });
      }

      const diasNum = Number(dias || 30);
      const ahora = new Date();
      const hasta = new Date(ahora.getTime() + diasNum * 24 * 60 * 60 * 1000);

      servicio.destacado = true;
      servicio.destacadoHasta = hasta;

      await servicio.save();

      res.json({ ok: true, servicio });
    } catch {
      res.status(500).json({ error: "No se pudo actualizar el destacado." });
    }
  }
);

router.post(
  "/servicios/:id/estado",
  authRequired,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { estado } = req.body;

      if (!["activo", "pausado", "pendiente", "eliminado"].includes(estado)) {
        return res.status(400).json({ error: "Estado inválido" });
      }

      const servicio = await Servicio.findById(id);
      if (!servicio) {
        return res.status(404).json({ error: "Servicio no encontrado" });
      }

      servicio.estado = estado;
      await servicio.save();

      res.json({ ok: true, servicio });
    } catch {
      res.status(500).json({ error: "No se pudo actualizar el estado." });
    }
  }
);

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
    } catch {
      res.status(500).json({ error: "No se pudo marcar como revisado." });
    }
  }
);

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

      const activar = typeof activo === "boolean" ? activo : true;

      servicio.destacadoHome = activar;
      await servicio.save();

      res.json({ ok: true, servicio });
    } catch {
      res
        .status(500)
        .json({ error: "No se pudo actualizar destacado en portada." });
    }
  }
);

module.exports = router;
