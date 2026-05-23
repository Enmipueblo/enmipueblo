#!/usr/bin/env node
// scripts/smoke-test.cjs
// Smoke test automático contra producción (o staging).
// Ejecuta checks reales contra la URL del site y reporta pass/fail.
//
// USO:
//   node scripts/smoke-test.cjs                          # usa https://enmipueblo.com
//   SITE_URL=http://localhost:8080 node scripts/smoke-test.cjs  # local
//
// Requiere Node 18+ (fetch nativo)

const BASE = (process.env.SITE_URL || "https://enmipueblo.com").replace(/\/$/, "");
const API  = `${BASE}/api`;

const GREEN  = "\x1b[32m✅";
const RED    = "\x1b[31m❌";
const YELLOW = "\x1b[33m⚠️ ";
const RESET  = "\x1b[0m";

let passed = 0;
let failed = 0;
let warned = 0;

async function check(label, fn) {
  try {
    const result = await fn();
    if (result?.warn) {
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

async function get(path, opts = {}) {
  const url = path.startsWith("http") ? path : `${API}${path}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), ...opts });
  return res;
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || "Assertion failed");
}

// ─────────────────────────────────────────────────────────────
console.log(`\n🔍 Smoke test → ${BASE}\n`);

// 1. HEALTH
await check("GET /api/health → ok:true", async () => {
  const res = await get("/health");
  assert(res.status === 200, `Status ${res.status}`);
  const j = await res.json();
  assert(j?.ok === true, `ok!=true: ${JSON.stringify(j)}`);
});

// 2. SERVICIOS lista pública
await check("GET /api/servicios → devuelve array", async () => {
  const res = await get("/servicios?limit=3");
  assert(res.status === 200, `Status ${res.status}`);
  const j = await res.json();
  assert(j?.ok === true, `ok!=true`);
  assert(Array.isArray(j?.data), `data no es array`);
});

// 3. FEATURED portada
await check("GET /api/featured/portada → devuelve array", async () => {
  const res = await get("/featured/portada?limit=3");
  assert(res.status === 200, `Status ${res.status}`);
  const j = await res.json();
  assert(j?.ok === true, `ok!=true`);
  assert(Array.isArray(j?.data), `data no es array`);
});

// 4. FEATURED search
await check("GET /api/featured/search → paginación ok", async () => {
  const res = await get("/featured/search?page=1&limit=3");
  assert(res.status === 200, `Status ${res.status}`);
  const j = await res.json();
  assert(j?.ok === true, `ok!=true`);
  assert(typeof j?.totalPages === "number", `sin totalPages`);
  assert(typeof j?.page === "number", `sin page`);
});

// 5. LOCALIDADES buscar
await check("GET /api/localidades?q=Madrid → resultados", async () => {
  const res = await get("/localidades?q=Madrid");
  assert(res.status === 200, `Status ${res.status}`);
  const j = await res.json();
  const data = j?.data || j;
  assert(Array.isArray(data), `No devuelve array: ${JSON.stringify(j).slice(0,100)}`);
});

// 6. UPLOADS sin auth → 401
await check("POST /api/uploads/upload sin token → 401", async () => {
  const res = await get("/uploads/upload", { method: "POST" });
  assert(res.status === 401, `Esperaba 401, got ${res.status}`);
});

// 7. UPLOADS /sign → 401 o 410 (deprecated)
await check("POST /api/uploads/sign → 401 o 410 (deprecated)", async () => {
  const res = await get("/uploads/sign", { method: "POST" });
  assert([401, 410].includes(res.status), `Esperaba 401/410, got ${res.status}`);
});

// 8. FAVORITO sin auth → 401
await check("GET /api/favorito sin token → 401", async () => {
  const res = await get("/favorito");
  assert(res.status === 401, `Esperaba 401, got ${res.status}`);
});

// 9. ADMIN2 sin auth → 401
await check("GET /api/admin2/me sin token → 401", async () => {
  const res = await get("/admin2/me");
  assert(res.status === 401, `Esperaba 401, got ${res.status}`);
});

// 10. CONTACT sin body → 400 o 422 (no 404)
await check("POST /api/contact sin body → no 404 (ruta montada)", async () => {
  const res = await get("/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert(res.status !== 404, `La ruta /contact devuelve 404 — no está montada`);
});

// 11. BILLING /me → responde (sin auth = usuario null)
await check("GET /api/billing/me sin auth → ok:true user:null", async () => {
  const res = await get("/billing/me");
  assert(res.status === 200, `Status ${res.status}`);
  const j = await res.json();
  assert(j?.ok === true, `ok!=true`);
  assert(j?.user === null, `user debería ser null sin auth`);
});

// 12. SYSTEM /debug
await check("GET /api/system/debug → ok:true", async () => {
  const res = await get("/system/debug");
  assert(res.status === 200, `Status ${res.status}`);
  const j = await res.json();
  assert(j?.ok === true, `ok!=true`);
});

// 13. SITEMAP servicios
await check("GET /api/sitemap-servicios.xml → XML válido", async () => {
  const res = await get("/sitemap-servicios.xml");
  assert(res.status === 200, `Status ${res.status}`);
  const ct = res.headers.get("content-type") || "";
  const body = await res.text();
  assert(body.includes("<?xml") || body.includes("<urlset"), `No parece XML`);
});

// 14. Frontend carga (HTML público)
await check("GET / → devuelve HTML con enmipueblo", async () => {
  const res = await fetch(BASE, { signal: AbortSignal.timeout(8000) });
  assert(res.status === 200, `Status ${res.status}`);
  const body = await res.text();
  assert(body.toLowerCase().includes("enmipueblo"), `HTML sin 'enmipueblo'`);
});

// 15. Servicio inexistente → 404 JSON (no crash)
await check("GET /api/servicios/000000000000000000000000 → 404 JSON", async () => {
  const res = await get("/servicios/000000000000000000000000");
  assert(res.status === 404, `Esperaba 404, got ${res.status}`);
  const j = await res.json().catch(() => null);
  assert(j !== null, `No devuelve JSON en 404`);
});

// ─────────────────────────────────────────────────────────────
console.log(`
────────────────────────────────────
 ✅ Passed:  ${passed}
 ⚠️  Warnings: ${warned}
 ❌ Failed:  ${failed}
────────────────────────────────────`);

if (failed > 0) process.exit(1);
