// functions/backend/tests/servicios.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const mongoose = require("mongoose");

const Servicio = require("../models/servicio.model.js");
const serviciosRoutes = require("../routes/servicios.routes.cjs");

// Defaults seguros para tests (evitan que algún require reviente por env faltante)
process.env.ADMIN_EMAILS ||= "admin@test.com";
process.env.R2_ENDPOINT ||= "https://dummy.r2.cloudflarestorage.com";
process.env.R2_ACCESS_KEY_ID ||= "test";
process.env.R2_SECRET_ACCESS_KEY ||= "test";
process.env.R2_BUCKET ||= "test-bucket";
process.env.MEDIA_PUBLIC_BASE_URL ||= "https://media.enmipueblo.com";

let server;
let baseUrl;

// para test de uploads (auto-descubrir una ruta real)
let uploadsFirstRoute = null;

function lowerTrim(s) {
  return String(s || "").trim().toLowerCase();
}

function parseAdminEmails() {
  return String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map(lowerTrim)
    .filter(Boolean);
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "No autorizado" });
  next();
}

function pickFirstRoute(router) {
  // Busca el primer layer con route (sin meternos en routers anidados complejos)
  try {
    for (const layer of router.stack || []) {
      if (layer?.route?.path && layer?.route?.methods) {
        const methods = Object.keys(layer.route.methods).filter((m) => layer.route.methods[m]);
        if (methods.length) {
          return {
            path: layer.route.path, // ej: "/presign"
            method: methods[0].toUpperCase(), // ej: "POST"
          };
        }
      }
    }
  } catch {}
  return null;
}

function materializePath(path) {
  // Reemplaza params tipo ":id" por "test"
  return String(path || "").replace(/:([A-Za-z0-9_]+)/g, "test");
}

function makeApp() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  // Auth fake solo para tests:
  // - x-test-user: email
  // Calcula isAdmin por:
  //   a) header x-test-admin=1, o
  //   b) email está dentro de ADMIN_EMAILS
  app.use((req, _res, next) => {
    const email = lowerTrim(req.headers["x-test-user"]);
    if (email) {
      const adminByHeader = String(req.headers["x-test-admin"] || "") === "1";
      const adminByEnv = parseAdminEmails().includes(email);
      req.user = { email, isAdmin: adminByHeader || adminByEnv };
    }
    next();
  });

  // Rutas del proyecto
  app.use("/api/servicios", serviciosRoutes);

  // Admin: en prod va con authRequired antes del router
  const adminRoutes = require("../routes/admin.routes.cjs");
  app.use("/api/admin", requireAuth, adminRoutes);

  // Uploads: en prod va sin authRequired global, el router debe proteger lo sensible
  const uploadsRoutes = require("../routes/uploads.routes.cjs");
  uploadsFirstRoute = pickFirstRoute(uploadsRoutes);
  app.use("/api/uploads", uploadsRoutes);

  return app;
}

async function startServer(app) {
  return await new Promise((resolve) => {
    const s = http.createServer(app);
    s.listen(0, "127.0.0.1", () => resolve(s));
  });
}

async function stopServer(s) {
  if (!s) return;
  await new Promise((resolve) => s.close(resolve));
}

async function seed(docs) {
  await Servicio.insertMany(docs);
}

function serviceDoc({
  email,
  estado,
  revisado = false,
  destacado = false,
  destacadoHasta = null,
  destacadoHome = false,
  nombre = "Servicio",
  pueblo = "Capella",
}) {
  return {
    profesionalNombre: "Pro",
    nombre,
    categoria: "Cat",
    oficio: "Of",
    descripcion: "Desc",
    contacto: "Contacto",
    whatsapp: "",
    pueblo,
    provincia: "Huesca",
    comunidad: "Aragón",
    imagenes: [],
    videoUrl: "",
    usuarioEmail: email,
    estado,
    revisado,
    destacado,
    destacadoHasta,
    destacadoHome,
  };
}

