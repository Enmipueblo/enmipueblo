// functions/backend/routes/servicios.routes.cjs
const express = require("express");
const Servicio = require("../models/servicio.model.js");

const router = express.Router();

// ----------------------------------------
// Crear servicio  POST /api/servicios
// ----------------------------------------
router.post("/", async (req, res) => {
  try {
    const datos = req.body;

    if (
      !datos.nombre ||
      !datos.categoria ||
      !datos.oficio ||
      !datos.descripcion ||
      !datos.contacto ||
      !datos.pueblo ||
      !datos.usuarioEmail
    ) {
      return res
        .status(400)
        .json({ mensaje: "Faltan campos obligatorios" });
    }

    const nuevo = new Servicio({
      nombre: datos.nombre,
      categoria: datos.categoria,
      oficio: datos.oficio,
      descripcion: datos.descripcion,
      contacto: datos.contacto,
      whatsapp: datos.whatsapp || "",
      pueblo: datos.pueblo,
      provincia: datos.provincia || "",
      comunidad: datos.comunidad || "",
      imagenes: datos.imagenes || [],
      videoUrl: datos.videoUrl || "",
      usuarioEmail: datos.usuarioEmail,
    });

    await nuevo.save();
    res.json({
      ok: true,
      mensaje: "Servicio creado correctamente",
      servicio: nuevo,
    });
  } catch (err) {
    console.error("❌ Error POST /servicios", err);
    res.status(500).json({ mensaje: "Error en el servidor" });
  }
});

// ----------------------------------------
// GET /api/servicios/:id (detalle)
// ----------------------------------------
router.get("/:id", async (req, res) => {
  try {
    const servicio = await Servicio.findById(req.params.id);
    if (!servicio) {
      return res.status(404).json({ error: "Servicio no encontrado" });
    }
    res.json(servicio);
  } catch (err) {
    console.error("❌ Error GET /servicios/:id", err);
    res
      .status(500)
      .json({ error: "Error al obtener el servicio" });
  }
});

// ----------------------------------------
// PUT /api/servicios/:id (editar)
// ----------------------------------------
router.put("/:id", async (req, res) => {
  try {
    const update = { ...req.body };

    const servicio = await Servicio.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true }
    );

    if (!servicio) {
      return res.status(404).json({ error: "Servicio no encontrado" });
    }

    res.json({ ok: true, servicio });
  } catch (err) {
    console.error("❌ Error PUT /servicios/:id", err);
    res
      .status(500)
      .json({ error: "Error al actualizar el servicio" });
  }
});

// ----------------------------------------
// DELETE /api/servicios/:id
// ----------------------------------------
router.delete("/:id", async (req, res) => {
  try {
    const deleted = await Servicio.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Servicio no encontrado" });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Error DELETE /servicios/:id", err);
    res
      .status(500)
      .json({ error: "Error al eliminar el servicio" });
  }
});

// ----------------------------------------
// GET /api/servicios
//  - Sin email  → búsqueda general (/buscar)
//  - Con email → “Mis anuncios” (panel usuario)
// ----------------------------------------
router.get("/", async (req, res) => {
  try {
    const {
      email,
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

    // Si viene email, filtramos por usuario
    if (email) {
      query.usuarioEmail = email;
    }

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

    const [data, totalItems] = await Promise.all([
      Servicio.find(query)
        .skip(skip)
        .limit(limitNum)
        .sort({ creadoEn: -1 }),
      Servicio.countDocuments(query),
    ]);

    const totalPages = Math.ceil(totalItems / limitNum);

    res.json({ data, page: pageNum, totalPages, totalItems });
  } catch (err) {
    console.error("❌ Error en GET /servicios:", err);
    res
      .status(500)
      .json({ error: "Error al obtener servicios" });
  }
});

module.exports = router;
