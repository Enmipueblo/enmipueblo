const express = require("express");
const router = express.Router();

const { authRequired } = require("../auth.cjs");
const { signPutObject, makePublicUrl } = require("../r2.cjs");

// Rate limit simple (in-memory) para evitar abuso de /uploads/sign.
// Nota: es suficiente para un VPS + container único.
// Si mañana escalas horizontal, lo migramos a Redis.
const RATE_WINDOW_MS = 60 * 1000;      // 1 minuto
const RATE_MAX_PER_WINDOW = 25;        // 25 firmas/min por usuario+ip (suficiente para subir varias fotos)
const _rl = new Map();

function getClientIp(req) {
  const h =
    req.headers["cf-connecting-ip"] ||
    req.headers["x-forwarded-for"] ||
    req.headers["x-real-ip"] ||
    "";
  const ip = String(h).split(",")[0].trim();
  return ip || req.ip || "unknown";
}

function rateLimitSign(req, res, next) {
  const uid = req.user?.uid || "nouid";
  const ip = getClientIp(req);
  const key = `${uid}|${ip}`;

  const now = Date.now();
  const cur = _rl.get(key) || { start: now, count: 0, last: now };

  // reset ventana
  if (now - cur.start > RATE_WINDOW_MS) {
    cur.start = now;
    cur.count = 0;
  }

  cur.count += 1;
  cur.last = now;
  _rl.set(key, cur);

  // limpieza básica (evita crecimiento infinito)
  if (_rl.size > 5000) {
    for (const [k, v] of _rl.entries()) {
      if (now - v.last > 10 * RATE_WINDOW_MS) _rl.delete(k);
    }
  }

  if (cur.count > RATE_MAX_PER_WINDOW) {
    const retrySec = Math.ceil((RATE_WINDOW_MS - (now - cur.start)) / 1000);
    res.setHeader("Retry-After", String(Math.max(1, retrySec)));
    return res.status(429).json({ error: "Demasiadas solicitudes. Espera un momento y reintenta." });
  }

  next();
}

function isSafeKey(key) {
  if (typeof key !== "string") return false;
  if (key.length < 5 || key.length > 700) return false;
  if (key.includes("..")) return false;
  if (key.includes("\\") || key.includes("\0")) return false;
  if (key.startsWith("/")) return false;
  return true;
}

function startsWithAllowedPrefix(key) {
  // Permitimos lo que ya usas hoy: service_images/...
  // Si mañana quieres separar a service_videos/, lo agregamos.
  const allowed = ["service_images/", "profile_images/", "user_uploads/"];
  return allowed.some((p) => key.startsWith(p));
}

function looksLikeVideoKey(key) {
  const k = String(key || "").toLowerCase();
  return (
    k.endsWith(".mp4") ||
    k.endsWith(".webm") ||
    k.endsWith(".mov") ||
    k.includes("/video") ||
    k.includes("/videos")
  );
}

router.post("/sign", authRequired, rateLimitSign, async (req, res) => {
  try {
    const body = req.body || {};
    const keyRaw = body.key;
    const contentTypeRaw = body.contentType;
    const sizeRaw = body.size;

    if (!keyRaw) return res.status(400).json({ error: "Falta key" });

    const key = String(keyRaw).replace(/^\/+/, "");
    if (!isSafeKey(key)) return res.status(400).json({ error: "Key inválida" });
    if (!startsWithAllowedPrefix(key)) {
      return res.status(400).json({ error: "Prefijo no permitido" });
    }

    // Asegura que el user solo firme su carpeta
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: "No autorizado (sin token)" });

    // Requiere que la key contenga /<uid>/ para evitar que firmen en carpetas ajenas
    if (!key.includes(`/${uid}/`)) {
      return res.status(403).json({ error: "Key no autorizada" });
    }

    const contentType =
      typeof contentTypeRaw === "string" && contentTypeRaw.trim()
        ? contentTypeRaw.trim()
        : "application/octet-stream";

    const size = Number.isFinite(sizeRaw) ? sizeRaw : Number(sizeRaw || 0);

    const isImage = contentType.startsWith("image/");
    const isVideo = contentType.startsWith("video/") || contentType === "application/octet-stream";

    const allowedImage = new Set(["image/webp", "image/jpeg", "image/png"]);
    const allowedVideo = new Set([
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "application/octet-stream",
    ]);

    if (isImage && !allowedImage.has(contentType)) {
      return res.status(400).json({ error: "Tipo de imagen no permitido" });
    }

    if (!isImage && !allowedVideo.has(contentType)) {
      return res.status(400).json({ error: "Tipo de video no permitido (usa MP4 o WebM)" });
    }

    // Si llega octet-stream, exigimos que la key parezca video (para no firmar cualquier cosa gigante)
    if (contentType === "application/octet-stream" && !looksLikeVideoKey(key)) {
      return res.status(400).json({ error: "No se pudo validar el tipo de archivo" });
    }

    // Limites anti-abuso (se cortan antes de firmar)
    const MAX_IMAGE = 8 * 1024 * 1024;
    const MAX_VIDEO = 40 * 1024 * 1024;

    if (size && isImage && size > MAX_IMAGE) {
      return res.status(400).json({ error: "Imagen demasiado grande" });
    }
    if (size && !isImage && size > MAX_VIDEO) {
      return res.status(400).json({ error: "Video demasiado grande (max 40MB)" });
    }

    const cacheControl = "public, max-age=31536000, immutable";

    const putUrl = await signPutObject({
      key,
      contentType,
      cacheControl,
      expiresInSeconds: 60,
    });

    const publicUrl = makePublicUrl(key);

    // ✅ IMPORTANTE: el frontend espera uploadUrl.
    // Devolvemos ambos nombres para compatibilidad.
    return res.json({
      uploadUrl: putUrl, // <- el que tu frontend necesita
      putUrl,            // <- compatibilidad si algo lo usa
      publicUrl,
      key,
      expiresInSeconds: 60,
    });
  } catch (err) {
    console.error("uploads/sign error:", err);
    return res.status(500).json({ error: "Error firmando upload" });
  }
});

module.exports = router;
