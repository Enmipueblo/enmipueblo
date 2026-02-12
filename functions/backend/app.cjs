const express = require("express");
const mongoose = require("mongoose");
const { authOptional, authRequired, isAdmin } = require("./auth.cjs");

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
const admin2Routes = require("./routes/admin2.routes.cjs");

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

app.use("/api/admin2", admin2Routes);


app.get("/api/health", (_req, res) => res.json({ ok: true, source: "vps" }));

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
  res.json({ ok: true, user: req.user || null, isAdmin: !!isAdmin(req) });
});

app.use(authOptional);

// =======================
// Mongo lazy connect
// =======================
let mongoInitPromise = null;

app.use(async (req, res, next) => {
  try {
    const p = req.path || "";

    // endpoints que no necesitan DB
    if (p.startsWith("/api/localidades") || p === "/api/health") return next();

    if (mongoose.connection.readyState === 1) return next();

    if (!mongoInitPromise) {
      mongoInitPromise = (async () => {
        await mongoose.connect(process.env.MONGO_URI, {
          serverSelectionTimeoutMS: 8000,
        });
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
    return next();
  } catch (err) {
    console.error("❌ Error conectando a Mongo:", err);
    mongoInitPromise = null;
    return res.status(500).json({ ok: false, error: "DB connection error" });
  }
});

// =======================
// Helpers
// =======================
function mustInt(v, def, min = 1, max = 200) {
  const n = parseInt(String(v || ""), 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

function normEmail(v) {
  return String(v || "").trim().toLowerCase();
}

function addDays(d, days) {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

// ✅ Compat legacy: /api/servicio?id=... -> /api/servicios/:id
app.get("/api/servicio", (req, res) => {
  const id = String(req.query.id || "").trim();
  if (!id) return res.status(400).json({ error: "ID requerido" });
  return res.redirect(307, `/api/servicios/${encodeURIComponent(id)}`);
});

// =======================
// ✅ NUEVO: Mis servicios (NO favoritos)
// Incluye viejos: matchea usuarioEmail OR contacto
// =======================
app.get("/api/servicios/mios", authRequired, async (req, res) => {
  try {
    const email = normEmail(req.user?.email);
    if (!email) return res.status(401).json({ ok: false, error: "No autorizado" });

    const page = mustInt(req.query.page, 1, 1, 10_000);
    const limit = mustInt(req.query.limit, 12, 1, 60);
    const skip = (page - 1) * limit;

    const filter = {
      $or: [
        { usuarioEmail: email },
        { contacto: email },
        { contactoEmail: email },
        { email: email },
      ],
    };

    const [totalItems, data] = await Promise.all([
      Servicio.countDocuments(filter),
      Servicio.find(filter)
        .sort({
          destacadoHome: -1,
          destacado: -1,
          destacadoHasta: -1,
          actualizadoEn: -1,
          creadoEn: -1,
          _id: -1,
        })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalItems / limit));

    return res.json({
      ok: true,
      page,
      totalPages,
      totalItems,
      data,
    });
  } catch (e) {
    console.error("❌ /api/servicios/mios error:", e);
    return res.status(500).json({ ok: false, error: "Error cargando mis servicios" });
  }
});

// =======================
// ✅ NUEVO: Admin simple con botones (panel admin)
// =======================
function adminRequired(req, res, next) {
  if (!isAdmin(req)) {
    return res.status(403).json({
      ok: false,
      error: "Sin permisos de administrador",
    });
  }
  return next();
}

app.get("/api/admin2/me", authRequired, (req, res) => {
  return res.json({ ok: true, isAdmin: !!isAdmin(req), user: req.user || null });
});

app.get("/api/admin2/servicios", authRequired, adminRequired, async (req, res) => {
  try {
    const page = mustInt(req.query.page, 1, 1, 10_000);
    const limit = mustInt(req.query.limit, 50, 1, 200);
    const skip = (page - 1) * limit;

    const estado = String(req.query.estado || "").trim();
    const revisadoQ = String(req.query.revisado || "").trim();
    const q = String(req.query.q || "").trim();

    const filter = {};
    if (estado) filter.estado = estado;
    if (revisadoQ === "true") filter.revisado = true;
    if (revisadoQ === "false") filter.revisado = false;

    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [
        { nombre: rx },
        { profesionalNombre: rx },
        { oficio: rx },
        { categoria: rx },
        { pueblo: rx },
        { provincia: rx },
        { comunidad: rx },
        { contacto: rx },
        { usuarioEmail: rx },
      ];
    }

    const [totalItems, data] = await Promise.all([
      Servicio.countDocuments(filter),
      Servicio.find(filter)
        .sort({
          destacadoHome: -1,
          destacado: -1,
          destacadoHasta: -1,
          actualizadoEn: -1,
          creadoEn: -1,
          _id: -1,
        })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalItems / limit));

    return res.json({
      ok: true,
      page,
      totalPages,
      totalItems,
      data,
    });
  } catch (e) {
    console.error("❌ /api/admin2/servicios error:", e);
    return res.status(500).json({ ok: false, error: "Error listando servicios" });
  }
});

app.patch("/api/admin2/servicios/:id", authRequired, adminRequired, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "ID requerido" });

    const body = req.body || {};

    const doc = await Servicio.findById(id);
    if (!doc) return res.status(404).json({ ok: false, error: "No encontrado" });

    // estado / revisado
    if (typeof body.estado === "string" && body.estado.trim()) {
      doc.estado = body.estado.trim();
    }
    if (typeof body.revisado === "boolean") {
      doc.revisado = body.revisado;
    }

    // destacados
    const nextDestacado =
      typeof body.destacado === "boolean" ? body.destacado : !!doc.destacado;
    const nextHome =
      typeof body.destacadoHome === "boolean" ? body.destacadoHome : !!doc.destacadoHome;

    doc.destacado = nextDestacado;
    doc.destacadoHome = nextHome;

    // si cualquiera está activo, ponemos vencimiento a 30 días desde ahora
    if (nextDestacado || nextHome) {
      doc.destacadoHasta = addDays(new Date(), 30);
    } else {
      doc.destacadoHasta = null;
    }

    doc.actualizadoEn = new Date();

    await doc.save();

    return res.json({ ok: true, data: doc.toObject() });
  } catch (e) {
    console.error("❌ PATCH /api/admin2/servicios/:id error:", e);
    return res.status(500).json({ ok: false, error: "Error actualizando servicio" });
  }
});

// =======================
// Rutas existentes
// =======================
app.use("/api/servicios", serviciosRoutes);
app.use("/api/favorito", authRequired, favoritoRoutes);
app.use("/api/system", systemRoutes);
app.use("/api/localidades", localidadesRoutes);
app.use("/api/form", formRoutes);
app.use("/api/sitemap", sitemapRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/admin", authRequired, adminRoutes);
app.use("/api/uploads", uploadsRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/featured", featuredRoutes);

module.exports = app;
