"use strict";

// ✅ CAMBIO DE ARQUITECTURA: el backend hace el PutObject a R2 directamente.
// El navegador nunca habla con r2.cloudflarestorage.com → sin CORS → sin 403.
// Antes: frontend → (presigned URL) → R2 directamente  ← CORS 403
// Ahora: frontend → backend /api/uploads/upload → R2    ← sin CORS

const express = require("express");
const crypto = require("crypto");
const path = require("path");
const multer = require("multer");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { authRequired } = require("../middleware/auth.middleware.cjs");

const router = express.Router();

// Multer en memoria (no escribe a disco)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 45 * 1024 * 1024 },
});

const ALLOWED_FOLDERS = new Set([
  "service_images/fotos",
  "service_images/video",
]);

function pickEnv(...names) {
  for (const name of names) {
    const v = process.env[name];
    if (v && String(v).trim()) return String(v).trim();
  }
  return "";
}

function mustEnv(...names) {
  const v = pickEnv(...names);
  if (!v) {
    console.error("❌ mustEnv falla: " + names.join(" / "));
    console.error("   R2 keys: " + Object.keys(process.env).filter(k => /^(R2|CF|CLOUD)/i.test(k)).join(", "));
    throw new Error("Falta env: " + names.join(" / "));
  }
  return v;
}

function getR2Endpoint() {
  const direct = pickEnv("R2_ENDPOINT","CLOUDFLARE_R2_ENDPOINT","CF_R2_ENDPOINT","S3_ENDPOINT");
  if (direct) return direct;
  const accountId = pickEnv("R2_ACCOUNT_ID","CLOUDFLARE_ACCOUNT_ID","CF_ACCOUNT_ID");
  if (accountId) return `https://${accountId}.r2.cloudflarestorage.com`;
  throw new Error("Falta env: R2_ENDPOINT o R2_ACCOUNT_ID");
}

function getBucket() {
  return mustEnv("R2_BUCKET","R2_BUCKET_NAME","CLOUDFLARE_R2_BUCKET","CF_R2_BUCKET","BUCKET_NAME","S3_BUCKET");
}

function getPublicBase() {
  return String(
    pickEnv("R2_PUBLIC_BASE_URL","MEDIA_PUBLIC_BASE_URL","CLOUDFLARE_R2_PUBLIC_BASE_URL") ||
    "https://media.enmipueblo.com"
  ).replace(/\/$/, "");
}

let _r2 = null;
function getR2() {
  if (_r2) return _r2;
  _r2 = new S3Client({
    region: pickEnv("R2_REGION","AWS_REGION") || "auto",
    endpoint: getR2Endpoint(),
    credentials: {
      accessKeyId: mustEnv("R2_ACCESS_KEY_ID","CLOUDFLARE_R2_ACCESS_KEY_ID","AWS_ACCESS_KEY_ID"),
      secretAccessKey: mustEnv("R2_SECRET_ACCESS_KEY","CLOUDFLARE_R2_SECRET_ACCESS_KEY","AWS_SECRET_ACCESS_KEY"),
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return _r2;
}

function safeOwner(req) {
  return String(req.user?.email || "anon").trim().toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_").slice(0, 120) || "anon";
}

function inferExtension(filename, contentType) {
  const ext = path.extname(String(filename || "")).toLowerCase();
  if (ext) return ext;
  const ct = String(contentType || "").toLowerCase();
  if (ct.includes("webp")) return ".webp";
  if (ct.includes("jpeg") || ct.includes("jpg")) return ".jpg";
  if (ct.includes("png")) return ".png";
  if (ct.includes("gif")) return ".gif";
  if (ct.includes("mp4")) return ".mp4";
  if (ct.includes("webm")) return ".webm";
  if (ct.includes("quicktime")) return ".mov";
  return "";
}

// POST /api/uploads/upload  — multipart, campo "file" + campo "folder"
router.post("/upload", authRequired, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: "No se recibió archivo (campo: file)" });
    }

    const folder = String(req.body?.folder || "").trim();
    if (!ALLOWED_FOLDERS.has(folder)) {
      return res.status(400).json({ ok: false, error: `Carpeta no permitida: "${folder}"` });
    }

    const owner = safeOwner(req);
    const ext = inferExtension(req.file.originalname, req.file.mimetype);
    const base = path.basename(String(req.file.originalname || "archivo"))
      .replace(/\s+/g, "_").replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/\.[^.]+$/, "").slice(0, 80) || "archivo";
    const key = `${folder}/${owner}/${Date.now()}-${crypto.randomUUID()}-${base}${ext}`;

    await getR2().send(new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype || "application/octet-stream",
      ContentLength: req.file.size,
    }));

    const publicUrl = `${getPublicBase()}/${key}`;
    console.log(`✅ Upload OK: ${key} (${Math.round(req.file.size / 1024)} KB)`);

    return res.json({ ok: true, data: { publicUrl, key }, publicUrl, fileUrl: publicUrl });
  } catch (err) {
    console.error("❌ /api/uploads/upload", err);
    return res.status(500).json({ ok: false, error: err?.message || "Error subiendo archivo" });
  }
});

// /sign ya no se usa — devuelve 410 Gone con mensaje claro
router.post("/sign", authRequired, (_req, res) => {
  res.status(410).json({ ok: false, error: "Usa /api/uploads/upload (multipart) en lugar de /sign" });
});

module.exports = router;
