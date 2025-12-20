const express = require("express");
const Servicio = require("../models/servicio.model.js");

const router = express.Router();

function escapeRegex(str = "") {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

router.get("/debug", (req, res) => {
  res.json({ ok: true, message: "System route operational" });
});

router.get("/buscar", async (req, res) => {
  try {
    const {
      texto,
      categoria,
      pueblo,
      provincia,
      comunidad,
      page = 1,
      limit = 12,
    } = req.query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumRaw = parseInt(limit, 10) || 12;
    const limitNum = Math.min(Math.max(limitNumRaw, 1), 50);
    const skip = (pageNum - 1) * limitNum;

    const query = {
      $or: [{ estado: { $exists: false } }, { estado: "activo" }],
    };

    if (categoria) query.categoria = categoria;
    if (pueblo) query.pueblo = pueblo;
    if (provincia) query.provincia = provincia;
    if (comunidad) query.comunidad = comunidad;

    if (texto) {
      const safe = escapeRegex(texto);
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

    const [servicios, total] = await Promise.all([
      Servicio.find(query)
        .select("-usuarioEmail")
        .skip(skip)
        .limit(limitNum)
        .sort({ creadoEn: -1, _id: -1 })
        .lean(),
      Servicio.countDocuments(query),
    ]);

    res.json({
      data: servicios,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      totalItems: total,
    });
  } catch (error) {
    res.status(500).json({ error: "Error al buscar servicios" });
  }
});

module.exports = router;
