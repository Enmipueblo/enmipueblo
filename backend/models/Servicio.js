// backend/models/Servicio.js
import mongoose from 'mongoose';

const servicioSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  oficio: { type: String, required: true },
  descripcion: { type: String, required: true },
  contacto: { type: String, required: true },
  whatsapp: { type: String, default: '' },
  pueblo: { type: String, required: true },
  categoria: { type: String, default: 'General' }, // Un valor por defecto si no se proporciona
  imagenes: { type: [String], default: [] }, // Array de Strings para las URLs de las imágenes
  videoUrl: { type: String, default: '' }, // String para la URL del video
  creado: { type: Date, default: Date.now },
  usuarioEmail: {
    type: String,
    required: true, // opcional, pero recomendado si siempre debe estar
  },
});

const Servicio = mongoose.model('Servicio', servicioSchema);

export default Servicio;
