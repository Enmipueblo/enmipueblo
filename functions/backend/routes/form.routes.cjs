// functions/backend/routes/form.routes.cjs
const express = require("express");
const multer = require("multer");
const Servicio = require("../models/servicio.model.js");

const router = express.Router();

/* ---------------------------------------------
   🔧 CONFIGURACIÓN DE MULTER (archivos en memoria)
--------------------------------------------- */
const storage = multer.memoryStorage();
const upload = multer({ storage });

/* ---------------------------------------------
   🟢 CREAR SERVICIO
   POST /api/form
   Recibe: multipart/form-data
--------------------------------------------- */
router.post(
  "/",
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
        !datos.pueblo ||
        !datos.usuarioEmail
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
            return val.nombre || val || "";
          }
        } catch (_) {}
        return datos.provincia || "";
      })();

      const comunidad = (() => {
        try {
          if (typeof datos.comunidad === "string") {
            const val = JSON.parse(datos.comunidad);
            return val.nombre || val || "";
          }
        } catch (_) {}
        return datos.comunidad || "";
      })();

      // Manejar imágenes
      let imagenes = [];
      if (req.files?.imagenes) {
        imagenes = req.files.imagenes.map((f) =>
          `data:${f.mimetype};base64,${f.buffer.toString("base64")}`
        );
      }

      // Manejar video (opcional)
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
        usuarioEmail: datos.usuarioEmail,
      });

      await nuevo.save();

      res.json({
        mensaje: "Servicio creado correctamente",
        servicio: nuevo,
      });
    } catch (err) {
      console.error("❌ Error en POST /form:", err);
      res.status(500).json({ mensaje: "Error en el servidor" });
    }
  }
);

module.exports = router;
