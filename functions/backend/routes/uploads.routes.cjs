const express = require("express");
const { authRequired } = require("../auth.cjs");
const { buildKey, signPutObject } = require("../r2.cjs");

const router = express.Router();

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

router.post("/sign", authRequired, async (req, res) => {
  try {
    const { filename, contentType, folder } = req.body || {};
    const ct = String(contentType || "").trim();
    const fn = String(filename || "").trim();
    const f = String(folder || "").trim();

    if (!fn) return res.status(400).json({ error: "Falta filename" });
    if (!ct) return res.status(400).json({ error: "Falta contentType" });

    // Por ahora SOLO imágenes (para mantenerte en gratis)
    if (!ct.startsWith("image/") || !ALLOWED_IMAGE_TYPES.has(ct)) {
      return res.status(400).json({ error: "Solo imágenes (jpeg/png/webp) por ahora" });
    }

    // Solo permitimos esta carpeta (seguridad)
    if (f !== "service_images/fotos") {
      return res.status(400).json({ error: "Folder no permitido" });
    }

    const key = buildKey({
      folder: f,
      uid: req.user.uid,
      filename: fn,
    });

    const signed = await signPutObject({ key, contentType: ct });

    return res.json({
      ok: true,
      uploadUrl: signed.uploadUrl,
      key: signed.key,
      publicUrl: signed.publicUrl,
      expiresIn: 60,
    });
  } catch (err) {
    console.error("❌ Error firmando upload R2:", err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
});

module.exports = router;
