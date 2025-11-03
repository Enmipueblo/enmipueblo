// backend/app.js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import xssClean from 'xss-clean';
import mongoSanitize from 'express-mongo-sanitize';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import nodemailer from 'nodemailer';
import admin from 'firebase-admin';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';



// Modelos y rutas
import Servicio from './models/Servicio.js';
import favoritoRoutes from './routes/favorito.routes.js';
import systemRoutes from './routes/system.routes.js';
import { limiter, speedLimiter } from './middleware/rateLimiter.js';

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------- Seguridad base ----------------
app.use(helmet());
app.use(xssClean());
app.use(mongoSanitize());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------------- CORS ----------------
const allowedOrigins = [
  'http://localhost:4321',
  'http://127.0.0.1:4321',
  'https://enmipueblo-2504f.web.app',
  'https://enmipueblo-2504f.firebaseapp.com',
  'https://enmipueblo.com',
  'https://www.enmipueblo.com',
];

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS bloqueado: ${origin}`));
  },
  credentials: true,
}));

// ---------------- Limitadores ----------------
app.use(limiter);
app.use(speedLimiter);

// ---------------- Firebase ----------------
try {
  admin.initializeApp({
    storageBucket: process.env.PUBLIC_FIREBASE_STORAGE_BUCKET || undefined,
  });
} catch (e) {
    console.warn('Firebase Admin init warning:', e?.message || e);
}

// ---------------- MongoDB ----------------
const mongoUri = process.env.MONGO_URI;
if (typeof mongoUri !== 'string') {
  throw new Error('La variable de entorno MONGO_URI no está definida.');
}

mongoose.set('strictQuery', true);
mongoose
  .connect(mongoUri)
  .then(() => console.log('✅ Conectado a MongoDB Atlas con Mongoose'))
  .catch(err => {
    console.error('❌ Error al conectar a MongoDB:', err);
    process.exit(1);
  });

// ---------------- Multer (uploads temporales) ----------------
const tempDir = join(os.tmpdir(), 'temp_uploads');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}
const upload = multer({ dest: tempDir });

// ---------------- Rutas ----------------
app.use('/api/favoritos', favoritoRoutes);
app.use('/api', systemRoutes); // <-- aquí está /api/health y /api/localidades

// ---------------- ENDPOINTS PRINCIPALES ----------------

// Crear nuevo servicio
app.post('/api/form', upload.fields([]), async (req, res) => {
  try {
    const {
      nombre, oficio, descripcion, contacto,
      pueblo, provincia, comunidad, categoria, whatsapp,
    } = req.body;
    const usuarioEmail = req.body.usuarioEmail || null;
    const imagenes = Array.isArray(req.body.imagenes) ? req.body.imagenes : [];
    const videoUrl = req.body.videoUrl || '';

    const nuevoServicio = new Servicio({
      nombre,
      oficio,
      descripcion,
      contacto,
      whatsapp,
      pueblo,
      provincia,
      comunidad,
      categoria: categoria || 'General',
      imagenes,
      videoUrl,
      usuarioEmail,
      creado: new Date(),
    });

    const result = await nuevoServicio.save();
    res.status(200).json({ mensaje: 'Servicio guardado correctamente', id: result._id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al guardar el servicio' });
  }
});

// Obtener un servicio
app.get('/api/servicio/:id', async (req, res) => {
  try {
    const servicio = await Servicio.findById(req.params.id).lean();
    if (!servicio) return res.status(404).json({ mensaje: 'Servicio no encontrado' });
    res.json(servicio);
  } catch {
    res.status(500).json({ mensaje: 'Error al obtener el servicio' });
  }
});

// Buscar servicios
app.get('/api/buscar', async (req, res) => {
  try {
    const queryText = req.query.q || '';
    const localidad = req.query.localidad || '';
    const categoriaFilter = req.query.categoria || '';
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit) || 12, 1);
    const skip = (page - 1) * limit;

    const andFilters = [];
    if (queryText.trim()) {
      andFilters.push({
        $or: [
          { oficio: { $regex: queryText, $options: 'i' } },
          { nombre: { $regex: queryText, $options: 'i' } },
          { pueblo: { $regex: queryText, $options: 'i' } },
          { provincia: { $regex: queryText, $options: 'i' } },
          { comunidad: { $regex: queryText, $options: 'i' } },
        ],
      });
    }
    if (localidad.trim()) {
      andFilters.push({
        $or: [
          { pueblo: { $regex: localidad, $options: 'i' } },
          { provincia: { $regex: localidad, $options: 'i' } },
          { comunidad: { $regex: localidad, $options: 'i' } },
        ],
      });
    }
    if (categoriaFilter.trim()) {
      andFilters.push({ categoria: categoriaFilter });
    }

    const filter = andFilters.length > 0 ? { $and: andFilters } : {};
    const totalItems = await Servicio.countDocuments(filter);
    const totalPages = Math.ceil(totalItems / limit);
    const servicios = await Servicio.find(filter).skip(skip).limit(limit).lean();

    res.json({ data: servicios, page, totalPages, totalItems });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al buscar servicios' });
  }
});

// Servicios por usuario
app.get('/api/servicios', async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) return res.status(400).json({ error: 'Falta el email del usuario' });
    const servicios = await Servicio.find({ usuarioEmail: email }).lean();
    res.json({ data: servicios });
  } catch {
    res.status(500).json({ error: 'Error al obtener los servicios' });
  }
});

// Contacto
app.post('/api/contact', async (req, res) => {
  const { nombre, email, mensaje } = req.body;
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'serviciosenmipueblo@gmail.com',
        pass: process.env.EMAIL_PASS,
      },
    });
    await transporter.sendMail({
      from: `"${nombre}" <${email}>`,
      to: 'serviciosenmipueblo@gmail.com',
      subject: 'Nuevo mensaje de contacto de EnMiPueblo',
      html: `<p><b>De:</b> ${nombre}</p><p><b>Email:</b> ${email}</p><p>${mensaje}</p>`,
    });
    res.status(200).json({ success: true, message: 'Mensaje enviado correctamente.' });
  } catch {
    res.status(500).json({ success: false, message: 'Error al enviar el mensaje.' });
  }
});

// Eliminar servicio
app.delete('/api/servicio/:id', async (req, res) => {
  try {
    await Servicio.findByIdAndDelete(req.params.id);
    res.status(200).json({ mensaje: 'Servicio eliminado correctamente' });
  } catch {
    res.status(500).json({ mensaje: 'Error al eliminar el servicio' });
  }
});

// Actualizar servicio
app.patch('/api/servicio/:id', async (req, res) => {
  try {
    const updated = await Servicio.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch {
    res.status(500).json({ mensaje: 'Error al actualizar el servicio' });
  }
});

export default app;
