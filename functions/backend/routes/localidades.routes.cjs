const express = require("express");
const fs = require("fs");
const path = require("path");
const Servicio = require("../models/servicio.model.js");

const router = express.Router();

function normalizeText(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function titleCase(s) {
  return String(s || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const k = keyFn(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

function parseCsv(content) {
  const lines = String(content || "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const headers = lines[0].split(",").map((x) => x.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(",").map((x) => x.trim());
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] || "";
    });
    rows.push(row);
  }

  return rows;
}

function normalizeLocalidadRow(row) {
  const nombre =
    row.nombre ||
    row.localidad ||
    row.municipio ||
    row.pueblo ||
    row.city ||
    row.name ||
    "";

  const provincia =
    row.provincia ||
    row.province ||
    row.prov ||
    "";

  const ccaa =
    row.ccaa ||
    row.comunidad ||
    row.comunidad_autonoma ||
    row.comunidadAutonoma ||
    row.autonomia ||
    "";

  if (!String(nombre || "").trim()) return null;

  return {
    nombre: titleCase(nombre),
    provincia: titleCase(provincia),
    ccaa: titleCase(ccaa),
  };
}

function getCandidateFiles() {
  return [
    path.join(__dirname, "../data/localidades.json"),
    path.join(__dirname, "../data/municipios.json"),
    path.join(__dirname, "../data/localidades.csv"),
    path.join(__dirname, "../data/municipios.csv"),
    path.join(__dirname, "../../data/localidades.json"),
    path.join(__dirname, "../../data/municipios.json"),
    path.join(__dirname, "../../data/localidades.csv"),
    path.join(__dirname, "../../data/municipios.csv"),
    path.join(__dirname, "../../../data/localidades.json"),
    path.join(__dirname, "../../../data/municipios.json"),
    path.join(__dirname, "../../../data/localidades.csv"),
    path.join(__dirname, "../../../data/municipios.csv"),
  ];
}

function readLocalidadesFromFiles() {
  for (const file of getCandidateFiles()) {
    try {
      if (!fs.existsSync(file)) continue;

      const raw = fs.readFileSync(file, "utf8");
      let rows = [];

      if (file.endsWith(".json")) {
        const parsed = JSON.parse(raw);
        rows = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.data)
          ? parsed.data
          : Array.isArray(parsed?.items)
          ? parsed.items
          : [];
      } else if (file.endsWith(".csv")) {
        rows = parseCsv(raw);
      }

      const normalized = rows
        .map(normalizeLocalidadRow)
        .filter(Boolean);

      if (normalized.length > 0) {
        return uniqueBy(
          normalized.sort((a, b) => {
            const x = `${a.nombre}|${a.provincia}|${a.ccaa}`;
            const y = `${b.nombre}|${b.provincia}|${b.ccaa}`;
            return x.localeCompare(y, "es");
          }),
          (x) => normalizeText(`${x.nombre}|${x.provincia}|${x.ccaa}`)
        );
      }
    } catch (err) {
      console.error("Error leyendo fichero de localidades:", file, err);
    }
  }

  return [];
}

async function readLocalidadesFromServicios() {
  try {
    const rows = await Servicio.find(
      {
        pueblo: { $exists: true, $ne: "" },
      },
      { pueblo: 1, provincia: 1, comunidad: 1 }
    )
      .lean()
      .limit(5000);

    const normalized = rows
      .map((row) => ({
        nombre: titleCase(row.pueblo || ""),
        provincia: titleCase(row.provincia || ""),
        ccaa: titleCase(row.comunidad || ""),
      }))
      .filter((x) => x.nombre);

    return uniqueBy(
      normalized,
      (x) => normalizeText(`${x.nombre}|${x.provincia}|${x.ccaa}`)
    );
  } catch (err) {
    console.error("Error leyendo localidades desde servicios:", err);
    return [];
  }
}

async function getAllLocalidades() {
  const fromFiles = readLocalidadesFromFiles();
  const fromServicios = await readLocalidadesFromServicios();

  const merged = [...fromFiles, ...fromServicios];

  return uniqueBy(
    merged.sort((a, b) => {
      const x = `${a.nombre}|${a.provincia}|${a.ccaa}`;
      const y = `${b.nombre}|${b.provincia}|${b.ccaa}`;
      return x.localeCompare(y, "es");
    }),
    (x) => normalizeText(`${x.nombre}|${x.provincia}|${x.ccaa}`)
  );
}

function filterLocalidades(items, q) {
  const nq = normalizeText(q);
  if (!nq) return items.slice(0, 20);

  return items
    .filter((it) => {
      const haystack = normalizeText(
        `${it.nombre} ${it.provincia || ""} ${it.ccaa || ""}`
      );
      return haystack.includes(nq);
    })
    .slice(0, 20);
}

router.get("/", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const all = await getAllLocalidades();
    const data = filterLocalidades(all, q);

    res.json({
      ok: true,
      data,
    });
  } catch (err) {
    console.error("❌ localidades / error:", err);
    res.status(500).json({ ok: false, error: "Error cargando localidades" });
  }
});

router.get("/buscar", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const all = await getAllLocalidades();
    const data = filterLocalidades(all, q);

    res.json({
      ok: true,
      data,
    });
  } catch (err) {
    console.error("❌ localidades /buscar error:", err);
    res.status(500).json({ ok: false, error: "Error buscando localidades" });
  }
});

router.get("/provincias", async (_req, res) => {
  try {
    const all = await getAllLocalidades();
    const data = uniqueBy(
      all
        .map((x) => titleCase(x.provincia || ""))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "es"))
        .map((nombre) => ({ nombre })),
      (x) => normalizeText(x.nombre)
    );

    res.json({ ok: true, data });
  } catch (err) {
    console.error("❌ localidades /provincias error:", err);
    res.status(500).json({ ok: false, error: "Error cargando provincias" });
  }
});

router.get("/ccaa", async (_req, res) => {
  try {
    const all = await getAllLocalidades();
    const data = uniqueBy(
      all
        .map((x) => titleCase(x.ccaa || ""))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "es"))
        .map((nombre) => ({ nombre })),
      (x) => normalizeText(x.nombre)
    );

    res.json({ ok: true, data });
  } catch (err) {
    console.error("❌ localidades /ccaa error:", err);
    res.status(500).json({ ok: false, error: "Error cargando comunidades" });
  }
});

module.exports = router;