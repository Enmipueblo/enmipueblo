const express = require("express");
const cors = require("cors");

const server = express();

// Health SIEMPRE (aunque el backend reviente)
server.get("/api/health", (_req, res) => res.json({ ok: true, source: "vps" }));

server.use(
  cors({
    origin: [
      "https://enmipueblo.com",
      "https://www.enmipueblo.com",
      "https://enmipueblo-2504f.web.app",
      "https://enmipueblo-2504f.firebaseapp.com",
      "http://localhost:4321",
      "http://127.0.0.1:4321",
    ],
    credentials: true,
  })
);

// Cargar tu app real (si falla, no tumbamos el server)
try {
  const app = require("./backend/app.cjs");
  server.use(app);
  console.log("✅ backend/app.cjs cargado");
} catch (err) {
  console.error("❌ Error cargando backend/app.cjs:", err && err.stack ? err.stack : err);
  server.get("/api/_boot_error", (_req, res) =>
    res.status(500).json({ ok: false, error: "backend/app.cjs failed to load (see logs)" })
  );
}

const PORT = process.env.PORT || 8081;
const HOST = process.env.HOST || "0.0.0.0";

server.listen(PORT, HOST, () => {
  console.log(`✅ Backend standalone listening on http://${HOST}:${PORT}`);
});
