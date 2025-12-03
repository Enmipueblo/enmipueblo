// functions/backend/routes/form.routes.cjs
const express = require("express");
const multer = require("multer");
const Servicio = require("../models/servicio.model.js");

const router = express.Router();

/* ---------------------------------------------
   🔧 CONFIGURACIÓN DE MULTER (archivos en memoria)
   - Limitamos tamaño total y tipos de archivo
--------------------------------------------- */
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // ⛔ máx. 10MB por archivo
    files: 9, // 8 imágenes + 1 vídeo como mucho
  },
  fileFilter(req, file, cb) {
    const field = file.fieldname;

    const isImage =
      field === "imagenes" && file.mimetype.startsWith("image/");
    const isVideo =
      field === "video" &&
      /^video\/(mp4|webm|ogg|quicktime)$/i.test(file.mimetype);

    if (!isImage && !isVideo) {
      // Tipo no permitido
      return cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", field));
    }

    cb(null, true);
  },
});

/**
 * Middleware sencillo: exige que haya usuario autenticado
 * (req.user viene del middleware global en app.cjs)
 */
function requireAuth(req, res, next) {
  if (!req.user || !req.user.email) {
    return res
      .status(401)
      .json({ error: "No autorizado. Debes iniciar sesión." });
  }
  next();
}

/* ---------------------------------------------
   🟢 CREAR SERVICIO
   POST /api/form
   Recibe: multipart/form-data
   Solo autenticados (evita que cualquiera te suba fotos/base64)
--------------------------------------------- */
router.post(
  "/",
  requireAuth,
  upload.fields([
    { name: "imagenes", maxCount: 8 },
    { name: "video", maxCount: 1 },
  ]),
  async (req, res) => {
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

      // Normalizar provincia / comunidad (si vienen como JSON)
      const provincia = (() => {
        try {
          if (typeof datos.provincia === "string") {
            const val = JSON.parse(datos.provincia);
            return val?.nombre || val || "";
          }
        } catch (_) {}
        return datos.provincia || "";
      })();

      const comunidad = (() => {
        try {
          if (typeof datos.comunidad === "string") {
            const val = JSON.parse(datos.comunidad);
            return val?.nombre || val || "";
          }
        } catch (_) {}
        return datos.comunidad || "";
      })();

      // Manejar imágenes (seguimos en base64 por compatibilidad)
      let imagenes = [];
      if (req.files?.imagenes) {
        imagenes = req.files.imagenes.map((f) =>
          `data:${f.mimetype};base64,${f.buffer.toString("base64")}`
        );
      }

      // Manejar video (opcional, también base64 por ahora)
      let videoUrl = "";
      if (req.files?.video?.[0]) {
        const file = req.files.video[0];
        videoUrl = `data:${file.mimetype};base64,${file.buffer.toString(
          "base64"
        )}`;
      }

      const nuevo = new Servicio({
        nombre: datos.nombre,
        categoria: datos.categoria,
        oficio: datos.oficio,
        descripcion: datos.descripcion,
        contacto: datos.contacto,
        whatsapp: datos.whatsapp || "",
        pueblo: datos.pueblo,
        provincia,
        comunidad,
        imagenes,
        videoUrl,
        // 🔒 siempre el email del usuario autenticado
        usuarioEmail: req.user.email,
      });

      await nuevo.save();

      res.json({
        mensaje: "Servicio creado correctamente",
        servicio: nuevo,
      });
    } catch (err) {
      console.error("❌ Error en POST /form:", err);

      // Si el error viene de Multer (limit tamaño / tipo / nº archivos)
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res
            .status(400)
            .json({ mensaje: "Archivo demasiado grande (máx. 10MB por archivo)." });
        }
        if (err.code === "LIMIT_UNEXPECTED_FILE") {
          return res
            .status(400)
            .json({ mensaje: "Tipo de archivo no permitido." });
        }
      }

      res.status(500).json({ mensaje: "Error en el servidor" });
    }
  }
);

module.exports = router;
