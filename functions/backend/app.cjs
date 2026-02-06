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
    scheme: s.split(" ")[0] || "",
    length: s.length,
  });
});

app.get("/api/debug/whoami", authRequired, (req, res) => {
  res.json({ ok: true, user: req.user || null });
});

app.use(authOptional);

// --------------------
// Media normalization (para /api/servicio legacy)
// --------------------
const DEFAULT_MEDIA_BASE = "https://media.enmipueblo.com";

function normalizeEmail(e) {
  return String(e || "").trim().toLowerCase();
}

function getMediaBase(req) {
  const base = process.env.MEDIA_PUBLIC_BASE || DEFAULT_MEDIA_BASE;
  return String(base).replace(/\/+$/, "");
}

function urlToServiceKey(url) {
  const s = String(url || "");
  const m = s.match(/\/service_images\/(.*)$/);
  return m ? m[1] : null;
}

function normalizePublicMediaUrl(url, req) {
  const key = urlToServiceKey(url);
  if (!key) return url;
  return `${getMediaBase(req)}/service_images/${key}`;
}

function normalizeServicioMedia(servicio, req) {
  if (!servicio) return servicio;
  const out = { ...servicio };

  if (Array.isArray(out.galeria)) {
    out.galeria = out.galeria.map((u) => normalizePublicMediaUrl(u, req));
  }
  if (out.imagenPrincipal) out.imagenPrincipal = normalizePublicMediaUrl(out.imagenPrincipal, req);
  if (out.portada) out.portada = normalizePublicMediaUrl(out.portada, req);
  if (out.imagen) out.imagen = normalizePublicMediaUrl(out.imagen, req);

  return out;
}

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

// ✅ Legacy: /api/servicio?id=...
// (mantenerlo por compat, pero devolviendo formato consistente)
app.get("/api/servicio", async (req, res) => {
  try {
    const id = String(req.query.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "Falta id" });

    let s = null;
    try {
      s = await Servicio.findById(id).lean();
    } catch (e) {
      return res.status(400).json({ ok: false, error: "ID inválido" });
    }

    if (!s) return res.status(404).json({ ok: false, error: "Servicio no encontrado" });

    const me = normalizeEmail(req.user && req.user.email);
    const owner = normalizeEmail(s.usuarioEmail);
    const isMine = !!me && !!owner && me === owner;

    const estado = String(s.estado || "activo");
    if (!isMine && estado !== "activo") {
      return res.status(404).json({ ok: false, error: "Servicio no encontrado" });
    }

    let out = normalizeServicioMedia(s, req);

    if (!isMine) {
      out.usuarioEmail = "";
      out.usuarioNombre = "";
    }

    return res.json({ ok: true, servicio: out });
  } catch (e) {
    console.error("❌ Error en /api/servicio:", e);
    return res.status(500).json({ ok: false, error: "Error" });
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
