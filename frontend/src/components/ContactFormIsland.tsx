// src/components/ContactFormIsland.tsx
import React, { useRef, useState } from "react";

const BACKEND_URL = import.meta.env.PUBLIC_BACKEND_URL || "";

const initialState = {
  nombre: "",
  email: "",
  asunto: "",
  mensaje: "",
};

const validateEmail = (email: string) =>
  /^[\w-.]+@([\w-]+\.)+[\w-]{2,}$/.test(email);

const ContactFormIsland: React.FC = () => {
  const [fields, setFields] = useState(initialState);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error" | "";
  }>({ text: "", type: "" });

  const inFlightRef = useRef(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFields((prev) => ({ ...prev, [name]: value }));
  };

  const validate = () => {
    if (!fields.nombre || !fields.email || !fields.mensaje) {
      setMessage({
        text: "Por favor, completa los campos obligatorios.",
        type: "error",
      });
      return false;
    }
    if (!validateEmail(fields.email)) {
      setMessage({
        text: "Por favor, introduce un email válido.",
        type: "error",
      });
      return false;
    }
    if (fields.mensaje.trim().length < 15) {
      setMessage({
        text: "Cuéntanos tu consulta con un poco más de detalle.",
        type: "error",
      });
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage({ text: "", type: "" });

    if (!validate()) return;

    if (!BACKEND_URL) {
      setMessage({
        text: "Configuración interna pendiente. Inténtalo más tarde.",
        type: "error",
      });
      return;
    }

    if (inFlightRef.current) return; // evita doble envío
    inFlightRef.current = true;

    setSending(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });

      // intentar parsear JSON solo si corresponde
      const contentType = res.headers.get("content-type") || "";
      const data =
        contentType.includes("application/json")
          ? await res.json().catch(() => ({}))
          : {};

      if (res.ok && (data as any).success) {
        setMessage({
          text:
            (data as any).message ||
            "¡Gracias por contactarnos! Te responderemos en breve.",
          type: "success",
        });
        setFields(initialState);
      } else {
        setMessage({
          text:
            (data as any).message ||
            "Ocurrió un error al enviar el mensaje. Inténtalo de nuevo en unos minutos.",
          type: "error",
        });
      }
    } catch {
      setMessage({
        text:
          "No se pudo enviar el mensaje. Revisa tu conexión e inténtalo más tarde.",
        type: "error",
      });
    } finally {
      setSending(false);
      inFlightRef.current = false;
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="grid gap-8 md:grid-cols-[1.2fr,0.9fr] items-stretch">
        {/* FORMULARIO */}
        <form
          onSubmit={handleSubmit}
          autoComplete="off"
          className="bg-white rounded-3xl shadow-xl border border-emerald-100 px-6 md:px-8 py-7 space-y-5"
        >
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 flex items-center justify-center">
              <span className="text-emerald-700 text-xl">✉️</span>
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-extrabold text-emerald-800 leading-tight">
                Escríbenos a EnMiPueblo
              </h2>
              <p className="text-xs md:text-sm text-gray-500">
                Respondemos normalmente en menos de 24&nbsp;hs laborables.
              </p>
            </div>
          </div>

          {message.text && (
            <div
              className={`text-sm rounded-xl px-3 py-2 mb-1 text-center font-medium ${
                message.type === "success"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : message.type === "error"
                  ? "bg-red-50 text-red-700 border border-red-200"
                  : "bg-gray-50 text-gray-700 border border-gray-200"
              }`}
            >
              {message.text}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label
                htmlFor="nombre"
                className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide"
              >
                Nombre <span className="text-red-500">*</span>
              </label>
              <input
                id="nombre"
                name="nombre"
                type="text"
                value={fields.nombre}
                onChange={handleChange}
                disabled={sending}
                maxLength={60}
                autoComplete="name"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="Tu nombre"
                required
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide"
              >
                Email <span className="text-red-500">*</span>
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={fields.email}
                onChange={handleChange}
                disabled={sending}
                maxLength={100}
                autoComplete="email"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="tucorreo@ejemplo.com"
                required
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="asunto"
              className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide"
            >
              Asunto
            </label>
            <input
              id="asunto"
              name="asunto"
              type="text"
              value={fields.asunto}
              onChange={handleChange}
              disabled={sending}
              maxLength={80}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              placeholder="Ej: Consulta sobre mi anuncio"
            />
          </div>

          <div>
            <label
              htmlFor="mensaje"
              className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide"
            >
              Mensaje <span className="text-red-500">*</span>
            </label>
            <textarea
              id="mensaje"
              name="mensaje"
              rows={5}
              value={fields.mensaje}
              onChange={handleChange}
              disabled={sending}
              maxLength={1000}
              className="w-full rounded-2xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none"
              placeholder="Cuéntanos en qué podemos ayudarte."
              required
            />
            <p className="text-[11px] text-gray-400 mt-1">
              No compartiremos estos datos con nadie. Se usan solo para responderte.
            </p>
          </div>

          <button
            type="submit"
            disabled={sending}
            className={`w-full mt-2 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg transition ${
              sending
                ? "bg-emerald-300 cursor-not-allowed"
                : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {sending ? (
              <>
                <span className="inline-block h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                Enviando mensaje…
              </>
            ) : (
              <>
                <span>Enviar mensaje</span>
              </>
            )}
          </button>
        </form>

        {/* COLUMNA LATERAL */}
        <aside className="bg-emerald-900 text-emerald-50 rounded-3xl shadow-xl px-6 py-7 flex flex-col justify-between">
          <div className="space-y-4">
            <h3 className="text-lg font-bold">¿Qué puedes escribirnos?</h3>
            <ul className="text-sm space-y-2 text-emerald-50/90">
              <li>• Problemas con tu anuncio o con el panel de usuario.</li>
              <li>• Ideas para mejorar EnMiPueblo.</li>
              <li>• Dudas sobre privacidad o funcionamiento de la web.</li>
            </ul>
          </div>

          <div className="mt-6 border-t border-emerald-700/60 pt-4 text-xs space-y-1">
            <p className="font-semibold text-emerald-100">
              También puedes escribirnos directamente a:
            </p>
            <a
              href="mailto:serviciosenmipueblo@gmail.com"
              className="text-emerald-200 hover:text-emerald-50 underline break-all"
            >
              serviciosenmipueblo@gmail.com
            </a>
            <p className="text-emerald-200/70">
              No es un canal de soporte urgente, pero intentamos responder
              siempre lo antes posible.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default ContactFormIsland;
