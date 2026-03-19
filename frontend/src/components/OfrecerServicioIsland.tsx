import React, { useEffect, useMemo, useState } from "react";
import { onUserStateChange } from "../lib/firebase.js";

type LocalidadItem = {
  nombre: string;
  provincia?: string;
  ccaa?: string;
};

type FormState = {
  nombre: string;
  profesionalNombre: string;
  oficio: string;
  categoria: string;
  descripcion: string;
  email: string;
  telefono: string;
  whatsapp: string;
  pueblo: string;
  provincia: string;
  comunidad: string;
};

const CATEGORIAS = [
  "Fontanería",
  "Electricidad",
  "Carpintería",
  "Jardinería",
  "Limpieza",
  "Pintura",
  "Reformas",
  "Informática",
  "Clases particulares",
  "Costura",
  "Belleza",
  "Salud",
  "Hostelería",
  "Otros",
];

function getStoredAuth(): { token?: string; user?: any } | null {
  try {
    return JSON.parse(localStorage.getItem("enmipueblo_auth_v1") || "null");
  } catch {
    return null;
  }
}

function getToken(): string {
  const auth = getStoredAuth();
  const token = auth?.token;
  if (!token) throw new Error("No hay sesión iniciada.");
  return token;
}

function normalizeLocalidadLabel(item: LocalidadItem) {
  return [item.nombre, item.provincia, item.ccaa].filter(Boolean).join(" · ");
}

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error || json?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

function pickUploadData(json: any) {
  const data = json?.data || json || {};
  return {
    uploadUrl:
      data.uploadUrl ||
      data.signedUrl ||
      data.url ||
      data.putUrl ||
      "",
    publicUrl:
      data.publicUrl ||
      data.publicURL ||
      data.fileUrl ||
      data.fileURL ||
      "",
    method: String(data.method || "PUT").toUpperCase(),
    headers: data.headers || {},
  };
}

async function uploadFile(file: File): Promise<string> {
  const token = getToken();

  const sign = await fetchJson("/api/uploads/sign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      folder: "service_images/fotos",
    }),
  });

  const { uploadUrl, publicUrl, method, headers } = pickUploadData(sign);

  if (!uploadUrl || !publicUrl) {
    throw new Error("La firma de subida no devolvió uploadUrl/publicUrl.");
  }

  const putHeaders: Record<string, string> = {
    ...(headers || {}),
  };

  if (!putHeaders["Content-Type"] && file.type) {
    putHeaders["Content-Type"] = file.type;
  }

  const put = await fetch(uploadUrl, {
    method,
    headers: putHeaders,
    body: file,
  });

  if (!put.ok) {
    throw new Error(`Falló la subida del archivo (${put.status}).`);
  }

  return publicUrl;
}

const initialForm: FormState = {
  nombre: "",
  profesionalNombre: "",
  oficio: "",
  categoria: "",
  descripcion: "",
  email: "",
  telefono: "",
  whatsapp: "",
  pueblo: "",
  provincia: "",
  comunidad: "",
};

