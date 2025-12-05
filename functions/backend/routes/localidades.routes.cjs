// functions/backend/routes/localidades.routes.cjs
const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

// =====================================================
// 🔧 Config: rutas y límites para evitar abusos
// =====================================================
const dataDir = path.join(__dirname, "..", "data");

// límites básicos para el autocomplete
const MIN_QUERY_LEN = 2;
const MAX_QUERY_LEN = 50;
const MAX_RESULTS = 30;

// =====================================================
// 🔄 Cargar JSONs una sola vez (rápido y eficiente)
// =====================================================
function loadJSON(name) {
  const fullPath = path.join(dataDir, name);
  try {
    const raw = fs.readFileSync(fullPath, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.error(`❌ Error cargando ${fullPath}:`, err);
    return [];
  }
}

const CCAA = loadJSON("ccaa.json");
const PROVINCIAS = loadJSON("provincias.json");
const MUNICIPIOS = loadJSON("municipios.json");
const LOCALIDADES = loadJSON("localidades.json");
const ALIAS = loadJSON("alias_localidades.json");

// =====================================================
// 🟦 1. GET /api/localidades/comunidades
// =====================================================
router.get("/comunidades", (req, res) => {
  res.json({
    ok: true,
    total: CCAA.length,
    data: CCAA,
  });
});

// =====================================================
// 🟩 2. GET /api/localidades/provincias?comunidad=xxxx
// =====================================================
router.get("/provincias", (req, res) => {
  const { comunidad } = req.query;

  if (!comunidad) {
    return res.status(400).json({ error: "Falta comunidad" });
  }

  const provs = PROVINCIAS.filter((p) => p.comunidad === comunidad);

  res.json({
    ok: true,
    total: provs.length,
    data: provs,
  });
});

// =====================================================
// 🟨 3. GET /api/localidades/municipios?provincia=xxxx
// =====================================================
router.get("/municipios", (req, res) => {
  const { provincia } = req.query;

  if (!provincia) {
    return res.status(400).json({ error: "Falta provincia" });
  }

  const munis = MUNICIPIOS.filter((m) => m.provincia === provincia);

  res.json({
    ok: true,
    total: munis.length,
    data: munis,
  });
});

// =====================================================
// 🟥 4. GET /api/localidades/pueblos?municipio=xxxx
// =====================================================
router.get("/pueblos", (req, res) => {
  const { municipio } = req.query;

  if (!municipio) {
    return res.status(400).json({ error: "Falta municipio" });
  }

  const pueblos = LOCALIDADES.filter((l) => l.municipio === municipio);

  res.json({
    ok: true,
    total: pueblos.length,
    data: pueblos,
  });
});

// =====================================================
// 🔍 5. GET /api/localidades/buscar?q=sevi
//     busca en: localidades + alias
//     🔒 con límites para evitar abusos
// =====================================================
router.get("/buscar", (req, res) => {
  let { q } = req.query;

  // sin query → lista vacía (lo usa el frontend así)
  if (!q || typeof q !== "string") {
    return res.json({ ok: true, total: 0, data: [] });
  }

  q = q.trim().toLowerCase();

  // demasiado corta → no buscamos (evita ruido y bots)
  if (q.length < MIN_QUERY_LEN) {
    return res.json({ ok: true, total: 0, data: [] });
  }

  // cortamos queries absurdamente largas
  if (q.length > MAX_QUERY_LEN) {
    q = q.slice(0, MAX_QUERY_LEN);
  }

  const texto = q;

  let resultados = LOCALIDADES.filter((loc) =>
    (loc.nombre || "").toLowerCase().includes(texto)
  );

  const aliasMatch = ALIAS.filter((a) =>
    (a.alias || "").toLowerCase().includes(texto)
  );

  aliasMatch.forEach((a) => {
    const l = LOCALIDADES.find((loc) => loc.id === a.id_localidad);
    if (l) resultados.push(l);
  });

  const unicos = Array.from(
    new Map((resultados || []).map((l) => [l.id, l])).values()
  );

  // Limitamos el número de resultados enviados
  const limited = unicos.slice(0, MAX_RESULTS);

  res.json({
    ok: true,
    total: unicos.length, // cuántos matchean en total
    data: limited,        // pero solo devolvemos los primeros N
  });
});

// =====================================================
// 🟣 6. GET /api/localidades  (todas)
//      OJO: devuelve el dataset completo.
//      Lo dejamos para usos internos puntuales.
// =====================================================
router.get("/", (req, res) => {
  res.json({
    ok: true,
    total: LOCALIDADES.length,
    data: LOCALIDADES,
  });
});

module.exports = router;
