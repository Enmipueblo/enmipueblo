import React, { useState } from 'react';
const BACKEND_URL = import.meta.env.PUBLIC_BACKEND_URL;

const initialState = {
  nombre: '',
  email: '',
  asunto: '',
  mensaje: '',
};

const validateEmail = (email: string) =>
  /^[\w-.]+@([\w-]+\.)+[\w-]{2,}$/.test(email);

const ContactFormIsland: React.FC = () => {
  const [fields, setFields] = useState(initialState);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    type: 'success' | 'error' | '';
  }>({ text: '', type: '' });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setFields({ ...fields, [e.target.name]: e.target.value });
  };

  const validate = () => {
    if (!fields.nombre || !fields.email || !fields.mensaje) {
      setMessage({
        text: 'Por favor, completa los campos obligatorios.',
        type: 'error',
      });
      return false;
    }
    if (!validateEmail(fields.email)) {
      setMessage({
        text: 'Por favor, introduce un email válido.',
        type: 'error',
      });
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage({ text: '', type: '' });

    if (!validate()) return;

    setSending(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setMessage({
          text: data.message || '¡Gracias por contactarnos!',
          type: 'success',
        });
        setFields(initialState);
      } else {
        setMessage({
          text: data.message || 'Ocurrió un error. Inténtalo de nuevo.',
          type: 'error',
        });
      }
    } catch {
      setMessage({
        text: 'No se pudo enviar el mensaje. Inténtalo más tarde.',
        type: 'error',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <form
      className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 border border-green-200 space-y-6"
      onSubmit={handleSubmit}
      autoComplete="off"
    >
      <h2 className="text-2xl font-bold text-emerald-700 mb-2 text-center">
        Contacto
      </h2>
      {message.text && (
        <div
          className={`text-center py-2 rounded-lg font-semibold mb-2 ${
            message.type === 'success'
              ? 'bg-green-100 text-green-700'
              : message.type === 'error'
              ? 'bg-red-100 text-red-700'
              : ''
          }`}
        >
          {message.text}
        </div>
      )}
      <div>
        <label
          htmlFor="nombre"
          className="block text-gray-700 mb-1 font-medium"
        >
          Nombre <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          name="nombre"
          id="nombre"
          className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-400"
          value={fields.nombre}
          onChange={handleChange}
          required
          disabled={sending}
          autoComplete="name"
          maxLength={60}
        />
      </div>
      <div>
        <label htmlFor="email" className="block text-gray-700 mb-1 font-medium">
          Email <span className="text-red-500">*</span>
        </label>
        <input
          type="email"
          name="email"
          id="email"
          className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-400"
          value={fields.email}
          onChange={handleChange}
          required
          disabled={sending}
          autoComplete="email"
          maxLength={100}
        />
      </div>
      <div>
        <label
          htmlFor="asunto"
          className="block text-gray-700 mb-1 font-medium"
        >
          Asunto
        </label>
        <input
          type="text"
          name="asunto"
          id="asunto"
          className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-400"
          value={fields.asunto}
          onChange={handleChange}
          disabled={sending}
          autoComplete="off"
          maxLength={80}
        />
      </div>
      <div>
        <label
          htmlFor="mensaje"
          className="block text-gray-700 mb-1 font-medium"
        >
          Mensaje <span className="text-red-500">*</span>
        </label>
        <textarea
          name="mensaje"
          id="mensaje"
          rows={4}
          className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-400 resize-none"
          value={fields.mensaje}
          onChange={handleChange}
          required
          disabled={sending}
          maxLength={1000}
        />
      </div>
      <button
        type="submit"
        className={`w-full py-3 mt-2 rounded-xl font-bold transition ${
          sending
            ? 'bg-emerald-300 text-white cursor-not-allowed'
            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
        }`}
        disabled={sending}
      >
        {sending ? 'Enviando...' : 'Enviar mensaje'}
      </button>
    </form>
  );
};

export default ContactFormIsland;
