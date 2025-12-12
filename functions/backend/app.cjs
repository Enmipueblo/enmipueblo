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
const adminRoutes = require("./routes/admin.routes.cjs");

const app = express();

// ----------------------------------------
// 🟢 Middlewares básicos
// ----------------------------------------
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(
  express.json({
    limit: "1mb",
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
  if (mongoose.connection.readyState === 1) return;

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

app.use(async (req, res, next) => {
  await connectMongoIfNeeded();
  next();
});

// ----------------------------------------
// 🔐 Usuario Firebase (opcional)
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
app.use("/api/admin", adminRoutes);

// ----------------------------------------
// ✔️ Healthcheck
// ----------------------------------------
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

module.exports = app;
