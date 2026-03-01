// functions/server.cjs
const http = require("http");

const PORT = Number(process.env.PORT || 8081);
const HOST = process.env.HOST || "0.0.0.0";

// Cargar la app Express REAL
const app = require("./backend/app.cjs");

// Crear server HTTP (por compatibilidad y para logs claros)
const server = http.createServer(app);

server.listen(PORT, HOST, () => {
  console.log(`✅ Backend standalone listening on http://${HOST}:${PORT}`);
});