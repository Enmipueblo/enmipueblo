// backend/routes/system.routes.js
import { Router } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let localidadesCache = null;
let etagCache = null;

// Health check
router.get("/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Localidades endpoint
router.get("/localidades", (req, res) => {
  try {
    if (!localidadesCache) {
      const enrichedPath = path.join(
        __dirname,
        "../data/localidades_enriquecidas.json"
      );
      if (!fs.existsSync(enrichedPath)) {
        return res.status(500).json({
          mensaje:
            "Falta el archivo localidades_enriquecidas.json en /backend/data/",
        });
      }

      const raw = fs.readFileSync(enrichedPath, "utf8");
      localidadesCache = JSON.parse(raw);
      etagCache = crypto.createHash("sha1").update(raw).digest("hex");
      console.log(
        `✅ Localidades cargadas en memoria (${localidadesCache.length} registros)`
      );
    }

    res.setHeader("ETag", etagCache);
    res.setHeader("Cache-Control", "public, max-age=3600");
    if (req.headers["if-none-match"] === etagCache) return res.status(304).end();

    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit || "5000", 10), 1),
      10000
    );
    const start = (page - 1) * limit;
    const slice = localidadesCache.slice(start, start + limit);

    res.json({
      ok: true,
      total: localidadesCache.length,
      page,
      limit,
      data: slice,
    });
  } catch (error) {
    console.error("❌ Error al leer localidades:", error);
    res
      .status(500)
      .json({ mensaje: "Error al leer las localidades", error: error.message });
  }
});

export default router;
