// functions/backend/routes/favorito.routes.cjs
const express = require("express");
const Favorito = require("../models/favorito.model.js");

const router = express.Router();

/**
 * Middleware sencillo: exige usuario autenticado.
 * req.user lo rellena el middleware global de auth en app.cjs
 */
function requireAuth(req, res, next) {
  if (!req.user || !req.user.email) {
    return res
      .status(401)
      .json({ error: "No autorizado. Debes iniciar sesión." });
  }
  next();
}

/**
 * GET /api/favorito
 * Devuelve SOLO los favoritos del usuario logueado.
 * Ignoramos el email del query si viene.
 * Además filtramos favoritos cuyo servicio ya no existe (servicio = null).
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const email = req.user.email; // 🔒 siempre el del token

    const allFavs = await Favorito.find({
      usuarioEmail: email,
    }).populate("servicio");

    // 🔧 Filtrar los que tienen servicio nulo (por ejemplo, servicio borrado)
    const favs = allFavs.filter((f) => f.servicio);

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

/**
 * POST /api/favorito
 * Crea un favorito para el usuario logueado.
 * - Body: { servicioId }
 * - Ignoramos cualquier usuarioEmail que venga en el body.
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    const { servicioId } = req.body || {};

    if (!servicioId) {
      return res
        .status(400)
        .json({ error: "Falta servicioId" });
    }

    const email = req.user.email; // 🔒 siempre el del token

    const existe = await Favorito.findOne({
      usuarioEmail: email,
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
      usuarioEmail: email,
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

/**
 * DELETE /api/favorito
 * Borra un favorito por servicioId (más cómodo para el frontend).
 * - Body: { servicioId }
 * - El usuario se obtiene SIEMPRE del token.
 */
router.delete("/", requireAuth, async (req, res) => {
  try {
    const { servicioId } = req.body || {};

    if (!servicioId) {
      return res.status(400).json({ error: "Falta servicioId" });
    }

    const email = req.user.email;

    const fav = await Favorito.findOne({
      usuarioEmail: email,
      servicio: servicioId,
    });

    if (!fav) {
      return res.json({ ok: true, mensaje: "No estaba en favoritos" });
    }

    await fav.deleteOne();
    return res.json({ ok: true, mensaje: "Favorito eliminado" });
  } catch (err) {
    console.error("❌ DELETE /favorito (by servicioId)", err);
    return res.status(500).json({ error: "No se pudo borrar" });
  }
});

/**
 * DELETE /api/favorito/:id
 * Solo el dueño del favorito puede borrarlo.
 */
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const fav = await Favorito.findById(req.params.id);

    if (!fav) {
      return res.status(404).json({ error: "Favorito no encontrado" });
    }

    if (String(fav.usuarioEmail) !== String(req.user.email)) {
      return res
        .status(403)
        .json({ error: "No puedes borrar este favorito" });
    }

    await fav.deleteOne();

    res.json({ ok: true, mensaje: "Favorito eliminado" });
  } catch (err) {
    console.error("❌ DELETE /favorito/:id", err);
    res.status(500).json({ error: "No se pudo borrar" });
  }
});

module.exports = router;
