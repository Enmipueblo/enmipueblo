import mongoose from 'mongoose';

const FavoritoSchema = new mongoose.Schema({
  usuarioEmail: { type: String, required: true },
  servicioId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Servicio',
    required: true,
  },
  creado: { type: Date, default: Date.now },
});

FavoritoSchema.index({ usuarioEmail: 1, servicioId: 1 }, { unique: true }); // Evita duplicados

const Favorito = mongoose.model('Favorito', FavoritoSchema);
export default Favorito;
