// functions/index.cjs
const { onRequest } = require("firebase-functions/v2/https");
const express = require("express");
const cors = require("cors");
const app = require("./backend/app.cjs");

const firebaseApp = express();

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

firebaseApp.use(app);

exports.api = onRequest(
  {
    region: "us-central1",
    secrets: ["MONGO_URI"], // 👈 acá es donde se inyecta el secret en producción
  },
  firebaseApp
);