test.before(async () => {
  // setup.cjs ya obligó a DB *_test
  await mongoose.connect(process.env.MONGO_URI);

  // Limpieza total de DB test
  await mongoose.connection.dropDatabase();

  const app = makeApp();
  server = await startServer(app);
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

test.after(async () => {
  try {
    await stopServer(server);
  } finally {
    try {
      await mongoose.disconnect();
    } catch {}
  }
});

test.beforeEach(async () => {
  await Servicio.deleteMany({});
});

test("GET público vacío => totalPages mínimo 1", async () => {
  const r = await fetch(`${baseUrl}/api/servicios?limit=10`);
  assert.equal(r.status, 200);
  const j = await r.json();

  assert.equal(j.ok, true);
  assert.equal(j.totalItems, 0);
  assert.equal(j.totalPages, 1);
  assert.deepEqual(j.data, []);
});

test("Público: solo activos y oculta usuarioEmail", async () => {
  await seed([
    serviceDoc({ email: "a@test.com", estado: "activo", revisado: true, nombre: "A1" }),
    serviceDoc({ email: "a@test.com", estado: "pendiente", revisado: false, nombre: "A2" }),
    serviceDoc({ email: "b@test.com", estado: "activo", revisado: true, nombre: "B1" }),
  ]);

  const r = await fetch(`${baseUrl}/api/servicios?limit=50`);
  const j = await r.json();

  assert.equal(j.ok, true);
  assert.equal(j.totalItems, 2);
  assert.equal(j.data.length, 2);

  // En público, usuarioEmail no debe venir
  for (const s of j.data) {
    assert.equal(s.usuarioEmail, undefined);
    assert.equal(s.estado, "activo");
  }
});

test("mine=1: devuelve activos+pendientes del usuario y NO oculta usuarioEmail", async () => {
  await seed([
    serviceDoc({ email: "a@test.com", estado: "activo", revisado: true, nombre: "A1" }),
    serviceDoc({ email: "a@test.com", estado: "pendiente", revisado: false, nombre: "A2" }),
    serviceDoc({ email: "b@test.com", estado: "activo", revisado: true, nombre: "B1" }),
  ]);

  const r = await fetch(`${baseUrl}/api/servicios?mine=1&limit=50`, {
    headers: { "x-test-user": "a@test.com" },
  });
  assert.equal(r.status, 200);
  const j = await r.json();

  assert.equal(j.ok, true);
  assert.equal(j.totalItems, 2);
  assert.equal(j.data.length, 2);

  for (const s of j.data) {
    assert.equal(String(s.usuarioEmail || "").toLowerCase(), "a@test.com");
  }
});

test("POST /api/servicios requiere auth; con auth crea en pendiente", async () => {
  // sin auth
  const r1 = await fetch(`${baseUrl}/api/servicios`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(r1.status, 401);

  // con auth
  const payload = {
    profesionalNombre: "Nico",
    nombre: "Servicio Test",
    categoria: "Cat",
    oficio: "Of",
    descripcion: "Desc",
    contacto: "Contacto",
    whatsapp: "",
    pueblo: "Capella",
    provincia: "Huesca",
    comunidad: "Aragón",
    imagenes: [],
    videoUrl: "",
  };

  const r2 = await fetch(`${baseUrl}/api/servicios`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-test-user": "c@test.com",
    },
    body: JSON.stringify(payload),
  });
  assert.equal(r2.status, 200);
  const j = await r2.json();

  assert.equal(j.ok, true);
  assert.equal(j.servicio.estado, "pendiente");
  assert.equal(j.servicio.revisado, false);

  const inDb = await Servicio.findById(j.servicio._id).lean();
  assert.equal(inDb.estado, "pendiente");
  assert.equal(inDb.revisado, false);
  assert.equal(String(inDb.usuarioEmail).toLowerCase(), "c@test.com");
});

test("PUT por owner no-admin: si estaba activo => vuelve a pendiente y limpia destacados", async () => {
  const hasta = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

  const created = await Servicio.create(
    serviceDoc({
      email: "owner@test.com",
      estado: "activo",
      revisado: true,
      destacado: true,
      destacadoHasta: hasta,
      destacadoHome: true,
      nombre: "Antes",
    })
  );

  const r = await fetch(`${baseUrl}/api/servicios/${created._id}`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-test-user": "owner@test.com", // owner, no admin
    },
    body: JSON.stringify({ nombre: "Despues" }),
  });

  assert.equal(r.status, 200);
  const j = await r.json();

  assert.equal(j.ok, true);
  assert.equal(j.servicio.nombre, "Despues");
  assert.equal(j.servicio.estado, "pendiente");
  assert.equal(j.servicio.revisado, false);
  assert.equal(j.servicio.destacado, false);
  assert.equal(j.servicio.destacadoHasta, null);
  assert.equal(j.servicio.destacadoHome, false);
});

