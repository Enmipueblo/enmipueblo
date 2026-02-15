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
            "Ocurrió un error al enviar el mensaje. Inténtalo de nuevo en unos minutos (o escríbenos por email).",
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

  const inputBase =
    "w-full rounded-xl border px-3 py-2.5 text-sm " +
    "bg-white/80 backdrop-blur " +
    "focus:outline-none focus:ring-4 focus:ring-cyan-100";

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="grid gap-8 md:grid-cols-[1.2fr,0.9fr] items-stretch">
        {/* FORMULARIO */}
        <form
          onSubmit={handleSubmit}
          autoComplete="off"
          className="rounded-3xl shadow-xl border px-6 md:px-8 py-7 space-y-5"
          style={{
            background: "var(--sb-card2)",
            borderColor: "var(--sb-border)",
            backdropFilter: "blur(10px)",
          }}
        >
          <div className="flex items-center gap-3 mb-1">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center border"
              style={{
                background: "rgba(90, 208, 230, 0.18)",
                borderColor: "rgba(90, 208, 230, 0.30)",
              }}
            >
              <span className="text-xl" style={{ color: "var(--sb-ink)" }}>
                ✉️
              </span>
            </div>
            <div>
              <h2
                className="text-xl md:text-2xl font-extrabold leading-tight"
                style={{ color: "var(--sb-ink)" }}
              >
                Escríbenos a EnMiPueblo
              </h2>
              <p className="text-xs md:text-sm" style={{ color: "var(--sb-ink2)" }}>
                Respondemos normalmente en menos de 24&nbsp;hs laborables.
              </p>
            </div>
          </div>

          {message.text && (
            <div
              className="text-sm rounded-xl px-3 py-2 mb-1 text-center font-medium border"
              style={{
                background:
                  message.type === "success"
                    ? "rgba(185, 247, 215, 0.28)"
                    : message.type === "error"
                    ? "rgba(254, 202, 202, 0.40)"
                    : "rgba(226, 232, 240, 0.55)",
                borderColor:
                  message.type === "success"
                    ? "rgba(185, 247, 215, 0.55)"
                    : message.type === "error"
                    ? "rgba(254, 202, 202, 0.70)"
                    : "rgba(148, 163, 184, 0.35)",
                color:
                  message.type === "error" ? "#7f1d1d" : "var(--sb-ink)",
              }}
            >
              {message.text}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label
                htmlFor="nombre"
                className="block text-xs font-semibold mb-1 uppercase tracking-wide"
                style={{ color: "var(--sb-ink2)" }}
              >
                Nombre <span style={{ color: "#ef4444" }}>*</span>
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
                className={inputBase}
                style={{ borderColor: "var(--sb-border)", color: "var(--sb-ink)" }}
                placeholder="Tu nombre"
                required
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold mb-1 uppercase tracking-wide"
                style={{ color: "var(--sb-ink2)" }}
              >
                Email <span style={{ color: "#ef4444" }}>*</span>
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
                className={inputBase}
                style={{ borderColor: "var(--sb-border)", color: "var(--sb-ink)" }}
                placeholder="tucorreo@ejemplo.com"
                required
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="asunto"
              className="block text-xs font-semibold mb-1 uppercase tracking-wide"
              style={{ color: "var(--sb-ink2)" }}
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
              className={inputBase}
              style={{ borderColor: "var(--sb-border)", color: "var(--sb-ink)" }}
              placeholder="Ej: Consulta sobre mi anuncio"
            />
          </div>

          <div>
            <label
              htmlFor="mensaje"
              className="block text-xs font-semibold mb-1 uppercase tracking-wide"
              style={{ color: "var(--sb-ink2)" }}
            >
              Mensaje <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <textarea
              id="mensaje"
              name="mensaje"
              rows={5}
              value={fields.mensaje}
              onChange={handleChange}
              disabled={sending}
              maxLength={1000}
              className="w-full rounded-2xl border px-3 py-2.5 text-sm bg-white/80 backdrop-blur focus:outline-none focus:ring-4 focus:ring-cyan-100 resize-none"
              style={{ borderColor: "var(--sb-border)", color: "var(--sb-ink)" }}
              placeholder="Cuéntanos en qué podemos ayudarte."
              required
            />
            <p className="text-[11px] mt-1" style={{ color: "var(--sb-ink2)" }}>
              No compartiremos estos datos con nadie. Se usan solo para responderte.
            </p>
          </div>

          <button
            type="submit"
            disabled={sending}
            className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:brightness-[0.97] active:brightness-[0.95]"
            style={{
              background: sending
                ? "linear-gradient(90deg, rgba(90,208,230,0.55), rgba(185,247,215,0.55))"
                : "linear-gradient(90deg, var(--sb-blue), var(--sb-accent))",
              cursor: sending ? "not-allowed" : "pointer",
            }}
          >
            {sending ? (
              <>
                <span className="inline-block h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                Enviando mensaje…
              </>
            ) : (
              <span>Enviar mensaje</span>
            )}
          </button>
        </form>

        {/* COLUMNA LATERAL (ANTES ERA VERDE SÓLIDO) */}
        <aside
          className="rounded-3xl shadow-xl px-6 py-7 flex flex-col justify-between border"
          style={{
            background:
              "linear-gradient(180deg, rgba(7, 89, 133, 0.92) 0%, rgba(15, 118, 110, 0.90) 55%, rgba(30, 64, 175, 0.88) 100%)",
            borderColor: "rgba(255,255,255,0.14)",
          }}
        >
          <div className="space-y-4">
            <h3 className="text-lg font-extrabold" style={{ color: "rgba(255,255,255,0.95)" }}>
              ¿Qué puedes escribirnos?
            </h3>
            <ul className="text-sm space-y-2" style={{ color: "rgba(255,255,255,0.88)" }}>
              <li>• Problemas con tu anuncio o con el panel de usuario.</li>
              <li>• Ideas para mejorar EnMiPueblo.</li>
              <li>• Dudas sobre privacidad o funcionamiento de la web.</li>
            </ul>
          </div>

          <div className="mt-6 pt-4 text-xs space-y-1 border-t" style={{ borderColor: "rgba(255,255,255,0.18)" }}>
            <p className="font-semibold" style={{ color: "rgba(255,255,255,0.92)" }}>
              También puedes escribirnos directamente a:
            </p>
            <a
              href="mailto:serviciosenmipueblo@gmail.com"
              className="underline break-all hover:opacity-90"
              style={{ color: "rgba(185,247,215,0.95)" }}
            >
              serviciosenmipueblo@gmail.com
            </a>
            <p style={{ color: "rgba(255,255,255,0.78)" }}>
              No es un canal de soporte urgente, pero intentamos responder siempre lo antes posible.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default ContactFormIsland;
