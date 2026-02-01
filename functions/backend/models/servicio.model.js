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

    // Geo (OPCIONAL)
    // - Si NO hay coords, NO guardamos location.
    // - Si hay coords, deben ser [lng, lat] válidos.
    location: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number], // [lng, lat]
        validate: {
          validator: function (v) {
            if (v === undefined || v === null) return true; // opcional
            return (
              Array.isArray(v) &&
              v.length === 2 &&
              v.every((n) => typeof n === "number" && Number.isFinite(n))
            );
          },
          message: "location.coordinates debe ser [lng, lat] numéricos",
        },
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

// 🔒 Limpieza defensiva: si llega location incompleto, lo eliminamos
// (esto evita el bug viejo: { type: "Point" } sin coordinates)
ServicioSchema.pre("validate", function (next) {
  if (!this.location) return next();

  const t = this.location.type;
  const c = this.location.coordinates;

  const ok =
    t === "Point" &&
    Array.isArray(c) &&
    c.length === 2 &&
    c.every((n) => typeof n === "number" && Number.isFinite(n));

  if (!ok) {
    this.location = undefined;
  }

  next();
});

// Index geo (solo indexa docs que tengan coordinates)
ServicioSchema.index(
  { location: "2dsphere" },
  { partialFilterExpression: { "location.coordinates": { $exists: true } } }
);

module.exports = mongoose.model("Servicio", ServicioSchema);
