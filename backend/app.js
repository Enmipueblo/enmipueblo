// backend/app.js
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import nodemailer from 'nodemailer';
import admin from 'firebase-admin';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Servicio from './models/Servicio.js';
import favoritoRoutes from './routes/favorito.routes.js';

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const app = express();

// ---------------------------------------------------------------------
// Paths y utilidades ESM
// ---------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------
// Middlewares base
// ---------------------------------------------------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------------------
// CORS (permitimos tus dominios de Hosting y local dev)
// ---------------------------------------------------------------------
const allowedOrigins = [
  'http://localhost:4321',
  'http://127.0.0.1:4321',
  'https://enmipueblo-2504f.web.app',
  'https://enmipueblo-2504f.firebaseapp.com',
  // añade tu dominio personalizado cuando lo tengas:
  'https://enmipueblo.com',
  'https://www.enmipueblo.com',
];

const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true); // SSR/CLI/health checks
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS bloqueado: ${origin}`));
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // preflight

// ---------------------------------------------------------------------
// Firebase Admin (en Cloud Functions hay credenciales por defecto)
// ---------------------------------------------------------------------
try {
  admin.initializeApp({
    storageBucket: process.env.PUBLIC_FIREBASE_STORAGE_BUCKET || undefined,
  });
} catch (e) {
  console.warn('Firebase Admin init warning:', e?.message || e);
}

// ---------------------------------------------------------------------
// MongoDB
// ---------------------------------------------------------------------
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

// ---------------------------------------------------------------------
// Multer (FS temporal de Cloud Functions)
// ---------------------------------------------------------------------
const tempDir = join(os.tmpdir(), 'temp_uploads');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}
const upload = multer({ dest: tempDir });

// ---------------------------------------------------------------------
// Rutas externas
// ---------------------------------------------------------------------
app.use('/api/favoritos', favoritoRoutes);

// ---------------------------------------------------------------------
// Health (raíz y bajo /api por compatibilidad)
// ---------------------------------------------------------------------
app.get('/health', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(200).json({ ok: true, service: 'enmipueblo-api' });
});
app.get('/api/health', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(200).json({ ok: true, service: 'enmipueblo-api' });
});

// ---------------------------------------------------------------------
// ===============================
// Localidades (enriquecidas)
// ===============================
let LOCALIDADES = null;

function normalizar(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita acentos
    .replace(/\s+/g, ' ')
    .trim();
}

function loadLocalidadesEnriquecidas() {
  if (LOCALIDADES) return LOCALIDADES;

  // Archivo generado por backend/data/enriquecer-localidades.js
  const dataPath = path.join(
    __dirname,
    'data',
    'localidades_enriquecidas.json',
  );
  if (!fs.existsSync(dataPath)) {
    throw new Error(
      `No se encontró ${dataPath}. Genera el archivo con: node backend/data/enriquecer-localidades.js`,
    );
  }

  const raw = fs.readFileSync(dataPath, 'utf8');
  const arr = JSON.parse(raw);

  // Precalcular label + campos normalizados para búsquedas rápidas
  LOCALIDADES = arr.map(l => {
    // Según tu script, los campos son strings ya “bonitos”
    const provincia = l.provincia || '';
    const ccaa = l.ccaa || '';
    const label = `${l.nombre}${provincia ? ', ' + provincia : ''}${
      ccaa ? ', ' + ccaa : ''
    }`.trim();

    return {
      id: l.municipio_id || l.cod_ine || l.id || null,
      nombre: l.nombre || '',
      provincia,
      ccaa,
      label,
      // normalizados
      _nLabel: normalizar(label),
      _nProv: normalizar(provincia),
      _nCCAA: normalizar(ccaa),
    };
  });

  return LOCALIDADES;
}

function pickTop(arr, n = 15) {
  return arr.slice(0, n);
}

// 📌 GET /api/localidades
// Filtros opcionales: ?q=...&provincia=...&ccaa=...&limit=...
app.get('/api/localidades', (req, res) => {
  try {
    const data = loadLocalidadesEnriquecidas();
    let out = data;

    const { q, provincia, ccaa, limit } = req.query;

    if (q && String(q).trim().length >= 2) {
      const nq = normalizar(String(q));
      // prioriza "empieza por", luego "contiene"
      const starts = out.filter(x => x._nLabel.startsWith(nq));
      const contains = out.filter(
        x => !x._nLabel.startsWith(nq) && x._nLabel.includes(nq),
      );
      out = [...starts, ...contains];
    }

    if (provincia) {
      const np = normalizar(String(provincia));
      out = out.filter(x => x._nProv.includes(np));
    }

    if (ccaa) {
      const nc = normalizar(String(ccaa));
      out = out.filter(x => x._nCCAA.includes(nc));
    }

    const lim = Math.max(1, Math.min(2000, Number(limit || 2000)));

    // strip campos internos normalizados
    const payload = out
      .slice(0, lim)
      .map(({ _nLabel, _nProv, _nCCAA, ...pub }) => pub);

    res.set('Cache-Control', 'public, max-age=3600, s-maxage=86400'); // 1h browser / 24h CDN
    res.set('Vary', 'Origin');
    return res.status(200).json(payload);
  } catch (err) {
    console.error('GET /api/localidades error:', err);
    return res.status(500).json({ error: 'LOCALIDADES_ERROR' });
  }
});

// 📌 GET /api/localidades/suggest?q=...
app.get('/api/localidades/suggest', (req, res) => {
  try {
    const data = loadLocalidadesEnriquecidas();
    const { q } = req.query;

    if (!q || String(q).trim().length < 2) {
      res.set('Cache-Control', 'public, max-age=300, s-maxage=1800'); // 5m/30m
      res.set('Vary', 'Origin');
      return res.status(200).json([]);
    }

    const nq = normalizar(String(q));
    const starts = data.filter(x => x._nLabel.startsWith(nq));
    const contains = data.filter(
      x => !x._nLabel.startsWith(nq) && x._nLabel.includes(nq),
    );
    const top = pickTop([...starts, ...contains], 15).map(
      ({ id, nombre, provincia, ccaa, label }) => ({
        id,
        nombre,
        provincia,
        ccaa,
        label,
      }),
    );

    res.set('Cache-Control', 'public, max-age=600, s-maxage=3600'); // 10m/1h
    res.set('Vary', 'Origin');
    return res.status(200).json(top);
  } catch (err) {
    console.error('GET /api/localidades/suggest error:', err);
    return res.status(500).json({ error: 'LOCALIDADES_SUGGEST_ERROR' });
  }
});

// ---------------------------------------------------------------------
// ENDPOINTS (servicios, favoritos, contacto)
// ---------------------------------------------------------------------

// 📌 POST /api/form - Crear nuevo servicio
app.post('/api/form', upload.fields([]), async (req, res) => {
  try {
    const {
      nombre,
      oficio,
      descripcion,
      contacto,
      pueblo,
      provincia,
      comunidad,
      categoria,
      whatsapp,
    } = req.body;
    const usuarioEmail = req.body.usuarioEmail || null;

    let receivedImageUrls = [];
    if (req.body.imagenes) {
      receivedImageUrls = Array.isArray(req.body.imagenes)
        ? req.body.imagenes
        : [];
    }
    const receivedVideoUrl = req.body.videoUrl || '';

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
      imagenes: receivedImageUrls,
      videoUrl: receivedVideoUrl,
      usuarioEmail,
      creado: new Date(),
    });

    const result = await nuevoServicio.save();
    res.status(200).json({
      mensaje: 'Servicio guardado correctamente',
      id: result._id,
    });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al guardar el servicio' });
  }
});

// 📌 GET /api/servicio/:id
app.get('/api/servicio/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const servicio = await Servicio.findById(id).lean();
    if (!servicio) {
      return res.status(404).json({ mensaje: 'Servicio no encontrado' });
    }
    res.json(servicio);
  } catch (error) {
    res
      .status(500)
      .json({ mensaje: 'Error al obtener el servicio o ID inválido' });
  }
});

// 📌 GET /api/buscar?q=&localidad=&categoria=&page=&limit=
app.get('/api/buscar', async (req, res) => {
  try {
    const queryText = req.query.q || '';
    const localidad = req.query.localidad || '';
    const categoriaFilter = req.query.categoria || '';
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit) || 12, 1);
    const skip = (page - 1) * limit;

    const andFilters = [];
    if (String(queryText).trim()) {
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
    if (String(localidad).trim()) {
      andFilters.push({
        $or: [
          { pueblo: { $regex: localidad, $options: 'i' } },
          { provincia: { $regex: localidad, $options: 'i' } },
          { comunidad: { $regex: localidad, $options: 'i' } },
        ],
      });
    }
    if (String(categoriaFilter).trim()) {
      andFilters.push({ categoria: categoriaFilter });
    }
    const filter = andFilters.length > 0 ? { $and: andFilters } : {};
    const totalItems = await Servicio.countDocuments(filter);
    const totalPages = Math.ceil(totalItems / limit);
    const servicios = await Servicio.find(filter)
      .skip(skip)
      .limit(limit)
      .lean();

    res.json({
      data: servicios,
      page,
      totalPages,
      totalItems,
    });
  } catch (error) {
    res
      .status(500)
      .json({ mensaje: 'Error al buscar servicios', error: error.message });
  }
});

// 📌 GET /api/servicios?email=&page=&limit=
app.get('/api/servicios', async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) {
      return res.status(400).json({ error: 'Falta el email del usuario' });
    }
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit) || 9, 1);
    const skip = (page - 1) * limit;

    const totalItems = await Servicio.countDocuments({ usuarioEmail: email });
    const totalPages = Math.ceil(totalItems / limit);

    const servicios = await Servicio.find({ usuarioEmail: email })
      .skip(skip)
      .limit(limit)
      .lean();

    res.json({
      data: servicios,
      page,
      totalPages,
      totalItems,
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: 'Error al obtener los servicios del usuario' });
  }
});

// 📌 POST /api/contact - Enviar contacto
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
      text: `De: ${nombre}\nEmail: ${email}\nMensaje:\n${mensaje}`,
      html: `<p>De: <strong>${nombre}</strong></p><p>Email: ${email}</p><p>Mensaje:</p><p>${mensaje}</p>`,
    });

    res
      .status(200)
      .json({ success: true, message: 'Mensaje enviado correctamente.' });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: 'Error al enviar el mensaje.' });
  }
});

// 📌 DELETE /api/servicio/:id - Borrar anuncio por ID
app.delete('/api/servicio/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await Servicio.findByIdAndDelete(id);
    res.status(200).json({ mensaje: 'Servicio eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al eliminar el servicio' });
  }
});

// 📌 PATCH /api/servicio/:id - Editar anuncio por ID
app.patch('/api/servicio/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const datos = req.body;
    const updated = await Servicio.findByIdAndUpdate(id, datos, { new: true });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al actualizar el servicio' });
  }
});

export default app;
