const express = require("express");
const mongoose = require("mongoose");
const { authOptional } = require("./auth.cjs");

const Servicio = require("./models/servicio.model.js");

const serviciosRoutes = require("./routes/servicios.routes.cjs");
const favoritoRoutes = require("./routes/favorito.routes.cjs");
const systemRoutes = require("./routes/system.routes.cjs");
const localidadesRoutes = require("./routes/localidades.routes.cjs");
const formRoutes = require("./routes/form.routes.cjs");
const sitemapRoutes = require("./routes/sitemap.routes.cjs");
const contactRoutes = require("./routes/contact.routes.cjs");
const adminRoutes = require("./routes/admin.routes.cjs");

const app = express();

app.use(express.json({ limit: "1mb" }));

// Auth optional
app.use(authOptional);

// ✅ Conexión Mongo (1 sola vez por instancia) + asegurar índices
let mongoInitPromise = null;

app.use(async (req, res, next) => {
  try {
    const p = req.path || "";
    if (p.startsWith("/api/localidades") || p === "/api/health") return next();

    if (mongoose.connection.readyState === 1) return next();

    if (!mongoInitPromise) {
      mongoInitPromise = (async () => {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ MongoDB conectado");

        // Intentar crear índices (incluye location 2dsphere)
        try {
          await Servicio.init();
          console.log("✅ Índices Servicio asegurados");
        } catch (e) {
          console.error("⚠️ No se pudieron asegurar índices (se seguirá sin geo):", e);
        }
      })();
    }

    await mongoInitPromise;
    next();
  } catch (err) {
    console.error("❌ Error conectando a Mongo:", err);
    mongoInitPromise = null;
    res.status(500).json({ error: "DB connection error" });
  }
});

// Health
app.get("/api/health", (req, res) => res.json({ ok: true }));

// Routes
app.use("/api/servicios", serviciosRoutes);
app.use("/api/favorito", favoritoRoutes);
app.use("/api/system", systemRoutes);
app.use("/api/localidades", localidadesRoutes);
app.use("/api/form", formRoutes);
app.use("/api/sitemap", sitemapRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/admin", adminRoutes);

module.exports = app;
