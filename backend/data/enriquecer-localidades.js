import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Soporte para __dirname con ESModules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const localidadesPath = path.join(__dirname, 'localidades.json');
const provinciasPath = path.join(__dirname, 'provincias.json');
const ccaaPath = path.join(__dirname, 'ccaa.json');
const outputPath = path.join(__dirname, 'localidades_enriquecidas.json');

// Leer archivos
const localidades = JSON.parse(fs.readFileSync(localidadesPath, 'utf8'));
const provincias = JSON.parse(fs.readFileSync(provinciasPath, 'utf8'));
const ccaa = JSON.parse(fs.readFileSync(ccaaPath, 'utf8'));

const provinciasById = {};
provincias.forEach(p => (provinciasById[p.provincia_id] = p));

const ccaaById = {};
ccaa.forEach(c => (ccaaById[c.ccaa_id] = c));

const enriched = localidades.map(l => {
  const provincia = provinciasById[l.provincia_id];
  const comunidad = provincia ? ccaaById[provincia.ccaa_id] : null;
  return {
    municipio_id: l.municipio_id || l.cod_ine,
    nombre: l.nombre,
    provincia_id: provincia ? provincia.provincia_id : null,
    provincia: provincia ? provincia.nombre : null,
    ccaa_id: comunidad ? comunidad.ccaa_id : null,
    ccaa: comunidad ? comunidad.nombre : null,
  };
});

fs.writeFileSync(outputPath, JSON.stringify(enriched, null, 2), 'utf8');

console.log(`✅ Archivo enriquecido creado en: ${outputPath}`);
