const express = require("express");
const mongoose = require("mongoose");
const { authOptional, authRequired } = require("./auth.cjs");

const Servicio = require("./models/servicio.model.js");

const serviciosRoutes = require("./routes/servicios.routes.cjs");
const favoritoRoutes = require("./routes/favorito.routes.cjs");
const systemRoutes = require("./routes/system.routes.cjs");
const localidadesRoutes = require("./routes/localidades.routes.cjs");
const formRoutes = require("./routes/form.routes.cjs");
const sitemapRoutes = require("./routes/sitemap.routes.cjs");
const contactRoutes = require("./routes/contact.routes.cjs");
const adminRoutes = require("./routes/admin.routes.cjs");
const uploadsRoutes = require("./routes/uploads.routes.cjs");

const app = express();

app.disable("x-powered-by");

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
  );
  next();
});

app.use(express.json({ limit: "1mb" }));

// ✅ Para rutas públicas y para que owner/admin funcione en servicios (sin exigir login)
app.use(authOptional);

// Mongo lazy + índices
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

        try {
          await Servicio.init();
          console.log("✅ Índices Servicio asegurados");
        } catch (e) {
          console.error("⚠️ No se pudieron asegurar índices:", e);
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

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/servicios", serviciosRoutes);
app.use("/api/favorito", authRequired, favoritoRoutes);

app.use("/api/system", systemRoutes);
app.use("/api/localidades", localidadesRoutes);
app.use("/api/form", formRoutes);
app.use("/api/sitemap", sitemapRoutes);
app.use("/api/contact", contactRoutes);

// ✅ ADMIN: aquí SÍ exigimos token válido
app.use("/api/admin", authRequired, adminRoutes);

// uploads ya protege con authRequired adentro, pero no molesta dejarlo así
app.use("/api/uploads", uploadsRoutes);

module.exports = app;
