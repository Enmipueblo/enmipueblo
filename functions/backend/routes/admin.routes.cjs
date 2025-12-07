// functions/backend/routes/admin.routes.cjs
const express = require("express");
const Servicio = require("../models/servicio.model.js");
const { authRequired, adminRequired } = require("../auth.cjs");

const router = express.Router();

/**
 * GET /api/admin/servicios
 * Lista de servicios con filtros básicos para moderación.
 * Solo accesible para admins.
 *
 * Query:
 *  - estado: activo|pausado|pendiente|eliminado (opcional)
 *  - destacado: true|false (opcional)
 *  - texto: busca en nombre/oficio/descripcion/pueblo/provincia/comunidad/email
 *  - pueblo: filtro exacto por pueblo (opcional)
 *  - page, limit
 */
router.get("/servicios", authRequired, adminRequired, async (req, res) => {
  try {
    const {
      estado,
      destacado,
      texto,
      pueblo,
      page = 1,
      limit = 20,
    } = req.query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumRaw = parseInt(limit, 10) || 20;
    const limitNum = Math.min(Math.max(limitNumRaw, 1), 100);
    const skip = (pageNum - 1) * limitNum;

    const query = {};

    if (estado) {
      query.estado = estado;
    }

    if (typeof destacado !== "undefined") {
      if (destacado === "true" || destacado === "1") query.destacado = true;
      if (destacado === "false" || destacado === "0") query.destacado = false;
    }

    if (pueblo) {
      query.pueblo = pueblo;
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
        .sort({ destacado: -1, creadoEn: -1 })
        .skip(skip)
        .limit(limitNum),
      Servicio.countDocuments(query),
    ]);

    const totalPages = Math.ceil(totalItems / limitNum);

    res.json({
      ok: true,
      data,
      page: pageNum,
      totalPages,
      totalItems,
    });
  } catch (err) {
    console.error("❌ GET /api/admin/servicios", err);
    res.status(500).json({ error: "Error obteniendo servicios" });
  }
});

/**
 * POST /api/admin/servicios/:id/destacar
 * Marca un servicio como destacado durante X días.
 * Body: { dias: number } (opcional, por defecto 7)
 */
router.post(
  "/servicios/:id/destacar",
  authRequired,
  adminRequired,
  async (req, res) => {
    try {
      const { dias = 7 } = req.body || {};
      const diasNum = Number(dias) || 7;

      const hasta = new Date();
      hasta.setDate(hasta.getDate() + diasNum);

      const servicio = await Servicio.findByIdAndUpdate(
        req.params.id,
        {
          destacado: true,
          destacadoHasta: hasta,
          estado: "activo",
        },
        { new: true }
      );

      if (!servicio) {
        return res.status(404).json({ error: "Servicio no encontrado" });
      }

      res.json({
        ok: true,
        mensaje: `Servicio destacado durante ${diasNum} días`,
        servicio,
      });
    } catch (err) {
      console.error(
        "❌ POST /api/admin/servicios/:id/destacar",
        err
      );
      res
        .status(500)
        .json({ error: "No se pudo destacar el servicio" });
    }
  }
);

/**
 * POST /api/admin/servicios/:id/estado
 * Cambia el estado del servicio (activo, pausado, pendiente, eliminado).
 * Body: { estado: "activo" | "pausado" | "pendiente" | "eliminado" }
 */
router.post(
  "/servicios/:id/estado",
  authRequired,
  adminRequired,
  async (req, res) => {
    try {
      const { estado } = req.body || {};
      const allowed = ["activo", "pausado", "pendiente", "eliminado"];

      if (!estado || !allowed.includes(estado)) {
        return res.status(400).json({ error: "Estado inválido" });
      }

      const servicio = await Servicio.findByIdAndUpdate(
        req.params.id,
        { estado },
        { new: true }
      );

      if (!servicio) {
        return res.status(404).json({ error: "Servicio no encontrado" });
      }

      res.json({
        ok: true,
        mensaje: `Estado actualizado a ${estado}`,
        servicio,
      });
    } catch (err) {
      console.error(
        "❌ POST /api/admin/servicios/:id/estado",
        err
      );
      res
        .status(500)
        .json({ error: "No se pudo actualizar el estado" });
    }
  }
);

/**
 * POST /api/admin/servicios/:id/revisar
 * Marca un servicio como revisado.
 */
router.post(
  "/servicios/:id/revisar",
  authRequired,
  adminRequired,
  async (req, res) => {
    try {
      const servicio = await Servicio.findByIdAndUpdate(
        req.params.id,
        { revisado: true },
        { new: true }
      );

      if (!servicio) {
        return res.status(404).json({ error: "Servicio no encontrado" });
      }

      res.json({
        ok: true,
        mensaje: "Servicio marcado como revisado",
        servicio,
      });
    } catch (err) {
      console.error(
        "❌ POST /api/admin/servicios/:id/revisar",
        err
      );
      res
        .status(500)
        .json({ error: "No se pudo marcar como revisado" });
    }
  }
);

module.exports = router;
