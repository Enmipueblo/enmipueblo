"use strict";

const mongoose = require("mongoose");

let connectingPromise = null;

function getMongoUri() {
  // Aceptamos varios nombres por compatibilidad
  return (
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    process.env.MONGO_URL ||
    process.env.DATABASE_URL ||
    ""
  );
}

async function connectMongo() {
  const uri = getMongoUri();
  if (!uri) {
    console.warn("⚠️ MONGO_URI (o MONGODB_URI) no está configurada. Mongo quedará desconectado.");
    return null;
  }

  // Ya conectado
  if (mongoose.connection && mongoose.connection.readyState === 1) return mongoose.connection;

  // Si ya hay un intento en curso, lo reutilizamos
  if (connectingPromise) return connectingPromise;

  connectingPromise = (async () => {
    try {
      mongoose.set("strictQuery", true);

      await mongoose.connect(uri, {
        // timeouts razonables para VPS
        serverSelectionTimeoutMS: 10_000,
        connectTimeoutMS: 10_000,
      });

      console.log("✅ Mongo conectado");
      return mongoose.connection;
    } catch (e) {
      console.error("❌ Error conectando Mongo:", e?.message || e);
      throw e;
    } finally {
      // Importante: liberar el lock, aunque falle
      connectingPromise = null;
    }
  })();

  return connectingPromise;
}

async function ensureMongoConnected() {
  // 1 = connected
  if (mongoose.connection && mongoose.connection.readyState === 1) return mongoose.connection;
  return connectMongo();
}

module.exports = {
  connectMongo,
  ensureMongoConnected,
};