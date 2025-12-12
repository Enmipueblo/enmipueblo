// functions/backend/routes/servicios.routes.cjs
const express = require("express");
const Servicio = require("../models/servicio.model.js");

const router = express.Router();

/**
 * Middleware sencillo: exige que haya usuario autenticado
 * (req.user lo debe rellenar el middleware global de Firebase en app.cjs)
 */
function requireAuth(req, res, next) {
  if (!req.user || !req.user.email) {
    return res
      .status(401)
      .json({ error: "No autorizado. Debes iniciar sesión." });
  }
  next();
}

/**
 * Helper: asegura que el servicio existe y pertenece al usuario actual.
 * Si todo OK, deja el servicio en req.servicio y sigue.
 */
async function requireOwner(req, res, next) {
  try {
    const servicio = await Servicio.findById(req.params.id);
    if (!servicio) {
      return res.status(404).json({ error: "Servicio no encontrado" });
    }

    if (!req.user || !req.user.email) {
      return res
        .status(401)
        .json({ error: "No autorizado. Debes iniciar sesión." });
    }

    if (String(servicio.usuarioEmail) !== String(req.user.email)) {
      return res
        .status(403)
        .json({ error: "No puedes modificar este servicio" });
    }

    req.servicio = servicio;
    next();
  } catch (err) {
    console.error("❌ Error en requireOwner:", err);
    return res
      .status(500)
      .json({ error: "Error al validar propietario del servicio" });
  }
}

// ----------------------------------------
// Crear servicio  POST /api/servicios
// ----------------------------------------
router.post("/", requireAuth, async (req, res) => {
  try {
    const datos = req.body;

    if (
      !datos.nombre ||
      !datos.categoria ||
      !datos.oficio ||
      !datos.descripcion ||
      !datos.contacto ||
      !datos.pueblo
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
      usuarioEmail: req.user.email,

      estado: "activo",
      revisado: false,
      destacado: false,
      destacadoHasta: null,
      destacadoHome: false,
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
// GET /api/servicios/:id (detalle público)
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
// PUT /api/servicios/:id (editar) - solo dueño
// ----------------------------------------
router.put("/:id", requireAuth, requireOwner, async (req, res) => {
  try {
    const update = { ...req.body };

    delete update.usuarioEmail;
    delete update.creadoEn;

    Object.assign(req.servicio, update);

    const servicioGuardado = await req.servicio.save();

    res.json({ ok: true, servicio: servicioGuardado });
  } catch (err) {
    console.error("❌ Error PUT /servicios/:id", err);
    res
      .status(500)
      .json({ error: "Error al actualizar el servicio" });
  }
});

// ----------------------------------------
// DELETE /api/servicios/:id - solo dueño
// ----------------------------------------
router.delete("/:id", requireAuth, requireOwner, async (req, res) => {
  try {
    await req.servicio.deleteOne();
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
//  - Sin email  → búsqueda pública (solo ACTIVO)
//  - Con email → “Mis anuncios” (cualquiera estado)
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
      estado,
      destacado,
      destacadoHome,
      page = 1,
      limit = 12,
    } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNumRaw = parseInt(limit, 10) || 12;
    const limitNum = Math.min(Math.max(limitNumRaw, 1), 50);
    const skip = (pageNum - 1) * limitNum;

    const query = {};

    // MIS ANUNCIOS (panel usuario)
    if (email) {
      if (!req.user || !req.user.email) {
        return res
          .status(401)
          .json({
            error:
              "No autorizado. Debes iniciar sesión para ver tus anuncios.",
          });
      }
      query.usuarioEmail = req.user.email;
    } else {
      // BÚSQUEDA PÚBLICA:
      // SOLO mostramos:
      //  - estado === "activo"
      //  - o servicios antiguos sin campo estado
      query.$or = [
        { estado: { $exists: false } },
        { estado: "activo" },
      ];
    }

    if (categoria) query.categoria = categoria;
    if (pueblo) query.pueblo = pueblo;
    if (provincia) query.provincia = provincia;
    if (comunidad) query.comunidad = comunidad;

    if (estado) {
      query.estado = estado;
    }

    if (typeof destacado !== "undefined") {
      if (destacado === "true") query.destacado = true;
      if (destacado === "false") query.destacado = { $ne: true };
    }

    if (typeof destacadoHome !== "undefined") {
      if (destacadoHome === "true") query.destacadoHome = true;
      if (destacadoHome === "false") query.destacadoHome = { $ne: true };
    }

    if (texto) {
      const regex = new RegExp(texto, "i");
      // combinamos con el $or anterior (si existía)
      const prevOr = query.$or || [];
      query.$or = prevOr.concat([
        { nombre: regex },
        { oficio: regex },
        { descripcion: regex },
        { pueblo: regex },
        { provincia: regex },
        { comunidad: regex },
      ]);
    }

    const [data, totalItems] = await Promise.all([
      Servicio.find(query)
        .skip(skip)
        .limit(limitNum)
        // Destacados primero, luego más nuevos
        .sort({ destacado: -1, destacadoHasta: -1, creadoEn: -1 }),
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
