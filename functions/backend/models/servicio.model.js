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
    usuarioEmail: { type: String, required: true },

    estado: {
      type: String,
      enum: ["pendiente", "activo", "pausado", "eliminado"],
      default: "activo",
    },
    revisado: { type: Boolean, default: false },
    destacado: { type: Boolean, default: false },
    destacadoHasta: { type: Date },
    destacadoHome: { type: Boolean, default: false },

    creadoEn: { type: Date, default: Date.now },
  },
  { collection: "servicios" }
);

// Índices para acelerar listados/búsquedas/filtros
servicioSchema.index({ estado: 1, creadoEn: -1 });
servicioSchema.index({ destacadoHome: 1, estado: 1, creadoEn: -1 });
servicioSchema.index({ destacado: 1, destacadoHasta: 1 });
servicioSchema.index({ pueblo: 1, estado: 1, creadoEn: -1 });
servicioSchema.index({ provincia: 1, estado: 1, creadoEn: -1 });
servicioSchema.index({ comunidad: 1, estado: 1, creadoEn: -1 });
servicioSchema.index({ categoria: 1, estado: 1, creadoEn: -1 });
servicioSchema.index({ usuarioEmail: 1, creadoEn: -1 });

module.exports =
  mongoose.models.Servicio || mongoose.model("Servicio", servicioSchema);
