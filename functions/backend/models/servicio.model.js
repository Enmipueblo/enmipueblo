const mongoose = require("mongoose");

const ServicioSchema = new mongoose.Schema(
  {
    // Dueño
    usuarioUid: { type: String, index: true },
    usuarioEmail: { type: String, index: true },

    // Datos del servicio
    profesionalNombre: { type: String, default: "" },
    nombre: { type: String, default: "" },
    categoria: { type: String, default: "" },
    oficio: { type: String, default: "" },
    descripcion: { type: String, default: "" },

    contacto: { type: String, default: "" },
    whatsapp: { type: String, default: "" },

    pueblo: { type: String, default: "" },
    provincia: { type: String, default: "" },
    comunidad: { type: String, default: "" },

    imagenes: { type: [String], default: [] },
    videoUrl: { type: String, default: "" },

    // Geo
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [lng, lat]
        default: undefined,
      },
    },

    // Moderación
    estado: {
      type: String,
      enum: ["pendiente", "activo", "pausado", "eliminado"],
      default: "pendiente",
      index: true,
    },
    revisado: { type: Boolean, default: false, index: true },

    // Premium / destacados
    destacado: { type: Boolean, default: false, index: true },
    destacadoHome: { type: Boolean, default: false, index: true },
    destacadoHasta: { type: Date, default: null, index: true },
  },
  {
    timestamps: { createdAt: "creadoEn", updatedAt: "actualizadoEn" },
  }
);

// Index geo
ServicioSchema.index({ location: "2dsphere" });

module.exports = mongoose.model("Servicio", ServicioSchema);
