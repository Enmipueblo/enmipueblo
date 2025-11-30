import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Soporte para __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const localidadesPath = path.join(__dirname, "localidades.json");
const provinciasPath = path.join(__dirname, "provincias.json");
const ccaaPath = path.join(__dirname, "ccaa.json");
const outputPath = path.join(__dirname, "localidades_enriquecidas.json");

// Leer archivos originales
const localidades = JSON.parse(fs.readFileSync(localidadesPath, "utf8"));
const provincias = JSON.parse(fs.readFileSync(provinciasPath, "utf8"));
const ccaa = JSON.parse(fs.readFileSync(ccaaPath, "utf8"));

const provinciasById = {};
provincias.forEach(p => {
  provinciasById[p.provincia_id] = p;
});

const ccaaById = {};
ccaa.forEach(c => {
  ccaaById[c.ccaa_id] = c;
});

// ✔ Generar estructura correcta
const enriched = localidades.map(l => {
  const provincia = provinciasById[l.provincia_id] || null;
  const comunidad = provincia ? ccaaById[provincia.ccaa_id] : null;

  return {
    municipio_id: l.municipio_id || l.cod_ine,
    nombre: l.nombre,
    provincia: provincia ? { id: provincia.provincia_id, nombre: provincia.nombre } : null,
    ccaa: comunidad ? { id: comunidad.ccaa_id, nombre: comunidad.nombre } : null,
  };
});

fs.writeFileSync(outputPath, JSON.stringify(enriched, null, 2), "utf8");

console.log("✅ Archivo localidades_enriquecidas.json regenerado correctamente.");