const OfrecerServicioIsland: React.FC = () => {
  const [user, setUser] = useState<any | null>(null);

  const [form, setForm] = useState<FormState>(initialForm);
  const [localidadInput, setLocalidadInput] = useState("");
  const [localidades, setLocalidades] = useState<LocalidadItem[]>([]);
  const [selectedLocalidad, setSelectedLocalidad] = useState<LocalidadItem | null>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [loadingLocalidades, setLoadingLocalidades] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [okMsg, setOkMsg] = useState("");

  useEffect(() => {
    const unsub = onUserStateChange((u: any) => {
      setUser(u || null);
      if (u?.email) {
        setForm((prev) => ({
          ...prev,
          email: prev.email || u.email,
        }));
      }
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    const q = localidadInput.trim();

    if (q.length < 2) {
      setLocalidades([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        setLoadingLocalidades(true);
        const json = await fetchJson(`/api/localidades?q=${encodeURIComponent(q)}`);
        const data = Array.isArray(json?.data) ? json.data : [];
        if (!cancelled) setLocalidades(data.slice(0, 8));
      } catch (err) {
        if (!cancelled) setLocalidades([]);
      } finally {
        if (!cancelled) setLoadingLocalidades(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [localidadInput]);

  const canSubmit = useMemo(() => {
    return (
      !!user &&
      !!form.oficio.trim() &&
      !!form.descripcion.trim() &&
      !!selectedLocalidad &&
      !publishing
    );
  }, [user, form.oficio, form.descripcion, selectedLocalidad, publishing]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function selectLocalidad(item: LocalidadItem) {
    setSelectedLocalidad(item);
    setLocalidadInput(item.nombre || "");
    setLocalidades([]);
    setForm((prev) => ({
      ...prev,
      pueblo: item.nombre || "",
      provincia: item.provincia || "",
      comunidad: item.ccaa || "",
    }));
  }

  function onChangeLocalidad(value: string) {
    setLocalidadInput(value);
    setSelectedLocalidad(null);
    setForm((prev) => ({
      ...prev,
      pueblo: "",
      provincia: "",
      comunidad: "",
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    setOkMsg("");

    if (!user) {
      setErrorMsg("Debes iniciar sesión con Google para publicar.");
      return;
    }

    if (!selectedLocalidad) {
      setErrorMsg("Selecciona una localidad de la lista. Ya no usamos mapa ni coordenadas.");
      return;
    }

    if (!form.oficio.trim()) {
      setErrorMsg("Indica el oficio o servicio.");
      return;
    }

    if (!form.descripcion.trim()) {
      setErrorMsg("Escribe una descripción del servicio.");
      return;
    }

    setPublishing(true);

    try {
      const token = getToken();

      let imagenes: string[] = [];
      if (files.length > 0) {
        imagenes = await Promise.all(files.map((f) => uploadFile(f)));
      }

      const payload: any = {
        nombre:
          form.nombre.trim() ||
          `${form.oficio.trim()} en ${selectedLocalidad.nombre}`,
        profesionalNombre: form.profesionalNombre.trim() || user?.name || "",
        oficio: form.oficio.trim(),
        categoria: form.categoria.trim() || form.oficio.trim(),
        descripcion: form.descripcion.trim(),
        email: form.email.trim() || user?.email || "",
        telefono: form.telefono.trim(),
        whatsapp: form.whatsapp.trim(),
        contacto:
          form.email.trim() ||
          form.telefono.trim() ||
          form.whatsapp.trim() ||
          user?.email ||
          "",
        pueblo: selectedLocalidad.nombre || "",
        provincia: selectedLocalidad.provincia || "",
        comunidad: selectedLocalidad.ccaa || "",
        imagenes,
      };

      const json = await fetchJson("/api/servicios", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      setOkMsg("Servicio publicado correctamente. Queda pendiente de revisión.");
      setErrorMsg("");
      setFiles([]);
      setSelectedLocalidad(null);
      setLocalidades([]);
      setLocalidadInput("");
      setForm({
        ...initialForm,
        email: user?.email || "",
      });

      setTimeout(() => {
        window.location.href = "/mi-panel";
      }, 900);
    } catch (err: any) {
      console.error("Error publicando servicio:", err);
      setErrorMsg(err?.message || "Error publicando. Revisa tu conexión e inténtalo.");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div
        className="rounded-3xl border p-5 shadow-sm md:p-8"
        style={{
          background: "rgba(255,255,255,0.84)",
          borderColor: "var(--sb-border)",
          backdropFilter: "blur(10px)",
        }}
      >
        <div className="mb-6">
          <h1 className="text-3xl font-black" style={{ color: "var(--sb-ink)" }}>
            Publica tu servicio
          </h1>
          <p className="mt-2 text-sm md:text-base" style={{ color: "var(--sb-ink2)" }}>
            Sin mapa ni coordenadas. Solo se permiten localidades cargadas en el sistema.
          </p>
        </div>

        {!user ? (
          <div className="rounded-2xl border p-4 text-sm" style={{ borderColor: "rgba(214,93,14,0.20)", background: "rgba(214,93,14,0.06)", color: "var(--sb-ink)" }}>
            Debes iniciar sesión con Google para publicar.
          </div>
        ) : null}

        {errorMsg ? (
          <div className="mb-4 rounded-2xl border p-4 text-sm" style={{ borderColor: "rgba(220,38,38,0.18)", background: "rgba(220,38,38,0.06)", color: "#991b1b" }}>
            {errorMsg}
          </div>
        ) : null}

        {okMsg ? (
          <div className="mb-4 rounded-2xl border p-4 text-sm" style={{ borderColor: "rgba(14,165,164,0.18)", background: "rgba(14,165,164,0.06)", color: "var(--sb-ink)" }}>
            {okMsg}
          </div>
        ) : null}

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold" style={{ color: "var(--sb-ink)" }}>
                Título del anuncio
              </label>
              <input
                value={form.nombre}
                onChange={(e) => updateField("nombre", e.target.value)}
                placeholder="Ej: Electricista urgente en Graus"
                className="w-full rounded-2xl border px-4 py-3 outline-none"
                style={{ borderColor: "var(--sb-border)", background: "rgba(255,255,255,0.92)" }}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold" style={{ color: "var(--sb-ink)" }}>
                Nombre del profesional
              </label>
              <input
                value={form.profesionalNombre}
                onChange={(e) => updateField("profesionalNombre", e.target.value)}
                placeholder="Tu nombre o nombre comercial"
                className="w-full rounded-2xl border px-4 py-3 outline-none"
                style={{ borderColor: "var(--sb-border)", background: "rgba(255,255,255,0.92)" }}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold" style={{ color: "var(--sb-ink)" }}>
                Oficio / servicio *
              </label>
              <input
                value={form.oficio}
                onChange={(e) => updateField("oficio", e.target.value)}
                placeholder="Ej: Fontanero"
                className="w-full rounded-2xl border px-4 py-3 outline-none"
                style={{ borderColor: "var(--sb-border)", background: "rgba(255,255,255,0.92)" }}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold" style={{ color: "var(--sb-ink)" }}>
                Categoría
              </label>
              <select
                value={form.categoria}
                onChange={(e) => updateField("categoria", e.target.value)}
                className="w-full rounded-2xl border px-4 py-3 outline-none"
                style={{ borderColor: "var(--sb-border)", background: "rgba(255,255,255,0.92)" }}
              >
                <option value="">Selecciona una categoría</option>
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold" style={{ color: "var(--sb-ink)" }}>
              Localidad *
            </label>
            <div className="relative">
              <input
                value={localidadInput}
                onChange={(e) => onChangeLocalidad(e.target.value)}
                placeholder="Escribe y elige una localidad cargada"
                className="w-full rounded-2xl border px-4 py-3 outline-none"
                style={{ borderColor: "var(--sb-border)", background: "rgba(255,255,255,0.92)" }}
              />

              {localidadInput.trim().length >= 2 && (localidades.length > 0 || loadingLocalidades) ? (
                <div
                  className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border shadow-lg"
                  style={{ borderColor: "var(--sb-border)", background: "#fff" }}
                >
                  {loadingLocalidades ? (
                    <div className="px-4 py-3 text-sm" style={{ color: "var(--sb-ink2)" }}>
                      Buscando localidades…
                    </div>
                  ) : (
                    localidades.map((item, idx) => (
                      <button
                        key={`${item.nombre}-${item.provincia}-${idx}`}
                        type="button"
                        onClick={() => selectLocalidad(item)}
                        className="block w-full px-4 py-3 text-left text-sm hover:bg-black/5"
                      >
                        <div className="font-bold" style={{ color: "var(--sb-ink)" }}>
                          {item.nombre}
                        </div>
                        <div style={{ color: "var(--sb-ink2)" }}>
                          {normalizeLocalidadLabel(item)}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>

            {selectedLocalidad ? (
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                <span className="rounded-full border px-3 py-1.5" style={{ background: "rgba(14,165,164,0.10)", borderColor: "rgba(14,165,164,0.18)", color: "var(--sb-ink)" }}>
                  {selectedLocalidad.nombre}
                </span>
                {selectedLocalidad.provincia ? (
                  <span className="rounded-full border px-3 py-1.5" style={{ background: "rgba(214,93,14,0.08)", borderColor: "rgba(214,93,14,0.18)", color: "var(--sb-ink)" }}>
                    {selectedLocalidad.provincia}
                  </span>
                ) : null}
                {selectedLocalidad.ccaa ? (
                  <span className="rounded-full border px-3 py-1.5" style={{ background: "rgba(15,23,42,0.04)", borderColor: "rgba(15,23,42,0.10)", color: "var(--sb-ink)" }}>
                    {selectedLocalidad.ccaa}
                  </span>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-xs" style={{ color: "var(--sb-ink2)" }}>
                Debes seleccionar una localidad de la lista. No se usan coordenadas.
              </p>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold" style={{ color: "var(--sb-ink)" }}>
              Descripción *
            </label>
            <textarea
              value={form.descripcion}
              onChange={(e) => updateField("descripcion", e.target.value)}
              placeholder="Describe bien tu servicio, experiencia, horarios, desplazamiento, etc."
              rows={6}
              className="w-full rounded-2xl border px-4 py-3 outline-none"
              style={{ borderColor: "var(--sb-border)", background: "rgba(255,255,255,0.92)" }}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-bold" style={{ color: "var(--sb-ink)" }}>
                Email
              </label>
              <input
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
                placeholder="tu@email.com"
                className="w-full rounded-2xl border px-4 py-3 outline-none"
                style={{ borderColor: "var(--sb-border)", background: "rgba(255,255,255,0.92)" }}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold" style={{ color: "var(--sb-ink)" }}>
                Teléfono
              </label>
              <input
                value={form.telefono}
                onChange={(e) => updateField("telefono", e.target.value)}
                placeholder="600123123"
                className="w-full rounded-2xl border px-4 py-3 outline-none"
                style={{ borderColor: "var(--sb-border)", background: "rgba(255,255,255,0.92)" }}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold" style={{ color: "var(--sb-ink)" }}>
                WhatsApp
              </label>
              <input
                value={form.whatsapp}
                onChange={(e) => updateField("whatsapp", e.target.value)}
                placeholder="34600123123"
                className="w-full rounded-2xl border px-4 py-3 outline-none"
                style={{ borderColor: "var(--sb-border)", background: "rgba(255,255,255,0.92)" }}
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold" style={{ color: "var(--sb-ink)" }}>
              Imágenes
            </label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                const picked = Array.from(e.target.files || []);
                setFiles(picked);
              }}
              className="block w-full text-sm"
            />
            {files.length > 0 ? (
              <p className="mt-2 text-xs" style={{ color: "var(--sb-ink2)" }}>
                {files.length} archivo(s) preparado(s) para subir.
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 pt-2 sm:flex-row">
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center justify-center rounded-2xl px-6 py-3 font-extrabold text-white disabled:opacity-50"
              style={{ background: "var(--sb-accent2)" }}
            >
              {publishing ? "Publicando…" : "Publicar servicio"}
            </button>

            <a
              href="/mi-panel"
              className="inline-flex items-center justify-center rounded-2xl border px-6 py-3 font-extrabold"
              style={{ borderColor: "var(--sb-border)", color: "var(--sb-ink)", background: "rgba(255,255,255,0.76)" }}
            >
              Ir a mi panel
            </a>
          </div>
        </form>
      </div>
    </div>
  );
};

export default OfrecerServicioIsland;