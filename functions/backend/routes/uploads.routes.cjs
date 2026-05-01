"use strict";

const express = require("express");
const crypto = require("crypto");
const path = require("path");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

// ✅ FIX: usar nuevo middleware unificado en lugar del legacy auth.cjs
// auth.cjs legacy buscaba solo GOOGLE_CLIENT_ID; el nuevo busca PUBLIC_GOOGLE_CLIENT_ID también
const { authRequired } = require("../middleware/auth.middleware.cjs");

const router = express.Router();

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
    // ✅ Log de diagnóstico: muestra qué variables SÍ existen para depurar
    const available = names.filter(n => process.env[n] !== undefined);
    console.error(`❌ mustEnv falla buscando: ${names.join(" / ")}`);
    console.error(`   Variables disponibles con esos nombres: [${available.join(", ")}]`);
    console.error(`   Keys de env cargadas (R2*): ${Object.keys(process.env).filter(k => k.startsWith("R2") || k.startsWith("CF") || k.startsWith("CLOUD")).join(", ")}`);
    throw new Error(`Falta env: ${names.join(" / ")}`);
  }
  return v;
}

function getR2Endpoint() {
  const direct = pickEnv(
    "R2_ENDPOINT",
    "CLOUDFLARE_R2_ENDPOINT",
    "CF_R2_ENDPOINT",
    "S3_ENDPOINT"
  );
  if (direct) return direct;

  const accountId = pickEnv(
    "R2_ACCOUNT_ID",
    "CLOUDFLARE_ACCOUNT_ID",
    "CF_ACCOUNT_ID"
  );
  if (accountId) {
    return `https://${accountId}.r2.cloudflarestorage.com`;
  }

  throw new Error(
    "Falta env: R2_ENDPOINT / CLOUDFLARE_R2_ENDPOINT / R2_ACCOUNT_ID / CLOUDFLARE_ACCOUNT_ID"
  );
}

function getBucket() {
  return mustEnv(
    "R2_BUCKET",
    "R2_BUCKET_NAME",
    "CLOUDFLARE_R2_BUCKET",
    "CLOUDFLARE_R2_BUCKET_NAME",
    "CF_R2_BUCKET",
    "BUCKET_NAME",
    "S3_BUCKET"
  );
}

function getPublicBase() {
  return String(
    pickEnv(
      "R2_PUBLIC_BASE_URL",
      "MEDIA_PUBLIC_BASE_URL",
      "CLOUDFLARE_R2_PUBLIC_BASE_URL",
      "PUBLIC_MEDIA_BASE_URL"
    ) || "https://media.enmipueblo.com"
  ).replace(/\/$/, "");
}

function getRegion() {
  return (
    pickEnv(
      "R2_REGION",
      "CLOUDFLARE_R2_REGION",
      "AWS_REGION"
    ) || "auto"
  );
}

let _r2 = null;
function getR2() {
  if (_r2) return _r2;

  _r2 = new S3Client({
    region: getRegion(),
    endpoint: getR2Endpoint(),
    credentials: {
      accessKeyId: mustEnv(
        "R2_ACCESS_KEY_ID",
        "CLOUDFLARE_R2_ACCESS_KEY_ID",
        "AWS_ACCESS_KEY_ID"
      ),
      secretAccessKey: mustEnv(
        "R2_SECRET_ACCESS_KEY",
        "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
        "AWS_SECRET_ACCESS_KEY"
      ),
    },
    // ✅ FIX CORS R2: el AWS SDK v3 moderno añade x-amz-checksum-crc32 automáticamente.
    // Cloudflare R2 no soporta esos headers y bloquea el preflight con 403.
    // Desactivamos los checksums automáticos para que la URL firmada no los incluya.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  return _r2;
}

function safeOwner(req) {
  const raw = String(req.user?.email || req.user?.sub || "anon")
    .trim()
    .toLowerCase();
  return raw.replace(/[^a-z0-9._-]+/g, "_").slice(0, 120) || "anon";
}

function safeBaseName(filename) {
  const base = path.basename(String(filename || "archivo"))
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]+/g, "_");
  return base || "archivo";
}

function inferExtension(filename, contentType) {
  const ext = path.extname(String(filename || "")).toLowerCase();
  if (ext) return ext;

  const ct = String(contentType || "").toLowerCase();
  if (ct.includes("webp")) return ".webp";
  if (ct.includes("jpeg")) return ".jpg";
  if (ct.includes("png")) return ".png";
  if (ct.includes("gif")) return ".gif";
  if (ct.includes("mp4")) return ".mp4";
  if (ct.includes("webm")) return ".webm";
  if (ct.includes("quicktime")) return ".mov";
  return "";
}

router.post("/sign", authRequired, async (req, res) => {
  try {
    const filename = String(req.body?.filename || "").trim();
    const contentType = String(req.body?.contentType || "application/octet-stream").trim();
    const folder = String(req.body?.folder || "").trim();

    if (!filename) {
      return res.status(400).json({ ok: false, error: "Falta filename" });
    }

    if (!ALLOWED_FOLDERS.has(folder)) {
      return res.status(400).json({ ok: false, error: `Carpeta no permitida: "${folder}". Permitidas: ${[...ALLOWED_FOLDERS].join(", ")}` });
    }

    const owner = safeOwner(req);
    const ext = inferExtension(filename, contentType);
    const base = safeBaseName(filename).replace(/\.[^.]+$/, "");
    const unique = `${Date.now()}-${crypto.randomUUID()}`;
    const key = `${folder}/${owner}/${unique}-${base}${ext}`;

    const Bucket = getBucket();
    const r2 = getR2();

    const command = new PutObjectCommand({
      Bucket,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 60 * 10 });
    const publicUrl = `${getPublicBase()}/${key}`;

    return res.json({
      ok: true,
      data: {
        uploadUrl,
        publicUrl,
        method: "PUT",
        headers: {},
      },
    });
  } catch (err) {
    console.error("❌ /api/uploads/sign", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Error firmando subida",
    });
  }
});

module.exports = router;
