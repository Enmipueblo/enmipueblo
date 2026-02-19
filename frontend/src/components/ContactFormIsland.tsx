// frontend/src/components/ContactFormIsland.tsx
import React, { useMemo, useState } from "react";

type FormState = "idle" | "sending" | "sent" | "error";

function cx(...p: Array<string | false | null | undefined>) {
  return p.filter(Boolean).join(" ");
}

export default function ContactFormIsland() {
  const [state, setState] = useState<FormState>("idle");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const canSend = useMemo(() => {
    const e = email.trim();
    const okEmail = e.includes("@") && e.includes(".");
    return name.trim().length >= 2 && okEmail && message.trim().length >= 10;
  }, [name, email, message]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend || state === "sending") return;

    setState("sending");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          subject: subject.trim(),
          message: message.trim(),
        }),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `HTTP ${res.status}`);
      }

      setState("sent");
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
    } catch (err) {
      console.error("Error enviando contacto:", err);
      setState("error");
    }
  };

  const hint =
    state === "sent"
      ? { title: "¡Enviado!", text: "Gracias. Te responderemos lo antes posible." }
      : state === "error"
      ? { title: "No se pudo enviar", text: "Revisa tu conexión e inténtalo de nuevo en unos minutos." }
      : null;

  return (
    <div
      className="rounded-3xl border shadow-[0_18px_50px_-46px_rgba(0,0,0,0.35)] bg-white/70 backdrop-blur overflow-hidden"
      style={{ borderColor: "var(--sb-border)" }}
    >
      <div className="p-6 md:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <h3 className="text-xl md:text-2xl font-extrabold" style={{ color: "var(--sb-ink)" }}>
              Escríbenos
            </h3>
            <p className="mt-2 text-sm md:text-base" style={{ color: "var(--sb-ink2)" }}>
              Soporte, sugerencias, reportes o cualquier duda.
            </p>

            <div className="mt-6 grid gap-3 text-sm" style={{ color: "var(--sb-ink2)" }}>
              <div className="rounded-2xl border bg-white/60 p-4" style={{ borderColor: "var(--sb-border)" }}>
                <div className="text-xs font-extrabold tracking-widest uppercase" style={{ color: "var(--sb-muted)" }}>
                  Consejo
                </div>
                <div className="mt-1">
                  Si es un problema con un servicio, pega el enlace del anuncio en el mensaje.
                </div>
              </div>

              <div className="rounded-2xl border bg-white/60 p-4" style={{ borderColor: "var(--sb-border)" }}>
                <div className="text-xs font-extrabold tracking-widest uppercase" style={{ color: "var(--sb-muted)" }}>
                  Tiempo de respuesta
                </div>
                <div className="mt-1">Normalmente respondemos en 24–48h.</div>
              </div>
            </div>
          </div>

          <div>
            {hint && (
              <div
                className={cx(
                  "mb-4 rounded-2xl border px-4 py-3 text-sm",
                  state === "sent" && "border-[rgba(14,165,164,0.35)] bg-[rgba(14,165,164,0.08)]",
                  state === "error" && "border-[rgba(220,38,38,0.30)] bg-[rgba(220,38,38,0.06)]"
                )}
                style={{ color: state === "error" ? "rgb(127,29,29)" : "var(--sb-ink)" }}
              >
                <div className="font-extrabold">{hint.title}</div>
                <div className="mt-1" style={{ color: state === "error" ? "rgb(127,29,29)" : "var(--sb-ink2)" }}>
                  {hint.text}
                </div>
              </div>
            )}

            <form onSubmit={submit} className="grid gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-extrabold" style={{ color: "var(--sb-ink2)" }}>Nombre</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 w-full rounded-2xl border px-3 py-2.5 text-sm bg-white/80"
                    style={{ borderColor: "var(--sb-border)" }}
                    placeholder="Tu nombre"
                    autoComplete="name"
                  />
                </div>

                <div>
                  <label className="text-xs font-extrabold" style={{ color: "var(--sb-ink2)" }}>Email</label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 w-full rounded-2xl border px-3 py-2.5 text-sm bg-white/80"
                    style={{ borderColor: "var(--sb-border)" }}
                    placeholder="tu@email.com"
                    autoComplete="email"
                    type="email"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-extrabold" style={{ color: "var(--sb-ink2)" }}>Asunto (opcional)</label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="mt-1 w-full rounded-2xl border px-3 py-2.5 text-sm bg-white/80"
                  style={{ borderColor: "var(--sb-border)" }}
                  placeholder="Ej: No puedo subir fotos"
                />
              </div>

              <div>
                <label className="text-xs font-extrabold" style={{ color: "var(--sb-ink2)" }}>Mensaje</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="mt-1 w-full rounded-2xl border px-3 py-2.5 text-sm bg-white/80 min-h-[160px]"
                  style={{ borderColor: "var(--sb-border)" }}
                  placeholder="Cuéntanos qué necesitas…"
                />
                <div className="mt-1 text-xs" style={{ color: "var(--sb-muted)" }}>
                  Mínimo 10 caracteres.
                </div>
              </div>

              <button
                type="submit"
                disabled={!canSend || state === "sending"}
                className="inline-flex items-center justify-center rounded-2xl px-5 py-3 text-sm font-extrabold border shadow-sm disabled:opacity-60"
                style={{
                  background: "var(--sb-blue)",
                  color: "white",
                  borderColor: "rgba(14,165,164,0.35)",
                }}
              >
                {state === "sending" ? "Enviando..." : "Enviar mensaje"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
