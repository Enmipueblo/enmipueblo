"use strict";

const express = require("express");
const router = express.Router();

// Geocoding simple (sin API keys): usa Nominatim (OpenStreetMap).
// Importante: Nominatim requiere User-Agent identificable.
async function geocodeOnce(q) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", q);

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": "EnMiPueblo/1.0 (contacto: serviciosenmipueblo@gmail.com)",
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`geocoder_upstream_${res.status}`);
    err.status = 502;
    err.details = text?.slice?.(0, 2000) || "";
    throw err;
  }

  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;

  const hit = data[0];
  const lat = Number(hit.lat);
  const lon = Number(hit.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  return {
    lat,
    // ✅ compat: muchos sitios usan lng (no lon)
    lng: lon,
    // ✅ mantenemos lon por si algo viejo lo usa
    lon,
    display_name: hit.display_name || q,
  };
}

router.get("/", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.status(400).json({ ok: false, error: "missing_q" });

  try {
    const hit = await geocodeOnce(q);
    if (!hit) return res.status(404).json({ ok: false, error: "not_found" });
    return res.json({ ok: true, data: hit });
  } catch (e) {
    const status = Number(e?.status) || 500;
    return res.status(status).json({
      ok: false,
      error: e?.message || "geocoder_error",
      details: e?.details || undefined,
    });
  }
});

module.exports = router;