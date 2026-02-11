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
const billingRoutes = require("./routes/billing.routes.cjs");
const featuredRoutes = require("./routes/featured.routes.cjs");

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => res.json({ ok: true, source: "vps" }));

app.get("/api/debug/has-auth", (req, res) => {
  const h = req.headers.authorization || req.headers.Authorization || "";
  const s = String(h || "");
  res.json({
    ok: true,
    hasAuthorization: !!s,
    scheme: s.split(" ")[0] || "",
    length: s.length,
  });
});

app.get("/api/debug/whoami", authRequired, (req, res) => {
  res.json({ ok: true, user: req.user || null });
});

// authOptional global (para que req.user exista cuando haya token)
app.use(authOptional);

// ✅ Compat legacy: /api/servicio?id=... -> /api/servicios/:id
app.get("/api/servicio", (req, res) => {
  const id = String(req.query.id || "").trim();
  if (!id) return res.status(400).json({ error: "ID requerido" });
  return res.redirect(307, `/api/servicios/${encodeURIComponent(id)}`);
});

// ✅ COMPAT: si el frontend pide GET /api/servicios?... => lo servimos como búsqueda con destacados
app.get("/api/servicios", (req, res) => {
  if (req.method !== "GET") return res.status(405).end();
  const qs = req.originalUrl.includes("?") ? req.originalUrl.split("?")[1] : "";
  const target = `/api/featured/search${qs ? `?${qs}` : ""}`;
  return res.redirect(307, target);
});

// ✅ COMPAT: posibles endpoints antiguos para “destacados portada”
app.get("/api/servicios/destacados", (req, res) => {
  const qs = req.originalUrl.includes("?") ? req.originalUrl.split("?")[1] : "";
  const target = `/api/featured/portada${qs ? `?${qs}` : ""}`;
  return res.redirect(307, target);
});
app.get("/api/servicios/portada", (req, res) => {
  const qs = req.originalUrl.includes("?") ? req.originalUrl.split("?")[1] : "";
  const target = `/api/featured/portada${qs ? `?${qs}` : ""}`;
  return res.redirect(307, target);
});

// Mongo lazy (mongoose) — evitamos conectar en rutas que no lo necesitan
let mongoInitPromise = null;
app.use(async (req, res, next) => {
  try {
    const p = req.path || "";
    // no queremos conectar mongoose por rutas que no lo requieren
    if (
      p.startsWith("/api/localidades") ||
      p === "/api/health" ||
      p.startsWith("/api/featured") ||
      (p === "/api/servicios" && req.method === "GET")
    ) {
      return next();
    }

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

// Rutas
app.use("/api/featured", featuredRoutes);

app.use("/api/servicios", serviciosRoutes); // ojo: GET /api/servicios está “compat” arriba, aquí quedan /:id, POST, etc
app.use("/api/favorito", authRequired, favoritoRoutes);
app.use("/api/system", systemRoutes);
app.use("/api/localidades", localidadesRoutes);
app.use("/api/form", formRoutes);
app.use("/api/sitemap", sitemapRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/admin", authRequired, adminRoutes);
app.use("/api/uploads", uploadsRoutes);
app.use("/api/billing", billingRoutes);

module.exports = app;
