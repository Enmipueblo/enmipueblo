// functions/backend/routes/system.routes.cjs
const express = require("express");
const Servicio = require("../models/servicio.model.js");

const router = express.Router();

// Ruta simple de prueba
router.get("/debug", (req, res) => {
  res.json({
    ok: true,
    message: "System route operational",
  });
});

// Legacy: GET /api/system/buscar
// Alias de la búsqueda general de servicios
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

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 12;
    const skip = (pageNum - 1) * limitNum;

    const query = {};

    if (categoria) query.categoria = categoria;
    if (pueblo) query.pueblo = pueblo;
    if (provincia) query.provincia = provincia;
    if (comunidad) query.comunidad = comunidad;

    if (texto) {
      const regex = new RegExp(texto, "i");
      query.$or = [
        { nombre: regex },
        { oficio: regex },
        { descripcion: regex },
        { pueblo: regex },
        { provincia: regex },
        { comunidad: regex },
      ];
    }

    const [servicios, total] = await Promise.all([
      Servicio.find(query)
        .skip(skip)
        .limit(limitNum)
        .sort({ creadoEn: -1 }),
      Servicio.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limitNum);

    res.json({
      data: servicios,
      page: pageNum,
      totalPages,
      totalItems: total,
    });
  } catch (error) {
    console.error("❌ Error en /system/buscar:", error);
    res.status(500).json({ error: "Error al buscar servicios" });
  }
});

module.exports = router;
