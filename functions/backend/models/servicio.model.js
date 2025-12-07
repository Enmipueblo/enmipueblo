// functions/backend/models/servicio.model.js
const mongoose = require("mongoose");

const servicioSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true },
    categoria: { type: String, required: true },
    oficio: { type: String, required: true },
    descripcion: { type: String, required: true },
    contacto: { type: String, required: true },
    whatsapp: { type: String },
    pueblo: { type: String, required: true },
    provincia: { type: String },
    comunidad: { type: String },
    imagenes: { type: [String], default: [] },
    videoUrl: { type: String },

    // Usuario dueño del anuncio
    usuarioEmail: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    // Moderación / visibilidad
    estado: {
      type: String,
      enum: ["activo", "pendiente", "pausado", "eliminado"],
      default: "activo",
      index: true,
    },

    // Destacados (simple: boolean + fecha opcional)
    destacado: {
      type: Boolean,
      default: false,
      index: true,
    },
    destacadoHasta: {
      type: Date,
      default: null,
    },

    // Revisión manual del equipo
    revisado: {
      type: Boolean,
      default: false,
    },

    creadoEn: {
      type: Date,
      default: Date.now,
    },
  },
  { collection: "servicios" }
);

module.exports =
  mongoose.models.Servicio || mongoose.model("Servicio", servicioSchema);
