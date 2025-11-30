// functions/backend/models/favorito.model.js
const mongoose = require("mongoose");

const favoritoSchema = new mongoose.Schema(
  {
    usuarioEmail: {
      type: String,
      required: true,
      trim: true,
    },
    servicio: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Servicio",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

favoritoSchema.index({ usuarioEmail: 1, servicio: 1 }, { unique: true });

module.exports =
  mongoose.models.Favorito || mongoose.model("Favorito", favoritoSchema);
