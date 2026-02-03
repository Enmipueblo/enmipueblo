
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

// debug: no imprime token, solo si llega header
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

// debug: con token válido te dice quién sos
app.get("/api/debug/whoami", authRequired, (req, res) => {
  res.json({ ok: true, user: req.user || null });
});

// rutas públicas/owner sin exigir login
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
        console.log("MongoDB conectado");

        try {
          await Servicio.init();
          console.log("Indices Servicio asegurados");
        } catch (e) {
          console.error("No se pudieron asegurar indices:", e);
        }
      })();
    }

    await mongoInitPromise;
    next();
  } catch (err) {
    console.error("Error conectando a Mongo:", err);
    mongoInitPromise = null;
    res.status(500).json({ error: "DB connection error" });
  }
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/servicios", serviciosRoutes);

// FAVORITO: exige token SIEMPRE
app.use("/api/favorito", authRequired, favoritoRoutes);

app.use("/api/system", systemRoutes);
app.use("/api/localidades", localidadesRoutes);
app.use("/api/form", formRoutes);
app.use("/api/sitemap", sitemapRoutes);
app.use("/api/contact", contactRoutes);

// ADMIN: exige token
app.use("/api/admin", authRequired, adminRoutes);

app.use("/api/uploads", uploadsRoutes);

module.exports = app;

