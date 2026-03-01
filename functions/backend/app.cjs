const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");

const { ensureMongoConnected, pingMongo } = require("./mongo.cjs");

const serviciosRoutes = require("./routes/servicios.routes.cjs");
const adminRoutes = require("./routes/admin.routes.cjs");
const admin2Routes = require("./routes/admin2.routes.cjs");
const localidadesRoutes = require("./routes/localidades.routes.cjs");
const geocoderRoutes = require("./routes/geocoder.routes.cjs");
const formRoutes = require("./routes/form.routes.cjs");
const featuredRoutes = require("./routes/featured.routes.cjs");
const uploadsRoutes = require("./routes/uploads.routes.cjs");

const app = express();

// CORS: permitir dominio principal + admin + localhost dev
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: function (origin, cb) {
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.length === 0) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "2mb" }));

// Health
app.get("/api/health", async (req, res) => {
  const mongo = await pingMongo().catch(() => ({ ok: false }));
  res.json({ ok: true, source: process.env.SOURCE || "vps", mongo });
});

// Rutas principales
app.use("/api/servicios", serviciosRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin2", admin2Routes);
app.use("/api/localidades", localidadesRoutes);
app.use("/api/geocoder", geocoderRoutes);
app.use("/api/form", formRoutes);
app.use("/api/featured", featuredRoutes);
app.use("/api/uploads", uploadsRoutes);

// Fallback 404 API
app.use("/api", (req, res) => {
  res.status(404).json({ ok: false, error: "not_found" });
});

module.exports = app;
