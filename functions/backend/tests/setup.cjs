// functions/backend/tests/setup.cjs
const fs = require("node:fs");
const path = require("node:path");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

process.env.NODE_ENV = "test";

// Carga opcional: functions/.env.test
const envTestPath = path.join(__dirname, "../../.env.test");
loadEnvFile(envTestPath);

// Permite usar TEST_MONGO_URI sin pisar tu MONGO_URI normal
if (process.env.TEST_MONGO_URI && !process.env.MONGO_URI) {
  process.env.MONGO_URI = process.env.TEST_MONGO_URI;
}

const uri = String(process.env.MONGO_URI || "").trim();
if (!uri) {
  console.error("❌ Tests: Falta MONGO_URI (o TEST_MONGO_URI).");
  console.error(
    "   Solución: creá functions/.env.test con TEST_MONGO_URI=.../enmipueblo_test"
  );
  process.exit(1);
}

// Extraer nombre de DB y forzar “test”
const m = uri.match(/\/([^/?]+)(\?|$)/);
const dbName = (m && m[1]) ? m[1] : "";
if (!/test/i.test(dbName)) {
  console.error("❌ Tests: La DB debe ser de TEST (dbname con 'test').");
  console.error("   DB detectada:", dbName || "(no detectada)");
  process.exit(1);
}
