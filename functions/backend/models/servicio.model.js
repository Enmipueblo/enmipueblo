// functions/backend/models/servicio.model.js
const mongoose = require("mongoose");

const servicioSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    categoria: { type: String, required: true, trim: true },
    oficio: { type: String, required: true, trim: true },
    descripcion: { type: String, required: true, trim: true },

    contacto: { type: String, required: true, trim: true },
    whatsapp: { type: String, trim: true },

    pueblo: { type: String, required: true, trim: true },
    provincia: { type: String, trim: true },
    comunidad: { type: String, trim: true },

    imagenes: { type: [String], default: [] },
    videoUrl: { type: String },

    usuarioEmail: { type: String, required: true, trim: true },

    // 🟢 Moderación / visibilidad
    estado: {
      type: String,
      enum: ["activo", "pausado", "baneado"],
      default: "activo",
      index: true,
    },
    destacado: {
      type: Boolean,
      default: false,
      index: true,
    },

    creadoEn: { type: Date, default: Date.now, index: true },
  },
  { collection: "servicios" }
);

module.exports =
  mongoose.models.Servicio || mongoose.model("Servicio", servicioSchema);
