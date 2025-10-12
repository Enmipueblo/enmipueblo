export const prerender = false;

import type { APIRoute } from 'astro';
import { MongoClient } from 'mongodb';
import nodemailer from 'nodemailer';

export const POST: APIRoute = async ({ request }) => {
  const data = await request.json();
  const { nombre, email, asunto, telefono, mensaje } = data;

  // Validar campos básicos (ajusta según tus necesidades)
  if (!nombre || !email || !mensaje) {
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Faltan campos obligatorios.',
      }),
      { status: 400 },
    );
  }

  // 1. Guardar en MongoDB
  try {
    const mongoUri = import.meta.env.MONGODB_URI!;
    const client = new MongoClient(mongoUri);
    await client.connect();
    const db = client.db('mipueblo');
    const col = db.collection('contacto');
    await col.insertOne({
      nombre,
      email,
      asunto,
      telefono,
      mensaje,
      fecha: new Date(),
    });
    await client.close();
  } catch (err) {
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Error guardando en la base de datos.',
      }),
      { status: 500 },
    );
  }

  // 2. Enviar email a serviciosenmipueblo@gmail.com
  try {
    // --- TRANSPORTER DE GMAIL ---
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'serviciosenmipueblo@gmail.com',
        pass: import.meta.env.GMAIL_APP_PASSWORD, // Usa una app password de Gmail
      },
    });

    const mailOptions = {
      from: `"EnMiPueblo Web" <serviciosenmipueblo@gmail.com>`,
      to: 'serviciosenmipueblo@gmail.com',
      subject: asunto || 'Nuevo mensaje de contacto',
      html: `
        <h3>Nuevo mensaje desde el formulario de contacto</h3>
        <p><b>Nombre:</b> ${nombre}</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Teléfono:</b> ${telefono || '-'}</p>
        <p><b>Mensaje:</b></p>
        <div style="white-space: pre-line;">${mensaje}</div>
      `,
    };

    await transporter.sendMail(mailOptions);

    return new Response(
      JSON.stringify({
        success: true,
        message: '¡Mensaje enviado correctamente!',
      }),
      { status: 200 },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        success: false,
        message: 'No se pudo enviar el email, pero tu consulta fue guardada.',
      }),
      { status: 500 },
    );
  }
};
