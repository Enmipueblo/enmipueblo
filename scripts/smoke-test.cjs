#!/usr/bin/env node
// scripts/smoke-test.cjs
// Smoke test contra producción. Requiere Node 18+.
// USO:
//   node scripts/smoke-test.cjs
//   SITE_URL=http://localhost:8080 node scripts/smoke-test.cjs

const BASE = (process.env.SITE_URL || "https://enmipueblo.com").replace(/\/$/, "");
const API  = `${BASE}/api`;

const GREEN  = "\x1b[32m\u2705";
const RED    = "\x1b[31m\u274C";
const YELLOW = "\x1b[33m\u26A0\uFE0F ";
const RESET  = "\x1b[0m";

let passed = 0, failed = 0, warned = 0;

async function check(label, fn) {
  try {
    const result = await fn();
    if (result && result.warn) {
      console.log(`${YELLOW} ${label}${RESET} — ${result.warn}`);
      warned++;
    } else {
      console.log(`${GREEN} ${label}${RESET}`);
      passed++;
    }
  } catch (e) {
    console.log(`${RED} ${label}${RESET} — ${e.message}`);
    failed++;
  }
}

async function get(path, opts) {
  const url = path.startsWith("http") ? path : `${API}${path}`;
  return fetch(url, Object.assign({ signal: AbortSignal.timeout(8000) }, opts || {}));
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || "Assertion failed");
}

async function main() {
  console.log("\n\uD83D\uDD0D Smoke test -> " + BASE + "\n");

  await check("GET /api/health -> ok:true", async function() {
    const res = await get("/health");
    assert(res.status === 200, "Status " + res.status);
    const j = await res.json();
    assert(j && j.ok === true, "ok!=true: " + JSON.stringify(j));
  });

  await check("GET /api/servicios -> devuelve array", async function() {
    const res = await get("/servicios?limit=3");
    assert(res.status === 200, "Status " + res.status);
    const j = await res.json();
    assert(j && j.ok === true, "ok!=true");
    assert(Array.isArray(j.data), "data no es array");
  });

  await check("GET /api/featured/portada -> devuelve array", async function() {
    const res = await get("/featured/portada?limit=3");
    assert(res.status === 200, "Status " + res.status);
    const j = await res.json();
    assert(j && j.ok === true, "ok!=true");
    assert(Array.isArray(j.data), "data no es array");
  });

  await check("GET /api/featured/search -> paginacion ok", async function() {
    const res = await get("/featured/search?page=1&limit=3");
    assert(res.status === 200, "Status " + res.status);
    const j = await res.json();
    assert(j && j.ok === true, "ok!=true");
    assert(typeof j.totalPages === "number", "sin totalPages");
  });

  await check("GET /api/localidades?q=Madrid -> resultados", async function() {
    const res = await get("/localidades?q=Madrid");
    assert(res.status === 200, "Status " + res.status);
    const j = await res.json();
    const data = j.data || j;
    assert(Array.isArray(data), "No devuelve array");
  });

  await check("POST /api/uploads/upload sin token -> 401", async function() {
    const res = await get("/uploads/upload", { method: "POST" });
    assert(res.status === 401, "Esperaba 401, got " + res.status);
  });

  await check("POST /api/uploads/sign -> 401 o 410 (deprecated)", async function() {
    const res = await get("/uploads/sign", { method: "POST" });
    assert(res.status === 401 || res.status === 410, "Esperaba 401/410, got " + res.status);
  });

  await check("GET /api/favorito sin token -> 401", async function() {
    const res = await get("/favorito");
    assert(res.status === 401, "Esperaba 401, got " + res.status);
  });

  await check("GET /api/admin2/me sin token -> 401", async function() {
    const res = await get("/admin2/me");
    assert(res.status === 401, "Esperaba 401, got " + res.status);
  });

  await check("POST /api/contact sin body -> no 404 (ruta montada)", async function() {
    const res = await get("/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert(res.status !== 404, "La ruta /contact devuelve 404 — no montada");
  });

  await check("GET /api/billing/me sin auth -> ok:true user:null", async function() {
    const res = await get("/billing/me");
    assert(res.status === 200, "Status " + res.status);
    const j = await res.json();
    assert(j && j.ok === true, "ok!=true");
    assert(j.user === null, "user deberia ser null sin auth, got: " + JSON.stringify(j.user));
  });

  await check("GET /api/system/debug -> ok:true", async function() {
    const res = await get("/system/debug");
    assert(res.status === 200, "Status " + res.status);
    const j = await res.json();
    assert(j && j.ok === true, "ok!=true");
  });

  await check("GET /api/sitemap-servicios.xml -> XML valido", async function() {
    const res = await get("/sitemap-servicios.xml");
    assert(res.status === 200, "Status " + res.status);
    const body = await res.text();
    assert(body.includes("<?xml") || body.includes("<urlset"), "No parece XML");
  });

  await check("GET / -> devuelve HTML con enmipueblo", async function() {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(8000) });
    assert(res.status === 200, "Status " + res.status);
    const body = await res.text();
    assert(body.toLowerCase().includes("enmipueblo"), "HTML sin 'enmipueblo'");
  });

  await check("GET /api/servicios/000000000000000000000000 -> 404 JSON", async function() {
    const res = await get("/servicios/000000000000000000000000");
    assert(res.status === 404, "Esperaba 404, got " + res.status);
    const j = await res.json().catch(function() { return null; });
    assert(j !== null, "No devuelve JSON en 404");
  });

  console.log("\n------------------------------------");
  console.log(" Passed:   " + passed);
  console.log(" Warnings: " + warned);
  console.log(" Failed:   " + failed);
  console.log("------------------------------------\n");

  if (failed > 0) process.exit(1);
}

main().catch(function(e) {
  console.error("Error fatal:", e);
  process.exit(1);
});
