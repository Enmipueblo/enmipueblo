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

function extractProvinciaName(p) {
  return (
    p?.nombre ||
    p?.name ||
    p?.provincia ||
    p?.provincia_nombre ||
    p?.label ||
    ""
  );
}

const PROV_SET = new Set(
  (PROVINCIAS || [])
    .map(extractProvinciaName)
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .map(norm)
);

const COMARCA_TO_PROVINCIA = new Map([
  ["ribagorza", "Huesca"],
]);

function normalizeProvincia(rawProv) {
  const prov = String(rawProv || "").trim();
  if (!prov) return "";

  const provN = norm(prov);
  if (PROV_SET.has(provN)) return prov;

  const fixed = COMARCA_TO_PROVINCIA.get(provN);
  if (fixed) return fixed;

  return "";
}

function makeOut(loc) {
  const nombre =
    loc.nombre || loc.municipio || loc.pueblo || loc.localidad || loc.name || "";

  const provinciaRaw =
    loc.provincia || loc.province || loc.prov || loc.provincia_nombre || "";

  const ccaaRaw =
    loc.ccaa || loc.comunidad || loc.comunidad_autonoma || loc.region || "";

  const provincia = normalizeProvincia(provinciaRaw);

  return {
    id:
      loc.id ||
      loc.municipio_id ||
      loc.codigo ||
      `${String(nombre || "")}-${String(provincia || "")}-${String(ccaaRaw || "")}`,
    nombre: String(nombre || ""),
    provincia: String(provincia || ""),
    ccaa: String(ccaaRaw || ""),
    lat: loc.lat ? Number(loc.lat) : undefined,
    lng: loc.lng ? Number(loc.lng) : undefined,
  };
}

function uniqueById(arr) {
  const map = new Map();
  for (const item of arr || []) {
    if (!item?.id) continue;
    if (!map.has(item.id)) map.set(item.id, item);
  }
  return Array.from(map.values());
}

async function buscarLocalidades(qRaw, limit) {
  const qn = norm(qRaw);

  const nameMatches = LOCALIDADES.filter((loc) => {
    const n = norm(loc.nombre || loc.municipio || loc.pueblo || loc.localidad || loc.name);
    return n.includes(qn);
  })
    .slice(0, limit)
    .map(makeOut);

  let extraMatches = [];
  if (nameMatches.length < limit) {
    extraMatches = LOCALIDADES.filter((loc) => {
      const n = norm(loc.nombre || loc.municipio || loc.pueblo || loc.localidad || loc.name);
      const p = norm(loc.provincia || "");
      const c = norm(loc.ccaa || loc.comunidad || "");
      return n.includes(qn) || p.includes(qn) || c.includes(qn);
    })
      .slice(0, limit)
      .map(makeOut);
  }

  const aliasHits = ALIAS.filter((a) => norm(a.alias).includes(qn)).slice(0, 6);

  const aliasResults = aliasHits
    .map((a) => {
      const found = LOCALIDADES.find((l) => norm(l.nombre) === norm(a.nombre));
      return found ? makeOut(found) : makeOut({ nombre: a.nombre });
    })
    .filter(Boolean);

  const out = uniqueById([...aliasResults, ...nameMatches, ...extraMatches]).slice(0, limit);

  // IMPORTANTE: ya no se usa Nominatim ni geocoder externo.
  // Solo se devuelven localidades cargadas en los ficheros del proyecto.
  return out;
}

router.get("/", async (req, res) => {
  try {
    const qRaw = String(req.query.q || "").trim();
    const limitRaw = parseInt(String(req.query.limit || "10"), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 25) : 10;

    if (!qRaw || qRaw.length < 2) {
      return res.json({ ok: true, data: [] });
    }

    const out = await buscarLocalidades(qRaw, limit);
    return res.json({ ok: true, data: out });
  } catch (err) {
    console.error("❌ /api/localidades", err);
    return res.status(500).json({ error: "Error buscando localidades" });
  }
});

router.get("/buscar", async (req, res) => {
  try {
    const qRaw = String(req.query.q || "").trim();
    const limitRaw = parseInt(String(req.query.limit || "10"), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 25) : 10;

    if (!qRaw || qRaw.length < 2) {
      return res.json({ ok: true, data: [] });
    }

    const out = await buscarLocalidades(qRaw, limit);
    return res.json({ ok: true, data: out });
  } catch (err) {
    console.error("❌ /api/localidades/buscar", err);
    return res.status(500).json({ error: "Error buscando localidades" });
  }
});

router.get("/provincias", (_req, res) => {
  res.json({ ok: true, data: PROVINCIAS });
});

router.get("/ccaa", (_req, res) => {
  res.json({ ok: true, data: CCAA });
});

module.exports = router;