// functions/backend/routes/sitemap.routes.cjs
const express = require("express");
const Servicio = require("../models/servicio.model.js");

const router = express.Router();

// Dominio CANÓNICO donde viven las páginas (frontend).
// Ideal: setear en producción SITE_URL=https://enmipueblo.com
function getSiteUrl(req) {
  const env = (process.env.SITE_URL || "").trim().replace(/\/$/, "");
  if (env) return env;

  // Fallback razonable (cámbialo si tu dominio final es otro)
  return "https://enmipueblo.com";
}

function toLastmod(s) {
  const d =
    (s && (s.updatedAt || s.actualizadoEn || s.creadoEn || s.createdAt)) || null;
  if (!d) return null;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function escapeXml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

// Sitemap SOLO de servicios (para no pisar tu sitemap estático del frontend)
router.get("/sitemap-servicios.xml", async (req, res) => {
  try {
    const SITE = getSiteUrl(req);

    // Mismo criterio “público” que tu GET /api/servicios:
    // activos o servicios antiguos sin campo estado
    const query = {
      $or: [{ estado: { $exists: false } }, { estado: "activo" }],
    };

    const servicios = await Servicio.find(query)
      .select({ _id: 1, updatedAt: 1, createdAt: 1, creadoEn: 1 })
      .sort({ creadoEn: -1, _id: -1 })
      .lean();

    const urls = servicios.map((s) => {
      // URL actual que usa tu sitio (por ahora query param)
      const loc = `${SITE}/servicio?id=${encodeURIComponent(String(s._id))}`;
      const lastmod = toLastmod(s);

      return { loc, lastmod };
    });

    let xml = "";
    xml += `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    for (const u of urls) {
      xml += `  <url>\n`;
      xml += `    <loc>${escapeXml(u.loc)}</loc>\n`;
      if (u.lastmod) xml += `    <lastmod>${escapeXml(u.lastmod)}</lastmod>\n`;
      xml += `  </url>\n`;
    }

    xml += `</urlset>\n`;

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    // Cache friendly para Google + Cloud
    res.setHeader(
      "Cache-Control",
      "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400"
    );

    return res.status(200).send(xml);
  } catch (err) {
    console.error("❌ Error generando sitemap-servicios.xml:", err);
    return res.status(500).send("Error generating sitemap");
  }
});

module.exports = router;
