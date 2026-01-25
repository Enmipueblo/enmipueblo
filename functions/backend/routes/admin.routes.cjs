const express = require("express");
const Servicio = require("../models/servicio.model.js");

const router = express.Router();

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "No autorizado" });
  if (!req.user.isAdmin) return res.status(403).json({ error: "No tienes permisos de admin" });
  next();
}

function parseBool(v) {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v === "true";
  return false;
}

function parseDateOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

const estadosValidos = ["pendiente", "activo", "pausado", "eliminado"];

// ✅ Debug real: esto te dice EXACTAMENTE qué email / isAdmin ve el backend
router.get("/me", (req, res) => {
  if (!req.user) return res.status(200).json({ ok: true, user: null });
  return res.json({ ok: true, user: req.user });
});

// LISTADO ADMIN
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
      Servicio.find(query).skip(skip).limit(limitNum).sort({ creadoEn: -1, _id: -1 }).lean(),
      Servicio.countDocuments(query),
    ]);

    return res.json({
      ok: true,
      page: pageNum,
      totalPages: Math.max(1, Math.ceil(total / limitNum)),
      totalItems: total,
      data,
    });
  } catch (err) {
    console.error("❌ GET /api/admin/servicios", err);
    return res.status(500).json({ error: "Error listando servicios (admin)" });
  }
});

// PATCH: estado
router.patch("/servicios/:id/estado", requireAdmin, async (req, res) => {
  try {
    const { estado } = req.body || {};
    if (!estadosValidos.includes(estado)) {
      return res.status(400).json({ error: "Estado inválido" });
    }
    const s = await Servicio.findByIdAndUpdate(req.params.id, { estado }, { new: true }).lean();
    if (!s) return res.status(404).json({ error: "Servicio no encontrado" });
    return res.json({ ok: true, servicio: s });
  } catch (err) {
    console.error("❌ PATCH estado", err);
    return res.status(500).json({ error: "Error actualizando estado" });
  }
});

// PATCH: revisado
router.patch("/servicios/:id/revisado", requireAdmin, async (req, res) => {
  try {
    const { revisado } = req.body || {};
    const s = await Servicio.findByIdAndUpdate(
      req.params.id,
      { revisado: parseBool(revisado) },
      { new: true }
    ).lean();
    if (!s) return res.status(404).json({ error: "Servicio no encontrado" });
    return res.json({ ok: true, servicio: s });
  } catch (err) {
    console.error("❌ PATCH revisado", err);
    return res.status(500).json({ error: "Error actualizando revisado" });
  }
});

// PATCH: destacarHome
router.patch("/servicios/:id/destacar-home", requireAdmin, async (req, res) => {
  try {
    const { destacadoHome } = req.body || {};
    const s = await Servicio.findByIdAndUpdate(
      req.params.id,
      { destacadoHome: parseBool(destacadoHome) },
      { new: true }
    ).lean();
    if (!s) return res.status(404).json({ error: "Servicio no encontrado" });
    return res.json({ ok: true, servicio: s });
  } catch (err) {
    console.error("❌ PATCH destacar-home", err);
    return res.status(500).json({ error: "Error actualizando destacadoHome" });
  }
});

// PATCH: destacar / destacadoHasta (si viene dias, lo calcula)
router.patch("/servicios/:id/destacar", requireAdmin, async (req, res) => {
  try {
    const { destacado, destacadoHasta, dias } = req.body || {};

    const want = parseBool(destacado);
    let hasta = parseDateOrNull(destacadoHasta);

    if (want && !hasta) {
      const d = Number(dias || 0);
      const addDays = Number.isFinite(d) && d > 0 ? d : 30;
      hasta = new Date(Date.now() + addDays * 24 * 60 * 60 * 1000);
    }

    const s = await Servicio.findByIdAndUpdate(
      req.params.id,
      { destacado: want, destacadoHasta: want ? hasta : null },
      { new: true }
    ).lean();

    if (!s) return res.status(404).json({ error: "Servicio no encontrado" });
    return res.json({ ok: true, servicio: s });
  } catch (err) {
    console.error("❌ PATCH destacar", err);
    return res.status(500).json({ error: "Error actualizando destacado" });
  }
});

// Compat (por si tu frontend viejo usa POST)
router.post("/servicios/:id/estado", requireAdmin, async (req, res) => {
  req.method = "PATCH";
  return router.handle(req, res);
});
router.post("/servicios/:id/revisado", requireAdmin, async (req, res) => {
  req.method = "PATCH";
  req.url = `/servicios/${req.params.id}/revisado`;
  return router.handle(req, res);
});
router.post("/servicios/:id/destacarHome", requireAdmin, async (req, res) => {
  req.method = "PATCH";
  req.url = `/servicios/${req.params.id}/destacar-home`;
  return router.handle(req, res);
});

module.exports = router;
