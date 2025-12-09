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
// (solo autenticados, usuarioEmail viene del token)
// ----------------------------------------
router.post("/", requireAuth, async (req, res) => {
  try {
    const datos = req.body || {};

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
      // 🔒 ignoramos lo que venga en el body y usamos SIEMPRE el email del token
      usuarioEmail: req.user.email,
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
// GET /api/servicios/relacionados/:id
// Devolver otros servicios similares (públicos) para la ficha de detalle
// ----------------------------------------
router.get("/relacionados/:id", async (req, res) => {
  try {
    const base = await Servicio.findById(req.params.id);
    if (!base) {
      return res.status(404).json({ error: "Servicio base no encontrado" });
    }

    // Solo buscamos entre servicios visibles públicamente
    const visibles = { estado: "activo", revisado: true };

    const yaIncluidos = new Set();
    yaIncluidos.add(String(base._id));

    const resultados = [];

    // 1) Misma categoría en mismo pueblo
    if (base.categoria && base.pueblo) {
      const mismosPueblo = await Servicio.find({
        ...visibles,
        _id: { $ne: base._id },
        categoria: base.categoria,
        pueblo: base.pueblo,
      })
        .sort({ destacadoHasta: -1, creadoEn: -1 })
        .limit(6)
        .lean();

      for (const s of mismosPueblo) {
        const idStr = String(s._id);
        if (!yaIncluidos.has(idStr)) {
          yaIncluidos.add(idStr);
          resultados.push(s);
        }
      }
    }

    // 2) Misma categoría en misma provincia (si hace falta completar huecos)
    if (resultados.length < 6 && base.categoria && base.provincia) {
      const mismosProvincia = await Servicio.find({
        ...visibles,
        _id: { $ne: base._id },
        categoria: base.categoria,
        provincia: base.provincia,
      })
        .sort({ destacadoHasta: -1, creadoEn: -1 })
        .limit(6)
        .lean();

      for (const s of mismosProvincia) {
        const idStr = String(s._id);
        if (!yaIncluidos.has(idStr) && resultados.length < 6) {
          yaIncluidos.add(idStr);
          resultados.push(s);
        }
      }
    }

    // 3) Mismo pueblo (otras categorías) si aún hay hueco
    if (resultados.length < 6 && base.pueblo) {
      const otrosPueblo = await Servicio.find({
        ...visibles,
        _id: { $ne: base._id },
        pueblo: base.pueblo,
      })
        .sort({ destacadoHasta: -1, creadoEn: -1 })
        .limit(6)
        .lean();

      for (const s of otrosPueblo) {
        const idStr = String(s._id);
        if (!yaIncluidos.has(idStr) && resultados.length < 6) {
          yaIncluidos.add(idStr);
          resultados.push(s);
        }
      }
    }

    res.json({
      ok: true,
      total: resultados.length,
      data: resultados,
    });
  } catch (err) {
    console.error("❌ Error GET /servicios/relacionados/:id", err);
    res
      .status(500)
      .json({ error: "Error al obtener servicios relacionados" });
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
// PUT /api/servicios/:id (editar)
// Solo dueño puede editar
// ----------------------------------------
router.put("/:id", requireAuth, requireOwner, async (req, res) => {
  try {
    const update = { ...req.body };

    // Nunca dejar que cambie el dueño desde el body:
    delete update.usuarioEmail;

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
// DELETE /api/servicios/:id
// Solo dueño puede borrar (DELETE real)
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
//  - Sin email  → búsqueda general (pública)
//  - Con email → “Mis anuncios” (requiere auth y se fuerza al email logueado)
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
      estado,
      soloRevisados,
    } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNumRaw = parseInt(limit, 10) || 12;
    const limitNum = Math.min(Math.max(limitNumRaw, 1), 50); // 🔒 Anti abuso
    const skip = (pageNum - 1) * limitNum;

    const query = {};

    // Si viene email → interpretamos que es "mis anuncios"
    // y solo devolvemos si el usuario está autenticado y es el mismo.
    if (email) {
      if (!req.user || !req.user.email) {
        return res.status(401).json({
          error:
            "No autorizado. Debes iniciar sesión para ver tus anuncios.",
        });
      }

      // 🔒 ignoramos el email del query y usamos SIEMPRE el del token
      query.usuarioEmail = req.user.email;
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

    const isAdminRequest = !!(req.user && req.user.isAdmin);

    // 🔒 Público general: solo servicios activos + revisados
    if (!email && !isAdminRequest) {
      query.estado = "activo";
      query.revisado = true;
    }

    // Los admins pueden filtrar por estado y revisado
    if (estado && isAdminRequest) {
      query.estado = estado;
    }

    if (soloRevisados === "true" && isAdminRequest) {
      query.revisado = true;
    }

    const [data, totalItems] = await Promise.all([
      Servicio.find(query)
        .skip(skip)
        .limit(limitNum)
        .sort({
          // 👇 primero destacados vigentes
          destacadoHasta: -1,
          creadoEn: -1,
        }),
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