test("Admin /api/admin/me: sin auth => 401; con user => isAdmin false; con admin => true", async () => {
  // sin auth
  const r0 = await fetch(`${baseUrl}/api/admin/me`);
  assert.equal(r0.status, 401);

  // user normal (no admin)
  const r1 = await fetch(`${baseUrl}/api/admin/me`, {
    headers: { "x-test-user": "user@test.com" },
  });
  assert.equal(r1.status, 200);
  const j1 = await r1.json();

  assert.equal(j1.ok, true);
  assert.equal(String(j1.user?.email || "").toLowerCase(), "user@test.com");
  assert.equal(!!j1.user?.isAdmin, false);

  // admin (por ADMIN_EMAILS default = admin@test.com)
  const r2 = await fetch(`${baseUrl}/api/admin/me`, {
    headers: { "x-test-user": "admin@test.com" },
  });
  assert.equal(r2.status, 200);
  const j2 = await r2.json();

  assert.equal(j2.ok, true);
  assert.equal(String(j2.user?.email || "").toLowerCase(), "admin@test.com");
  assert.equal(!!j2.user?.isAdmin, true);
});

test("Moderación: pendiente NO sale en público; al activar SÍ sale (y oculta usuarioEmail)", async () => {
  const created = await Servicio.create(
    serviceDoc({
      email: "m@test.com",
      estado: "pendiente",
      revisado: false,
      nombre: "Pendiente",
    })
  );

  // público: no debe aparecer
  const r1 = await fetch(`${baseUrl}/api/servicios?limit=50`);
  assert.equal(r1.status, 200);
  const j1 = await r1.json();
  assert.equal(j1.ok, true);
  assert.equal(j1.totalItems, 0);

  // activar
  await Servicio.updateOne({ _id: created._id }, { $set: { estado: "activo", revisado: true } });

  const r2 = await fetch(`${baseUrl}/api/servicios?limit=50`);
  assert.equal(r2.status, 200);
  const j2 = await r2.json();

  assert.equal(j2.ok, true);
  assert.equal(j2.totalItems, 1);
  assert.equal(j2.data.length, 1);
  assert.equal(j2.data[0].nombre, "Pendiente");
  assert.equal(j2.data[0].estado, "activo");
  assert.equal(j2.data[0].usuarioEmail, undefined); // público: oculto
});

test(
  "Uploads: sin auth debe rechazar (401/403) (auto-descubre una ruta del router)",
  { skip: !uploadsFirstRoute },
  async () => {
    const method = uploadsFirstRoute.method;
    const path = materializePath(uploadsFirstRoute.path);
    const url = `${baseUrl}/api/uploads${path.startsWith("/") ? "" : "/"}${path}`;

    const opts = { method, headers: {} };

    // Si no es GET, mandamos body mínimo por si lo requiere
    if (method !== "GET" && method !== "HEAD") {
      opts.headers["content-type"] = "application/json";
      opts.body = JSON.stringify({});
    }

    const r = await fetch(url, opts);

    // “rechazar por no-auth”: aceptamos 401 o 403 (según implementación)
    assert.ok([401, 403].includes(r.status), `Esperaba 401/403 sin auth, llegó ${r.status} en ${method} ${path}`);
  }
);
