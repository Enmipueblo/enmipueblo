import express from 'express';
import Favorito from '../models/Favorito.js'; // OJO: la ruta exacta y la mayúscula

const router = express.Router();

// Crear favorito (POST)
router.post('/', async (req, res) => {
  try {
    const { usuarioEmail, servicioId } = req.body;
    if (!usuarioEmail || !servicioId) {
      return res
        .status(400)
        .json({ error: 'usuarioEmail y servicioId son requeridos.' });
    }

    // Chequea si ya existe (por el index único)
    let favorito = await Favorito.findOne({ usuarioEmail, servicioId });
    if (favorito) {
      return res.status(200).json(favorito); // Ya existe, devuelve igual
    }

    // Crear
    favorito = new Favorito({ usuarioEmail, servicioId });
    await favorito.save();

    res.status(201).json(favorito);
  } catch (error) {
    // Si es por duplicado (index unique)
    if (error.code === 11000) {
      const fav = await Favorito.findOne({
        usuarioEmail: req.body.usuarioEmail,
        servicioId: req.body.servicioId,
      });
      return res.status(200).json(fav);
    }
    console.error('Error en crear favorito:', error);
    res.status(500).json({ error: error.message });
  }
});

// Borrar favorito (DELETE)
router.delete('/:id', async (req, res) => {
  try {
    const fav = await Favorito.findByIdAndDelete(req.params.id);
    if (!fav) {
      return res.status(404).json({ error: 'Favorito no encontrado' });
    }
    res.json({ msg: 'Eliminado', _id: fav._id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Listar favoritos de un usuario (GET)
router.get('/', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Falta email en query' });
    // Populate para devolver info del servicio
    const favoritos = await Favorito.find({ usuarioEmail: email }).populate(
      'servicioId',
    );
    res.json({ data: favoritos });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
