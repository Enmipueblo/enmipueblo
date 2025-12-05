// functions/backend/models/favorito.model.js
const mongoose = require("mongoose");

const favoritoSchema = new mongoose.Schema(
  {
    // Dueño del favorito
    usuarioEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 160,
      index: true, // 🔍 para listar favoritos del usuario rápido
    },

    // Referencia al servicio guardado
    servicio: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Servicio",
      required: true,
    },
  },
  {
    timestamps: true, // createdAt / updatedAt
    collection: "favoritos",
  }
);

// Un usuario no puede guardar el mismo servicio dos veces
favoritoSchema.index({ usuarioEmail: 1, servicio: 1 }, { unique: true });

module.exports =
  mongoose.models.Favorito ||
  mongoose.model("Favorito", favoritoSchema);
