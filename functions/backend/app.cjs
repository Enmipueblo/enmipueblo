"use strict";

const express = require("express");
const cors = require("cors");

const admin2Routes = require("./routes/admin2.routes.cjs");
const serviciosRoutes = require("./routes/servicios.routes.cjs");

// OJO: publicaciones/comentarios pueden no existir en tu repo (lo estás tratando como opcional)
let publicacionesRoutes = null;
let comentariosRoutes = null;

const favoritoRoutes = require("./routes/favorito.routes.cjs");
const featuredRoutes = require("./routes/featured.routes.cjs");
const formRoutes = require("./routes/form.routes.cjs");
const uploadsRoutes = require("./routes/uploads.routes.cjs");
const localidadesRoutes = require("./routes/localidades.routes.cjs");
const geocoderRoutes = require("./routes/geocoder.routes.cjs");
// ✅ FIX: contact.routes ahora montada (formulario de contacto funcionaba en frontend pero devolvía 404)
const contactRoutes = require("./routes/contact.routes.cjs");

const { connectMongo, ensureMongoConnected } = require("./services/mongo.service.cjs");

// ✅ IMPORTANTE: authOptional debe ejecutarse ANTES de admin2 si /admin2/me usa req.user
const { authOptional } = require("./middleware/auth.middleware.cjs");

function optionalRequire(path, label) {
  try {
    return require(path);
  } catch (e) {
    console.warn(`⚠️ Route optional missing: ${label} (${path}) -> ${e?.message || e}`);
    return null;
  }
}

publicacionesRoutes = optionalRequire("./routes/publicaciones.routes.cjs", "publicaciones");
comentariosRoutes = optionalRequire("./routes/comentarios.routes.cjs", "comentarios");

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
app.get("/api/health", (_req, res) => res.json({ ok: true, source: "vps" }));

// ✅ Auth opcional GLOBAL (para que req.user exista en cualquier ruta, incl admin2)
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

// Admin2 (si /me usa req.user, ahora sí)
app.use("/api/admin2", admin2Routes);

// Rutas API
app.use("/api/servicios", serviciosRoutes);

if (publicacionesRoutes) app.use("/api/publicaciones", publicacionesRoutes);
if (comentariosRoutes) app.use("/api/comentarios", comentariosRoutes);

app.use("/api/favorito", favoritoRoutes);
app.use("/api/featured", featuredRoutes);
app.use("/api/form", formRoutes);
app.use("/api/uploads", uploadsRoutes);
app.use("/api/localidades", localidadesRoutes);
app.use("/api/geocoder", geocoderRoutes);
// ✅ FIX: formulario de contacto
app.use("/api/contact", contactRoutes);

// Fallback 404 API
app.use("/api", (_req, res) => {
  res.status(404).json({ ok: false, error: "not_found" });
});

// Startup: conectar mongo en background (no bloquea)
connectMongo().catch((e) => {
  console.warn("⚠️ Mongo connect on startup failed (lazy mode):", e?.message || e);
});

module.exports = app;
