// functions/backend/routes/favorito.routes.cjs
const express = require("express");
const Favorito = require("../models/favorito.model.js");

const router = express.Router();

// GET /api/favorito?email=
router.get("/", async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) return res.json({ data: [] });

    const favs = await Favorito.find({ usuarioEmail: email }).populate("servicio");

    res.json({
      ok: true,
      total: favs.length,
      data: favs,
    });
  } catch (err) {
    console.error("❌ GET /favorito", err);
    res.status(500).json({ error: "Error obteniendo favoritos" });
  }
});

// POST /api/favorito
router.post("/", async (req, res) => {
  try {
    const { usuarioEmail, servicioId } = req.body;

    if (!usuarioEmail || !servicioId) {
      return res
        .status(400)
        .json({ error: "Falta usuarioEmail o servicioId" });
    }

    const existe = await Favorito.findOne({
      usuarioEmail,
      servicio: servicioId,
    });

    if (existe) {
      return res.json({
        ok: true,
        mensaje: "Ya estaba guardado",
        id: existe._id,
      });
    }

    const nuevo = await Favorito.create({
      usuarioEmail,
      servicio: servicioId,
    });

    res.json({
      ok: true,
      mensaje: "Favorito agregado",
      id: nuevo._id,
    });
  } catch (err) {
    console.error("❌ POST /favorito", err);
    res.status(500).json({ error: "No se pudo guardar favorito" });
  }
});

// DELETE /api/favorito/:id
router.delete("/:id", async (req, res) => {
  try {
    await Favorito.findByIdAndDelete(req.params.id);
    res.json({ ok: true, mensaje: "Favorito eliminado" });
  } catch (err) {
    console.error("❌ DELETE /favorito/:id", err);
    res.status(500).json({ error: "No se pudo borrar" });
  }
});

module.exports = router;
