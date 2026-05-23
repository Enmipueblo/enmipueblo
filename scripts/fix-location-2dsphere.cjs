#!/usr/bin/env node
// scripts/fix-location-2dsphere.cjs
// Limpia documentos con location incompleto que causan el warning de Mongo:
// "Plan executor error during findAndModify :: caused by :: Point must only contain numeric elements"
//
// EJECUTAR UNA SOLA VEZ en el servidor:
//   node scripts/fix-location-2dsphere.cjs
//
// Carga las vars de entorno desde env/app.env automáticamente si existe.

const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

// Cargar env/app.env si existe
const envPath = path.resolve(__dirname, "../env/app.env");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
  console.log("✅ Env cargado desde env/app.env");
}

const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  process.env.MONGO_URL ||
  "";

if (!MONGO_URI) {
  console.error("❌ Falta MONGO_URI en env");
  process.exit(1);
}

async function run() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  console.log("✅ Conectado a MongoDB");

  const db = client.db();
  const col = db.collection("servicios");

  // 1. Docs con location pero sin coordinates válidas
  const badFilter = {
    $or: [
      // location existe pero coordinates no
      { location: { $exists: true }, "location.coordinates": { $exists: false } },
      // coordinates existe pero vacío o no es array de 2
      { "location.coordinates": { $size: 0 } },
      { "location.coordinates": null },
      // location.type existe sin ser "Point"
      { "location.type": { $exists: true, $ne: "Point" } },
    ],
  };

  const count = await col.countDocuments(badFilter);
  console.log(`🔍 Documentos con location inválida: ${count}`);

  if (count === 0) {
    console.log("✅ Nada que limpiar — base de datos OK");
    await client.close();
    return;
  }

  // 2. Mostrar IDs afectados antes de limpiar
  const samples = await col.find(badFilter).project({ _id: 1, location: 1 }).limit(5).toArray();
  console.log("📋 Muestra de afectados:", JSON.stringify(samples, null, 2));

  // 3. Limpiar: quitar el campo location completo
  const result = await col.updateMany(badFilter, { $unset: { location: "" } });
  console.log(`✅ Limpiados: ${result.modifiedCount} documentos`);

  // 4. Verificar que quedaron cero
  const remaining = await col.countDocuments(badFilter);
  console.log(`🔍 Documentos inválidos restantes: ${remaining}`);

  // 5. Stats finales
  const total = await col.countDocuments();
  const conGeo = await col.countDocuments({ "location.coordinates": { $exists: true } });
  console.log(`📊 Total servicios: ${total} | Con geo válida: ${conGeo}`);

  await client.close();
  console.log("✅ Migración completada");
}

run().catch((e) => {
  console.error("❌ Error:", e);
  process.exit(1);
});
