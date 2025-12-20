const express = require("express");
const mongoose = require("mongoose");
const { authOptional } = require("./auth.cjs");

const serviciosRoutes = require("./routes/servicios.routes.cjs");
const favoritoRoutes = require("./routes/favorito.routes.cjs");
const systemRoutes = require("./routes/system.routes.cjs");
const localidadesRoutes = require("./routes/localidades.routes.cjs");
const formRoutes = require("./routes/form.routes.cjs");
const contactRoutes = require("./routes/contact.routes.cjs");
const adminRoutes = require("./routes/admin.routes.cjs");
const sitemapRoutes = require("./routes/sitemap.routes.cjs");

const app = express();

app.set("trust proxy", true);
app.disable("x-powered-by");

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  next();
});

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

let mongoConnectingPromise = null;

async function connectMongoIfNeeded() {
  if (mongoose.connection.readyState === 1) return;

  const uri = process.env.MONGO_URI;
  if (!uri) return;

  if (!mongoConnectingPromise) {
    mongoConnectingPromise = mongoose
      .connect(uri)
      .catch((err) => {
        console.error("❌ Mongo connect error:", err);
        mongoConnectingPromise = null;
        throw err;
      });
  }

  await mongoConnectingPromise;
}

app.use(async (req, res, next) => {
  try {
    await connectMongoIfNeeded();
    next();
  } catch (err) {
    res.status(500).json({ error: "DB connection error" });
  }
});

app.use(authOptional);

app.use("/api/form", formRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/servicios", serviciosRoutes);
app.use("/api/favorito", favoritoRoutes);
app.use("/api/localidades", localidadesRoutes);
app.use("/api/system", systemRoutes);
app.use("/api/admin", adminRoutes);

app.use(sitemapRoutes);

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

module.exports = app;
