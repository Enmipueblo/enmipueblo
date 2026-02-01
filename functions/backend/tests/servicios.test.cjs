"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const mongoose = require("mongoose");

const Servicio = require("../models/servicio.model.js");
const serviciosRoutes = require("../routes/servicios.routes.cjs");

// --------- Helpers DB test (SEGURIDAD: nunca prod) ----------
function ensureTestMongoUri() {
  const raw = process.env.MONGO_URI || "";
  if (!raw) throw new Error("Falta MONGO_URI en el entorno de tests");

  // Intenta forzar dbName *_test sin romper querystring.
  const [base, qs] = raw.split("?");
  const parts = base.split("/");

  // mongodb://user:pass@host:27017/db
  // mongodb+srv://.../db
  let dbName = parts.length >= 4 ? parts[parts.length - 1] : "";
  if (!dbName || dbName.includes("@")) {
    // Si no hay db explícita, agregamos una
    parts.push("enmipueblo_test");
    dbName = "enmipueblo_test";
  } else if (!dbName.endsWith("_test")) {
    parts[parts.length - 1] = `${dbName}_test`;
    dbName = `${dbName}_test`;
  }

  const out = parts.join("/") + (qs ? `?${qs}` : "");

  // CORTAFUEGOS: si no termina en _test, NO corre.
  if (!dbName.endsWith("_test")) {
    throw new Error("Seguridad: DB no es *_test. Abortando tests.");
  }
  if (!/_test(\?|$)/.test(out)) {
    throw new Error("Seguridad: MONGO_URI no apunta a *_test. Abortando tests.");
  }

  return out;
}

function makeApp() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  // Middleware de test para simular authOptional:
  // Si mandas header x-test-user-email => req.user = { email, isAdmin? }
  app.use((req, _res, next) => {
    const email = req.headers["x-test-user-email"];
    if (email) {
      req.user = {
        email: String(email).toLowerCase(),
        isAdmin: String(req.headers["x-test-is-admin"] || "") === "1",
      };
    }
    next();
  });

  app.use("/api/servicios", serviciosRoutes);
  return app;
}

function makeBody(over = {}) {
  return {
    profesionalNombre: "Pro",
    nombre: "Servicio",
    categoria: "Cat",
    oficio: "Oficio",
    descripcion: "Desc",
    contacto: "mail@test.com",
    whatsapp: "",
    pueblo: "Capella",
    provincia: "Huesca",
    comunidad: "Aragón",
    imagenes: [],
    videoUrl: "",
    location: { type: "Point", coordinates: [0.1, 42.1] },
    ...over,
  };
}

// --------- Suite ----------
let server;
let baseUrl;

test.before(async () => {
  const uri = ensureTestMongoUri();
  await mongoose.connect(uri);

  const app = makeApp();
  server = app.listen(0);
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  try {
    await mongoose.disconnect();
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test.beforeEach(async () => {
  await Servicio.deleteMany({});
});

test("GET público vacío => totalPages mínimo 1", async () => {
  const r = await fetch(`${baseUrl}/api/servicios?limit=5`);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.equal(j.totalItems, 0);
  assert.equal(j.totalPages, 1);
  assert.deepEqual(j.data, []);
});

test("Público: solo activos; mine=1: devuelve activos+pendientes del usuario", async () => {
  await Servicio.create([
    {
      ...makeBody({ nombre: "Activo" }),
      usuarioEmail: "a@a.com",
      estado: "activo",
    },
    {
      ...makeBody({ nombre: "Pendiente" }),
      usuarioEmail: "a@a.com",
      estado: "pendiente",
    },
  ]);

  // público => solo 1 (activo)
  {
    const r = await fetch(`${baseUrl}/api/servicios?limit=10`);
    const j = await r.json();
    assert.equal(j.totalItems, 1);
    assert.equal(j.data.length, 1);
    assert.equal(j.data[0].estado, "activo");
    // en público NO debe venir usuarioEmail
    assert.equal("usuarioEmail" in j.data[0], false);
  }

  // mine=1 => 2 (activo + pendiente) y sí trae usuarioEmail
  {
    const r = await fetch(`${baseUrl}/api/servicios?mine=1&limit=10`, {
      headers: { "x-test-user-email": "a@a.com" },
    });
    const j = await r.json();
    assert.equal(j.totalItems, 2);
    assert.equal(j.data.length, 2);
    assert.equal(j.data.every((x) => x.usuarioEmail === "a@a.com"), true);
  }
});

test("POST /api/servicios requiere auth; con auth crea en pendiente", async () => {
  // sin auth => 401
  {
    const r = await fetch(`${baseUrl}/api/servicios`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(makeBody()),
    });
    assert.equal(r.status, 401);
  }

  // con auth => ok + pendiente
  {
    const r = await fetch(`${baseUrl}/api/servicios`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-user-email": "u@test.com",
      },
      body: JSON.stringify(makeBody({ nombre: "Nuevo" })),
    });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.ok, true);
    assert.equal(j.servicio.estado, "pendiente");
    assert.equal(j.servicio.revisado, false);
    assert.equal(j.servicio.destacado, false);
  }
});

test("PUT por owner no-admin: si estaba activo => vuelve a pendiente y limpia destacados", async () => {
  const created = await Servicio.create({
    ...makeBody({ nombre: "EditMe" }),
    usuarioEmail: "owner@test.com",
    estado: "activo",
    revisado: true,
    destacado: true,
    destacadoHasta: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    destacadoHome: true,
  });

  const r = await fetch(`${baseUrl}/api/servicios/${created._id}`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-test-user-email": "owner@test.com",
    },
    body: JSON.stringify({ descripcion: "Nueva desc" }),
  });

  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);

  assert.equal(j.servicio.estado, "pendiente");
  assert.equal(j.servicio.revisado, false);
  assert.equal(j.servicio.destacado, false);
  assert.equal(j.servicio.destacadoHome, false);
});
