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
    usuarioEmail: { type: String, required: true },
    creadoEn: { type: Date, default: Date.now },
  },
  { collection: "servicios" }
);

module.exports =
  mongoose.models.Servicio || mongoose.model("Servicio", servicioSchema);
