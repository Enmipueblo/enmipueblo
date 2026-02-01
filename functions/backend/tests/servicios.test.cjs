// functions/backend/tests/servicios.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const mongoose = require("mongoose");

const Servicio = require("../models/servicio.model.js");
const serviciosRoutes = require("../routes/servicios.routes.cjs");

let server;
let baseUrl;

function makeApp() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  // Auth fake solo para tests:
  // - x-test-user: email
  // - x-test-admin: "1" => isAdmin
  app.use((req, _res, next) => {
    const email = String(req.headers["x-test-user"] || "").trim().toLowerCase();
    if (email) {
      req.user = {
        email,
        isAdmin: String(req.headers["x-test-admin"] || "") === "1",
      };
    }
    next();
  });

  app.use("/api/servicios", serviciosRoutes);
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

function serviceDoc({ email, estado, revisado = false, destacado = false, destacadoHasta = null, destacadoHome = false, nombre = "Servicio", pueblo = "Capella" }) {
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
