// functions/backend/app.cjs
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const { authOptional } = require("./auth.cjs");

// Importar rutas
const serviciosRoutes = require("./routes/servicios.routes.cjs");
const favoritoRoutes = require("./routes/favorito.routes.cjs");
const systemRoutes = require("./routes/system.routes.cjs");
const localidadesRoutes = require("./routes/localidades.routes.cjs");
const formRoutes = require("./routes/form.routes.cjs");
const contactRoutes = require("./routes/contact.routes.cjs");

const app = express();

// ----------------------------------------
// 🟢 Middlewares básicos
// ----------------------------------------
app.use(
  cors({
    origin: true, // en index.cjs ya restringimos dominios
    credentials: true,
  })
);

// 🔒 Limitar tamaño de cuerpos JSON / x-www-form-urlencoded
app.use(
  express.json({
    limit: "1mb", // suficiente para nuestros payloads
  })
);
app.use(
  express.urlencoded({
    extended: true,
    limit: "1mb",
  })
);

// ----------------------------------------
// 🔌 Conexión a MongoDB (lazy, por petición)
// ----------------------------------------
let mongoConnectingPromise = null;

async function connectMongoIfNeeded() {
  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  if (mongoose.connection.readyState === 1) return; // ya conectado

  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.warn(
      "⚠️ MONGO_URI no está definido. " +
        "En producción viene de Firebase Secrets. " +
        "En local debes exportar MONGO_URI si quieres conectarte."
    );
    return;
  }

  if (!mongoConnectingPromise) {
    mongoConnectingPromise = mongoose
      .connect(uri)
      .then(() => {
        console.log("✅ MongoDB conectado correctamente");
      })
      .catch((err) => {
        console.error("❌ Error conectando a MongoDB:", err);
        mongoConnectingPromise = null;
      });
  }

  await mongoConnectingPromise;
}

// Middleware global: asegura conexión antes de cada request
app.use(async (req, res, next) => {
  await connectMongoIfNeeded();
  next();
});

// ----------------------------------------
// 🔐 Adjuntar usuario Firebase si hay token
//    (no obliga a estar logueado, solo rellena req.user)
// ----------------------------------------
app.use(authOptional);

// ----------------------------------------
// 🟢 MONTAJE DE RUTAS
// ----------------------------------------
app.use("/api/form", formRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/servicios", serviciosRoutes);
app.use("/api/favorito", favoritoRoutes);
app.use("/api/localidades", localidadesRoutes);
app.use("/api/system", systemRoutes);

// ----------------------------------------
// ✔️ Healthcheck
// ----------------------------------------
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// ----------------------------------------
// 🚧 404 genérico JSON
// ----------------------------------------
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Ruta no encontrada" });
  }
  next();
});

// ----------------------------------------
// 🛑 Manejador global de errores
//    (no exponemos detalles internos al cliente)
// ----------------------------------------
app.use((err, req, res, next) => {
  console.error("❌ Error no controlado:", err);
  if (res.headersSent) {
    return next(err);
  }
  res
    .status(500)
    .json({ error: "Error interno del servidor. Inténtalo más tarde." });
});

module.exports = app;
