const express = require("express");
const router = express.Router();

const { authRequired } = require("../auth.cjs");
const { signPutObject, makePublicUrl } = require("../r2.cjs");

/**
 * =========================
 * Helpers seguridad
 * =========================
 */

function isSafeKey(key) {
  if (typeof key !== "string") return false;
  if (key.length < 5 || key.length > 700) return false;
  if (key.includes("..")) return false;
  if (key.includes("\\") || key.includes("\0")) return false;
  if (key.startsWith("/")) return false;
  if (key.includes("//")) return false;
  return true;
}

function extLower(key) {
  const k = String(key || "").toLowerCase();
  const m = k.match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

function isAllowedForUserKey(key, uid) {
  // ✅ Permitimos SOLO dentro de carpeta del usuario
  // Ajustá aquí si mañana agregas otras carpetas.
  return (
    key.startsWith(`service_images/fotos/${uid}/`) ||
    key.startsWith(`service_images/video/${uid}/`) ||
    key.startsWith(`profile_images/${uid}/`) ||
    key.startsWith(`user_uploads/${uid}/`)
  );
}

function pickClientIp(req) {
  // Cloudflare
  const cf = req.headers["cf-connecting-ip"];
  if (cf) return String(cf);

  // Proxies comunes (nginx)
  const xff = req.headers["x-forwarded-for"];
  if (xff) return String(xff).split(",")[0].trim();

  // Fallback
  return req.ip || "unknown";
}

function mustInt(v, def) {
  const n = parseInt(String(v || ""), 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

const MAX_IMAGE = mustInt(process.env.UPLOAD_MAX_IMAGE_MB, 8) * 1024 * 1024;  // 8MB default
const MAX_VIDEO = mustInt(process.env.UPLOAD_MAX_VIDEO_MB, 80) * 1024 * 1024; // 80MB default

const allowedImageTypes = new Set(["image/webp", "image/jpeg", "image/png"]);
const allowedVideoTypes = new Set(["video/mp4", "video/webm", "video/quicktime", "application/octet-stream"]);

const allowedImageExt = new Set(["webp", "jpg", "jpeg", "png"]);
const allowedVideoExt = new Set(["mp4", "webm", "mov"]);

/**
 * =========================
 * Rate limit (memoria)
 * - Por UID (lo más importante)
 * - Por IP (extra)
 * =========================
 * Nota: in-memory (reinicia al redeploy). Suficiente para MVP.
 */

function makeLimiter({ windowMs, max }) {
  const buckets = new Map(); // key -> timestamps[]
  return function hit(key) {
    const now = Date.now();
    const start = now - windowMs;

    const arr = buckets.get(key) || [];
    // prune
    let i = 0;
    while (i < arr.length && arr[i] < start) i++;
    const pruned = i > 0 ? arr.slice(i) : arr;

    if (pruned.length >= max) {
      buckets.set(key, pruned);
      const oldest = pruned[0] || now;
      const retryAfterMs = windowMs - (now - oldest);
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
    }

    pruned.push(now);
    buckets.set(key, pruned);
    return { ok: true, retryAfterSeconds: 0 };
  };
}

// Ajustes recomendados (conservadores)
const hitUid1m = makeLimiter({ windowMs: 60_000, max: 20 });
const hitUid10m = makeLimiter({ windowMs: 10 * 60_000, max: 120 });
const hitIp10m = makeLimiter({ windowMs: 10 * 60_000, max: 240 });

function rateLimitSign(req, res, next) {
  const uid = req.user?.uid || "no-uid";
  const ip = pickClientIp(req);

  const r1 = hitUid1m(`uid:${uid}`);
  if (!r1.ok) {
    return res.status(429).json({
      error: "Rate limit: demasiadas firmas (1 min).",
      retryAfterSeconds: r1.retryAfterSeconds,
    });
  }

  const r2 = hitUid10m(`uid:${uid}`);
  if (!r2.ok) {
    return res.status(429).json({
      error: "Rate limit: demasiadas firmas (10 min).",
      retryAfterSeconds: r2.retryAfterSeconds,
    });
  }

  const r3 = hitIp10m(`ip:${ip}`);
  if (!r3.ok) {
    return res.status(429).json({
      error: "Rate limit: demasiadas firmas desde tu IP.",
      retryAfterSeconds: r3.retryAfterSeconds,
    });
  }

  next();
}

/**
 * =========================
 * POST /api/uploads/sign
 * body: { key, contentType, size }
 * =========================
 */
router.post("/sign", authRequired, rateLimitSign, async (req, res) => {
  try {
    const body = req.body || {};
    const keyRaw = body.key;
    const contentTypeRaw = body.contentType;
    const sizeRaw = body.size;

    if (!keyRaw) return res.status(400).json({ error: "Falta key" });

    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: "No autorizado (sin uid)" });

    const key = String(keyRaw).replace(/^\/+/, "");
    if (!isSafeKey(key)) return res.status(400).json({ error: "Key inválida" });

    // 🔒 carpeta del usuario
    if (!isAllowedForUserKey(key, uid)) {
      return res.status(403).json({ error: "Key no autorizada para este usuario" });
    }

    const contentType =
      typeof contentTypeRaw === "string" && contentTypeRaw.trim()
        ? contentTypeRaw.trim()
        : "application/octet-stream";

    const size = Number(sizeRaw);
    const sizeOk = Number.isFinite(size) && size > 0;

    const ext = extLower(key);

    // Determinar si es imagen o video
    const isImage = contentType.startsWith("image/");
    const isVideo = contentType.startsWith("video/") || contentType === "application/octet-stream";

    // Validar tipo
    if (isImage && !allowedImageTypes.has(contentType)) {
      return res.status(400).json({ error: "Tipo de imagen no permitido (usa WEBP/JPG/PNG)" });
    }
    if (!isImage && !allowedVideoTypes.has(contentType)) {
      return res.status(400).json({ error: "Tipo de video no permitido (usa MP4/WebM)" });
    }

    // Validar extensión coherente
    if (isImage && !allowedImageExt.has(ext)) {
      return res.status(400).json({ error: "Extensión de imagen no permitida" });
    }
    if (!isImage && !allowedVideoExt.has(ext)) {
      return res.status(400).json({ error: "Extensión de video no permitida" });
    }

    // Si viene octet-stream, exigimos que sea claramente video por key
    if (contentType === "application/octet-stream") {
      if (!key.includes("/video/") && !key.includes("/videos/") && !key.startsWith(`service_images/video/${uid}/`)) {
        return res.status(400).json({ error: "No se pudo validar el tipo de archivo" });
      }
    }

    // Límites anti abuso
    if (sizeOk && isImage && size > MAX_IMAGE) {
      return res.status(400).json({ error: `Imagen demasiado grande (max ${Math.round(MAX_IMAGE / 1024 / 1024)}MB)` });
    }
    if (sizeOk && !isImage && size > MAX_VIDEO) {
      return res.status(400).json({ error: `Video demasiado grande (max ${Math.round(MAX_VIDEO / 1024 / 1024)}MB)` });
    }

    // Cache (ok para media)
    const cacheControl = "public, max-age=31536000, immutable";

    const expiresInSeconds = 60;

    const putUrl = await signPutObject({
      key,
      contentType,
      cacheControl,
      expiresInSeconds,
    });

    const publicUrl = makePublicUrl(key);

    return res.json({
      uploadUrl: putUrl, // ✅ lo que usa el frontend
      putUrl,            // compat
      publicUrl,
      key,
      expiresInSeconds,
    });
  } catch (err) {
    console.error("uploads/sign error:", err);
    return res.status(500).json({ error: "Error firmando upload" });
  }
});

module.exports = router;
