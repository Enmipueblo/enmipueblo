"use strict";

const express = require("express");
const cors = require("cors");

const admin2Routes = require("./routes/admin2.routes.cjs");
const serviciosRoutes = require("./routes/servicios.routes.cjs");
const publicacionesRoutes = require("./routes/publicaciones.routes.cjs");
const comentariosRoutes = require("./routes/comentarios.routes.cjs");
const favoritosRoutes = require("./routes/favoritos.routes.cjs");
const featuredRoutes = require("./routes/featured.routes.cjs");
const formRoutes = require("./routes/form.routes.cjs");
const uploadsRoutes = require("./routes/uploads.routes.cjs");
const localidadesRoutes = require("./routes/localidades.routes.cjs");
const geocoderRoutes = require("./routes/geocoder.routes.cjs");

const {
  connectMongo,
  ensureMongoConnected,
} = require("./services/mongo.service.cjs");

const { authOptional } = require("./middleware/auth.middleware.cjs");

const app = express();

app.set("trust proxy", true);

// CORS
const corsOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: function (origin, cb) {
      // Permitir requests sin origin (curl/SSR)
      if (!origin) return cb(null, true);
      if (corsOrigins.length === 0) return cb(null, true);
      if (corsOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("CORS blocked"), false);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

// Health (sin DB)
app.get("/api/health", (req, res) => res.json({ ok: true, source: "vps" }));

// Admin2 va aparte (tiene su propia auth interna)
app.use("/api/admin2", admin2Routes);

// Auth opcional (para endpoints públicos y privados)
app.use(authOptional);

// Conectar Mongo (lazy) para todo lo que NO sea health/localidades/geocoder
app.use(async (req, res, next) => {
  try {
    const path = req.path || "";

    // Estas rutas NO requieren DB
    if (
      path.startsWith("/api/health") ||
      path.startsWith("/api/localidades") ||
      path.startsWith("/api/geocoder")
    ) {
      return next();
    }

    await ensureMongoConnected();
    return next();
  } catch (e) {
    console.error("❌ Mongo ensure error:", e);
    return res.status(500).json({ ok: false, error: "mongo_unavailable" });
  }
});

// Rutas API (NO BORRAR: acá está todo lo que rompiste)
app.use("/api/servicios", serviciosRoutes);
app.use("/api/publicaciones", publicacionesRoutes);
app.use("/api/comentarios", comentariosRoutes);
app.use("/api/favorito", favoritosRoutes);
app.use("/api/featured", featuredRoutes);
app.use("/api/form", formRoutes);
app.use("/api/uploads", uploadsRoutes);
app.use("/api/localidades", localidadesRoutes);
app.use("/api/geocoder", geocoderRoutes);

// Fallback 404 API
app.use("/api", (req, res) => {
  res.status(404).json({ ok: false, error: "not_found" });
});

// Startup: conectar mongo en background (no bloquea)
connectMongo().catch((e) => {
  console.warn("⚠️ Mongo connect on startup failed (lazy mode):", e?.message || e);
});

module.exports = app;