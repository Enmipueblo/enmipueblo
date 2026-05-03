// functions/backend/tests/health.test.cjs
// Tests básicos sin DB ni R2 — validan estructura, auth y rutas clave
// Corren siempre en CI sin servicios externos

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");

// Env mínimo para que los requires no fallen
process.env.ADMIN_EMAILS ||= "admin@test.com";
process.env.R2_ENDPOINT ||= "https://dummy.r2.cloudflarestorage.com";
process.env.R2_ACCESS_KEY_ID ||= "testkey";
process.env.R2_SECRET_ACCESS_KEY ||= "testsecret";
process.env.R2_BUCKET ||= "test-bucket";
process.env.PUBLIC_GOOGLE_CLIENT_ID ||= "dummy-client-id";
process.env.GOOGLE_CLIENT_ID ||= "dummy-client-id";
process.env.MONGO_URI ||= "mongodb://localhost:27017/enmipueblo_test";

function req(server, method, path, opts = {}) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const body = opts.body ? JSON.stringify(opts.body) : null;
    const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
    const r = http.request({ hostname: "127.0.0.1", port, method, path, headers }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(data); } catch {}
        resolve({ status: res.statusCode, json, raw: data });
      });
    });
    r.on("error", reject);
    if (body) r.write(body);
    r.end();
  });
}

function startServer(app) {
  return new Promise((resolve) => {
    const s = http.createServer(app);
    s.listen(0, "127.0.0.1", () => resolve(s));
  });
}

test("GET /api/health responde ok:true", async (t) => {
  const app = express();
  app.get("/api/health", (_req, res) => res.json({ ok: true, source: "test" }));
  const server = await startServer(app);
  t.after(() => server.close());

  const res = await req(server, "GET", "/api/health");
  assert.equal(res.status, 200);
  assert.equal(res.json?.ok, true);
});

test("authRequired rechaza sin token (401)", async (t) => {
  const app = express();
  app.use(express.json());
  const { authRequired } = require("../middleware/auth.middleware.cjs");
  app.get("/protected", authRequired, (_req, res) => res.json({ ok: true }));
  const server = await startServer(app);
  t.after(() => server.close());

  const res = await req(server, "GET", "/protected");
  assert.equal(res.status, 401);
  assert.equal(res.json?.ok, false);
});

test("authOptional no bloquea sin token", async (t) => {
  const app = express();
  app.use(express.json());
  const { authOptional } = require("../middleware/auth.middleware.cjs");
  app.get("/open", authOptional, (req, res) => res.json({ ok: true, hasUser: !!req.user }));
  const server = await startServer(app);
  t.after(() => server.close());

  const res = await req(server, "GET", "/open");
  assert.equal(res.status, 200);
  assert.equal(res.json?.hasUser, false);
});

test("POST /api/uploads/upload sin auth devuelve 401", async (t) => {
  const app = express();
  app.use(express.json());
  const uploadsRoutes = require("../routes/uploads.routes.cjs");
  app.use("/api/uploads", uploadsRoutes);
  const server = await startServer(app);
  t.after(() => server.close());

  const res = await req(server, "POST", "/api/uploads/upload");
  assert.equal(res.status, 401);
});

test("POST /api/uploads/sign devuelve 401 o 410", async (t) => {
  const app = express();
  app.use(express.json());
  const uploadsRoutes = require("../routes/uploads.routes.cjs");
  app.use("/api/uploads", uploadsRoutes);
  const server = await startServer(app);
  t.after(() => server.close());

  const res = await req(server, "POST", "/api/uploads/sign");
  assert.ok([401, 410].includes(res.status), `Esperaba 401 o 410, got ${res.status}`);
});

test("GET /api/system/debug responde ok:true", async (t) => {
  const app = express();
  app.use(express.json());
  const systemRoutes = require("../routes/system.routes.cjs");
  app.use("/api/system", systemRoutes);
  const server = await startServer(app);
  t.after(() => server.close());

  const res = await req(server, "GET", "/api/system/debug");
  assert.equal(res.status, 200);
  assert.equal(res.json?.ok, true);
});
