// functions/backend/routes/contact.routes.cjs
const express = require("express");
const nodemailer = require("nodemailer");

const router = express.Router();

/* ---------------------------------------------
   🧽 Helpers
--------------------------------------------- */
function sanitize(str, maxLen) {
  if (!str) return "";
  return String(str).replace(/\s+/g, " ").trim().slice(0, maxLen);
}

const EMAIL_TO =
  process.env.CONTACT_EMAIL_TO || "serviciosenmipueblo@gmail.com";

// Rate-limit muy simple en memoria (por IP)
const RATE_WINDOW_MS = 5 * 60 * 1000; // 5 minutos
const RATE_MAX = 10; // máx. 10 mensajes / ventana / IP
const rateStore = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateStore.get(ip) || { count: 0, first: now };

  // si se pasó la ventana, reseteamos
  if (now - entry.first > RATE_WINDOW_MS) {
    entry.count = 0;
    entry.first = now;
  }

  entry.count += 1;
  rateStore.set(ip, entry);

  return entry.count > RATE_MAX;
}

/* ---------------------------------------------
   ✉️ Configuración de envío de correo
   (usa variables de entorno / secretos)
--------------------------------------------- */
const transporter = nodemailer.createTransport({
  host: process.env.CONTACT_SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.CONTACT_SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.CONTACT_EMAIL_USER, // ej: serviciosenmipueblo@gmail.com
    pass: process.env.CONTACT_EMAIL_PASS, // ⚠️ App password / secreto
  },
});

/* ---------------------------------------------
   POST /api/contact
--------------------------------------------- */
router.post("/", async (req, res) => {
  try {
    const ip =
      (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim() ||
      req.ip ||
      "unknown";

    // Honeypot: si viene relleno → probablemente es bot
    if (req.body?.robotCheck && String(req.body.robotCheck).trim().length > 0) {
      console.warn("🧹 Bloqueado mensaje por honeypot", { ip });
      return res.json({
        success: true,
        message: "Mensaje recibido.",
      });
    }

    // Rate-limit muy básico
    if (isRateLimited(ip)) {
      return res.status(429).json({
        success: false,
        message: "Demasiadas solicitudes desde esta IP. Inténtalo más tarde.",
      });
    }

    let nombre = sanitize(req.body?.nombre, 60);
    let email = sanitize(req.body?.email, 100);
    let asunto = sanitize(req.body?.asunto, 80);
    let mensaje = sanitize(req.body?.mensaje, 1000);

    if (!nombre || !email || !mensaje) {
      return res.status(400).json({
        success: false,
        message: "Faltan campos obligatorios.",
      });
    }

    const emailRegex = /^[\w-.]+@([\w-]+\.)+[\w-]{2,}$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Email no válido.",
      });
    }

    if (mensaje.length < 15) {
      return res.status(400).json({
        success: false,
        message: "El mensaje es demasiado corto.",
      });
    }

    if (!asunto) {
      asunto = "Nuevo mensaje desde el formulario de contacto";
    }

    // Montar texto plano
    const text = [
      `Nombre: ${nombre}`,
      `Email: ${email}`,
      `IP: ${ip}`,
      "",
      "Mensaje:",
      mensaje,
    ].join("\n");

    // Enviar correo
    await transporter.sendMail({
      from: `"EnMiPueblo - Web" <${process.env.CONTACT_EMAIL_USER || EMAIL_TO}>`,
      to: EMAIL_TO,
      replyTo: `"${nombre}" <${email}>`,
      subject: asunto,
      text,
    });

    return res.json({
      success: true,
      message: "¡Gracias por contactarnos! Te responderemos en breve.",
    });
  } catch (err) {
    console.error("❌ Error en POST /api/contact:", err);
    return res.status(500).json({
      success: false,
      message: "Error al enviar el mensaje. Inténtalo más tarde.",
    });
  }
});

module.exports = router;
