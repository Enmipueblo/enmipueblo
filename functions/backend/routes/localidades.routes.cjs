const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

function loadJSON(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    console.warn(
      `⚠️ No se pudo leer ${path.basename(filePath)}:`,
      e && e.message ? e.message : String(e)
    );
    return [];
  }
}

function ensureArray(v) {
  if (Array.isArray(v)) return v;
  if (v && Array.isArray(v.data)) return v.data;
  return [];
}

const DATA_DIR = path.join(__dirname, "..", "data");
const LOCALIDADES = ensureArray(loadJSON(path.join(DATA_DIR, "localidades.json")));
const PROVINCIAS = ensureArray(loadJSON(path.join(DATA_DIR, "provincias.json")));
const CCAA = ensureArray(loadJSON(path.join(DATA_DIR, "ccaa.json")));
const ALIAS = ensureArray(loadJSON(path.join(DATA_DIR, "localidades_alias.json")));

function norm(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function makeOut(loc) {
  const nombre =
    loc.nombre || loc.municipio || loc.pueblo || loc.localidad || loc.name || "";
  const provincia =
    loc.provincia || loc.province || loc.prov || loc.provincia_nombre || "";
  const ccaa = loc.ccaa || loc.comunidad || loc.comunidad_autonoma || loc.region || "";

  return {
    id: loc.id || loc.municipio_id || loc.codigo || `${nombre}-${provincia}-${ccaa}`,
    nombre: String(nombre || ""),
    provincia: String(provincia || ""),
    ccaa: String(ccaa || ""),
    lat: loc.lat ? Number(loc.lat) : undefined,
    lng: loc.lng ? Number(loc.lng) : undefined,
  };
}

async function nominatimSearch(q, limit = 8) {
  // Fallback para “localidades” que no estén en tu dataset
  const url =
    "https://nominatim.openstreetmap.org/search?" +
    new URLSearchParams({
      q,
      format: "json",
      countrycodes: "es",
      addressdetails: "1",
      limit: String(limit),
    }).toString();

  const res = await fetch(url, {
    headers: {
      "Accept-Language": "es",
      "User-Agent": "EnMiPueblo/1.0 (localidades search)",
    },
  });

  if (!res.ok) return [];
  const arr = await res.json();

  return (arr || []).map((it) => {
    const addr = it.address || {};
    const nombre =
      addr.village ||
      addr.town ||
      addr.city ||
      addr.municipality ||
      addr.hamlet ||
      it.display_name?.split(",")?.[0] ||
      "";
    const provincia = addr.province || addr.state || "";
    const ccaa = addr.state || "";

    return {
      id: `osm:${it.osm_type || ""}:${it.osm_id || it.place_id || ""}`,
      nombre: String(nombre || ""),
      provincia: String(provincia || ""),
      ccaa: String(ccaa || ""),
      lat: Number(it.lat),
      lng: Number(it.lon),
    };
  });
}

// GET /api/localidades/buscar?q=capell
router.get("/buscar", async (req, res) => {
  try {
    const qRaw = String(req.query.q || "").trim();
    const limitRaw = parseInt(String(req.query.limit || "10"), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 25) : 10;

    if (!qRaw || qRaw.length < 2) {
      return res.json({ ok: true, data: [] });
    }

    const qn = norm(qRaw);

    // 1) Buscar en dataset local
    const matches = LOCALIDADES.filter((loc) => {
      const n = norm(loc.nombre || loc.municipio || loc.pueblo || loc.localidad);
      const p = norm(loc.provincia || "");
      const c = norm(loc.ccaa || loc.comunidad || "");

      return (
        n.includes(qn) ||
        p.includes(qn) ||
        c.includes(qn)
      );
    })
      .slice(0, limit)
      .map(makeOut);

    // 2) Alias (ej: “Barna” => Barcelona)
    const aliasHits = ALIAS.filter((a) => norm(a.alias).includes(qn)).slice(0, 6);

    const aliasResults = aliasHits
      .map((a) => {
        const found = LOCALIDADES.find(
          (l) => norm(l.nombre) === norm(a.nombre)
        );
        return found ? makeOut(found) : makeOut({ nombre: a.nombre });
      })
      .filter(Boolean);

    // Merge sin duplicados
    const map = new Map();
    [...aliasResults, ...matches].forEach((l) => {
      map.set(l.id, l);
    });

    let out = Array.from(map.values()).slice(0, limit);

    // 3) Fallback Nominatim si no encontramos nada
    if (out.length === 0) {
      out = await nominatimSearch(qRaw, Math.min(limit, 10));
    }

    return res.json({ ok: true, data: out });
  } catch (err) {
    console.error("❌ /api/localidades/buscar", err);
    return res.status(500).json({ error: "Error buscando localidades" });
  }
});

router.get("/provincias", (req, res) => {
  res.json({ ok: true, data: PROVINCIAS });
});

router.get("/ccaa", (req, res) => {
  res.json({ ok: true, data: CCAA });
});

module.exports = router;
