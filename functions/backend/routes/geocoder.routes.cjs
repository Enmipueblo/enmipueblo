const express = require("express");
const router = express.Router();

/**
 * GET /api/geocoder?q=Graus%2C%20Huesca%2C%20Arag%C3%B3n%2C%20Espa%C3%B1a
 * Resuelve texto -> coordenadas (lat/lon) usando Nominatim (OpenStreetMap).
 * Sin API key. Nominatim requiere User-Agent identificable.
 */
router.get("/", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ ok: false, error: "q requerido" });

    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("q", q);

    const r = await fetch(url.toString(), {
      headers: {
        "User-Agent": "EnMiPueblo/1.0 (contact: soporte@enmipueblo.com)",
        "Accept": "application/json",
      },
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      return res.status(502).json({
        ok: false,
        error: "geocoder_upstream_error",
        status: r.status,
        body: txt.slice(0, 300),
      });
    }

    const arr = await r.json().catch(() => null);
    if (!Array.isArray(arr) || arr.length === 0) {
      return res.json({ ok: true, data: null });
    }

    const it = arr[0] || {};
    const lat = it.lat != null ? Number(it.lat) : null;
    const lon = it.lon != null ? Number(it.lon) : null;

    return res.json({
      ok: true,
      data: {
        lat,
        lon,
        display_name: it.display_name || null,
        address: it.address || null,
      },
    });
  } catch (e) {
    console.error("❌ /api/geocoder error:", e);
    return res.status(500).json({ ok: false, error: "geocoder_error" });
  }
});

module.exports = router;
