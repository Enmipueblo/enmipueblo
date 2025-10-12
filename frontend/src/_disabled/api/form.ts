import type { APIRoute } from 'astro';
import { MongoClient } from 'mongodb';

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json();

  // Validaciones mínimas
  if (!body.nombre || !body.oficio || !body.descripcion || !body.contacto || !body.pueblo || !body.categoria) {
    return new Response(JSON.stringify({ mensaje: 'Faltan campos obligatorios.' }), { status: 400 });
  }

  const mongoUri = import.meta.env.MONGODB_URI;
  if (!mongoUri) {
    return new Response(JSON.stringify({ mensaje: 'MONGODB_URI no definida.' }), { status: 500 });
  }

  const client = new MongoClient(mongoUri);
  await client.connect();

  const db = client.db('mipueblo');
  const collection = db.collection('servicios');

  await collection.insertOne({
    nombre: body.nombre,
    oficio: body.oficio,
    descripcion: body.descripcion,
    contacto: body.contacto,
    pueblo: body.pueblo,
    categoria: body.categoria,
    imagenes: body.imagenes || [],
    videoUrl: body.videoUrl || '',
    usuarioEmail: body.usuarioEmail || '',
    creado: new Date(),
  });

  await client.close();

  return new Response(JSON.stringify({ mensaje: 'Servicio publicado con éxito.' }), { status: 200 });
};
