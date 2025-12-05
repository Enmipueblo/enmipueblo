// functions/index.cjs
const { onRequest } = require("firebase-functions/v2/https");
const express = require("express");
const cors = require("cors");
const app = require("./backend/app.cjs");

const firebaseApp = express();

// CORS solo desde tus dominios
firebaseApp.use(
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

// Montamos el backend Express
firebaseApp.use(app);

// Función HTTPS principal
exports.api = onRequest(
  {
    region: "us-central1",
    // 👇 TODOS los secrets que usamos en el backend
    secrets: [
      "MONGO_URI",
      "CONTACT_EMAIL_USER",
      "CONTACT_EMAIL_PASS",
      "CONTACT_EMAIL_TO",
    ],
  },
  firebaseApp
);
