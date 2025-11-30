// localidades.routes.cjs
const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

// =====================================================
// 🔧 Resolver rutas absolutas dentro de Firebase Functions
// =====================================================
const dataDir = path.join(__dirname, "..", "data");

// =====================================================
// 🔄 Cargar JSONs una sola vez (rápido y eficiente)
// =====================================================
function loadJSON(name) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, name), "utf-8"));
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
// busca en: localidades + alias
// =====================================================
router.get("/buscar", (req, res) => {
  const { q } = req.query;
  if (!q) return res.json({ ok: true, data: [] });

  const texto = q.toLowerCase();

  let resultados = LOCALIDADES.filter((loc) =>
    loc.nombre.toLowerCase().includes(texto)
  );

  const aliasMatch = ALIAS.filter((a) =>
    a.alias.toLowerCase().includes(texto)
  );

  aliasMatch.forEach((a) => {
    const l = LOCALIDADES.find((loc) => loc.id === a.id_localidad);
    if (l) resultados.push(l);
  });

  const unicos = Array.from(
    new Map(resultados.map((l) => [l.id, l])).values()
  );

  res.json({
    ok: true,
    total: unicos.length,
    data: unicos,
  });
});

// =====================================================
// 🟣 6. GET /api/localidades  (todas)
// =====================================================
router.get("/", (req, res) => {
  res.json({
    ok: true,
    total: LOCALIDADES.length,
    data: LOCALIDADES,
  });
});

module.exports = router;
