const express = require("express");
const Servicio = require("../models/servicio.model.js");

const router = express.Router();

function normalizeEmail(e) {
  return String(e || "").trim().toLowerCase();
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "No autorizado" });
  if (!req.user.isAdmin) return res.status(403).json({ error: "No eres admin" });
  next();
}

const estadosValidos = ["pendiente", "activo", "pausado", "eliminado"];

function parseBool(v) {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v === "true";
  return false;
}

function parseDateOrNull(v) {
  if (v === undefined || v === null || v === "") return null;

  // Compat: si llega un número (o string numérico), lo interpretamos como “días desde hoy”.
  // Evita el bug histórico donde el frontend enviaba "30" y terminaba en 1970.
  if (typeof v === "number" || (typeof v === "string" && /^\s*\d+\s*$/.test(v))) {
    const days = Number(v);
    if (!Number.isFinite(days) || days <= 0) return null;

    // límite de seguridad (1 año)
    const clamped = Math.min(days, 366);
    return new Date(Date.now() + clamped * 24 * 60 * 60 * 1000);
  }

  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

// ======================
// LISTAR (GET)
// ======================
router.get("/servicios", requireAdmin, async (req, res) => {
  try {
    const {
      texto = "",
      estado = "",
      pueblo = "",
      destacado = "",
      destacadoHome = "",
      page = 1,
      limit = 20,
    } = req.query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const skip = (pageNum - 1) * limitNum;

    const query = {};

    if (estado) query.estado = estado;
    if (pueblo) query.pueblo = pueblo;

    if (destacado === "true") query.destacado = true;
    if (destacado === "false") query.destacado = false;

    if (destacadoHome === "true") query.destacadoHome = true;
    if (destacadoHome === "false") query.destacadoHome = false;

    const term = String(texto || "").trim();
    if (term) {
      const safe = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

    const [data, total] = await Promise.all([
      Servicio.find(query)
        .skip(skip)
        .limit(limitNum)
        .sort({ creadoEn: -1, _id: -1 })
        .lean(),
      Servicio.countDocuments(query),
    ]);

    res.json({
      ok: true,
      page: pageNum,
      totalPages: Math.max(1, Math.ceil(total / limitNum)),
      totalItems: total,
      data,
    });
  } catch (err) {
    console.error("❌ GET /api/admin/servicios", err);
    res.status(500).json({ error: "Error listando servicios (admin)" });
  }
});

// ======================
// PATCH endpoints
// ======================
router.patch("/servicios/:id/estado", requireAdmin, async (req, res) => {
  try {
    const { estado } = req.body || {};
    if (!estadosValidos.includes(estado)) {
      return res.status(400).json({ error: "Estado inválido" });
    }

    const s = await Servicio.findByIdAndUpdate(req.params.id, { estado }, { new: true }).lean();
    if (!s) return res.status(404).json({ error: "Servicio no encontrado" });
    res.json({ ok: true, servicio: s });
  } catch (err) {
    console.error("❌ PATCH estado", err);
    res.status(500).json({ error: "Error actualizando estado" });
  }
});

router.patch("/servicios/:id/revisado", requireAdmin, async (req, res) => {
  try {
    const { revisado } = req.body || {};
    const s = await Servicio.findByIdAndUpdate(
      req.params.id,
      { revisado: parseBool(revisado) },
      { new: true }
    ).lean();

    if (!s) return res.status(404).json({ error: "Servicio no encontrado" });
    res.json({ ok: true, servicio: s });
  } catch (err) {
    console.error("❌ PATCH revisado", err);
    res.status(500).json({ error: "Error actualizando revisado" });
  }
});

router.patch("/servicios/:id/destacar-home", requireAdmin, async (req, res) => {
  try {
    const { destacadoHome } = req.body || {};
    const s = await Servicio.findByIdAndUpdate(
      req.params.id,
      { destacadoHome: parseBool(destacadoHome) },
      { new: true }
    ).lean();

    if (!s) return res.status(404).json({ error: "Servicio no encontrado" });
    res.json({ ok: true, servicio: s });
  } catch (err) {
    console.error("❌ PATCH destacar-home", err);
    res.status(500).json({ error: "Error actualizando destacadoHome" });
  }
});

router.patch("/servicios/:id/destacar", requireAdmin, async (req, res) => {
  try {
    const { destacado, destacadoHasta } = req.body || {};
    const d = parseBool(destacado);
    const hasta = d ? parseDateOrNull(destacadoHasta) : null;

    const s = await Servicio.findByIdAndUpdate(
      req.params.id,
      { destacado: d, destacadoHasta: hasta },
      { new: true }
    ).lean();

    if (!s) return res.status(404).json({ error: "Servicio no encontrado" });
    res.json({ ok: true, servicio: s });
  } catch (err) {
    console.error("❌ PATCH destacar", err);
    res.status(500).json({ error: "Error actualizando destacado" });
  }
});

// ======================
// POST endpoints antiguos (compat)
// ======================
router.post("/servicios/:id/estado", requireAdmin, async (req, res) => {
  req.body = req.body || {};
  return router.handle(
    { ...req, method: "PATCH", url: `/servicios/${req.params.id}/estado` },
    res
  );
});

router.post("/servicios/:id/revisado", requireAdmin, async (req, res) => {
  return router.handle(
    { ...req, method: "PATCH", url: `/servicios/${req.params.id}/revisado` },
    res
  );
});

router.post("/servicios/:id/destacarHome", requireAdmin, async (req, res) => {
  return router.handle(
    { ...req, method: "PATCH", url: `/servicios/${req.params.id}/destacar-home` },
    res
  );
});

module.exports = router;
