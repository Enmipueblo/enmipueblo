// functions/backend/models/servicio.model.js
const mongoose = require("mongoose");

const servicioSchema = new mongoose.Schema(
  {
    // Nombre "comercial" del anuncio
    nombre: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80, // suficiente para títulos tipo "Electricista urgente 24h en Graus"
    },

    // Categoría general (Albañilería, Carpintería, etc.)
    categoria: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60,
    },

    // Oficio / título corto
    oficio: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    // Descripción larga
    descripcion: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000, // más que suficiente y evita biblias
    },

    // Teléfono, email u otro dato de contacto
    contacto: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    // WhatsApp opcional (no forzamos formato exacto, solo limitamos longitud)
    whatsapp: {
      type: String,
      trim: true,
      maxlength: 30,
    },

    // Localidad
    pueblo: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    provincia: {
      type: String,
      trim: true,
      maxlength: 120,
    },

    comunidad: {
      type: String,
      trim: true,
      maxlength: 120,
    },

    // URLs de imágenes (Firebase Storage)
    imagenes: {
      type: [String],
      default: [],
      validate: {
        validator(arr) {
          // por si intentan meter cientos de URLs a mano
          return Array.isArray(arr) && arr.length <= 6;
        },
        message: "No puedes guardar más de 6 imágenes por servicio.",
      },
    },

    // URL del vídeo (Firebase Storage)
    videoUrl: {
      type: String,
      trim: true,
      maxlength: 1000,
    },

    // Dueño del anuncio
    usuarioEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 160,
      index: true,
    },

    // Fecha de creación
    creadoEn: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    collection: "servicios",
  }
);

// Índice para "mis anuncios"
servicioSchema.index({ usuarioEmail: 1, creadoEn: -1 });

// Índice básico para búsquedas por zona
servicioSchema.index({
  pueblo: 1,
  provincia: 1,
  comunidad: 1,
});

module.exports =
  mongoose.models.Servicio ||
  mongoose.model("Servicio", servicioSchema);
