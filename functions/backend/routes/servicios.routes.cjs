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
// (solo autenticados y amarramos usuarioEmail al token)
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
      // 🔒 siempre el email del token, nunca del body
      usuarioEmail: req.user.email,

      // 🟢 Campos de moderación por defecto (para superadmin)
      estado: "activo",      // el anuncio sale directamente publicado
      destacado: false,      // no destacado por defecto
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
// (el detalle sigue siendo público, aunque luego podemos
//  decidir si queremos ocultar baneados/pausados aquí también)
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
// 👉 El usuario normal NO puede tocar estado/destacado
// ----------------------------------------
router.put("/:id", requireAuth, requireOwner, async (req, res) => {
  try {
    const update = { ...req.body };

    // Nunca dejar que cambie el dueño ni campos de moderación:
    delete update.usuarioEmail;
    delete update.estado;
    delete update.destacado;

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
// Solo dueño puede borrar
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
//                muestra SOLO activos (o sin campo estado, por compatibilidad)
//                ordenando destacados primero.
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
    } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNumRaw = parseInt(limit, 10) || 12;
    const limitNum = Math.min(Math.max(limitNumRaw, 1), 50); // 🔒 Anti abuso
    const skip = (pageNum - 1) * limitNum;

    const query = {};

    const isMisAnuncios = Boolean(email);

    // Si viene email → interpretamos que es "mis anuncios"
    // y solo devolvemos si el usuario está autenticado y es el mismo.
    if (isMisAnuncios) {
      if (!req.user || !req.user.email) {
        return res.status(401).json({
          error:
            "No autorizado. Debes iniciar sesión para ver tus anuncios.",
        });
      }

      // 🔒 ignoramos el email del query y usamos SIEMPRE el del token
      query.usuarioEmail = req.user.email;
      // OJO: aquí NO filtramos por estado; el usuario ve todos los suyos.
    } else {
      // BÚSQUEDA PÚBLICA:
      // Mostrar solo activos, pero manteniendo compatibilidad con docs antiguos
      // que no tienen `estado` (los tratamos como activos).
      query.$or = [
        { estado: "activo" },
        { estado: { $exists: false } },
      ];
    }

    if (categoria) query.categoria = categoria;
    if (pueblo) query.pueblo = pueblo;
    if (provincia) query.provincia = provincia;
    if (comunidad) query.comunidad = comunidad;

    if (texto) {
      const regex = new RegExp(texto, "i");
      // si ya teníamos un $or por estado, lo combinamos con $and
      const textOr = [
        { nombre: regex },
        { oficio: regex },
        { descripcion: regex },
        { pueblo: regex },
        { provincia: regex },
        { comunidad: regex },
      ];

      if (query.$or) {
        // ya había un $or de estado → combinamos todo en $and
        const estadoOr = query.$or;
        delete query.$or;
        query.$and = [
          { $or: estadoOr },
          { $or: textOr },
        ];
      } else {
        query.$or = textOr;
      }
    }

    // Orden:
    // - En público: destacados primero, luego por fecha de creación
    // - En "mis anuncios": solo por fecha
    const sort = isMisAnuncios
      ? { creadoEn: -1 }
      : { destacado: -1, creadoEn: -1 };

    const [data, totalItems] = await Promise.all([
      Servicio.find(query)
        .skip(skip)
        .limit(limitNum)
        .sort(sort),
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
