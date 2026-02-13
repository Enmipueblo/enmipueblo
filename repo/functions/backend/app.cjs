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
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => res.json({ ok: true, source: "vps" }));

app.get("/api/debug/has-auth", (req, res) => {
  const h = req.headers.authorization || req.headers.Authorization || "";
  const s = String(h || "");
  res.json({
    ok: true,
    hasAuthorization: !!s,
    scheme: (s.split(" ")[0] || ""),
    length: s.length,
  });
});

app.get("/api/debug/whoami", authRequired, (req, res) => {
  res.json({ ok: true, user: req.user || null });
});

app.use(authOptional);

// Mongo lazy
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

// ✅ Endpoints de detalle compatibles (para que no diga “no encontrado”)
app.get("/api/servicios/:id([0-9a-fA-F]{24})", async (req, res) => {
  try {
    const s = await Servicio.findById(req.params.id);
    if (!s) return res.status(404).json({ error: "Servicio no encontrado" });
    return res.json(s);
  } catch (e) {
    return res.status(400).json({ error: "ID inválido" });
  }
});

app.get("/api/servicio", async (req, res) => {
  try {
    const id = String(req.query.id || "");
    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(400).json({ error: "ID inválido" });
    }
    const s = await Servicio.findById(id);
    if (!s) return res.status(404).json({ error: "Servicio no encontrado" });
    return res.json(s);
  } catch (e) {
    return res.status(500).json({ error: "Error" });
  }
});

app.use("/api/servicios", serviciosRoutes);
app.use("/api/favorito", authRequired, favoritoRoutes);
app.use("/api/system", systemRoutes);
app.use("/api/localidades", localidadesRoutes);
app.use("/api/form", formRoutes);
app.use("/api/sitemap", sitemapRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/admin", authRequired, adminRoutes);
app.use("/api/uploads", uploadsRoutes);

module.exports = app;
