import React, { useEffect, useState, useRef } from "react";
import imageCompression from "browser-image-compression";
import { onUserStateChange, uploadFile } from "../lib/firebase.js";
import { buscarLocalidades } from "../lib/api-utils.js";

const CATEGORIAS = [
  "Albañilería",
  "Carpintería",
  "Electricidad",
  "Fontanería",
  "Pintura",
  "Jardinería",
  "Limpieza",
  "Panadería",
  "Hostelería",
  "Transporte",
  "Informática",
  "Diseño",
  "Marketing",
  "Clases Particulares",
  "Salud y Bienestar",
  "Turismo",
  "Eventos",
  "Asesoría Legal",
  "Otros",
];

const initialState = {
  nombre: "",
  categoria: "",
  oficio: "",
  descripcion: "",
  contacto: "",
  whatsapp: "",
  pueblo: "",
  provincia: "",
  comunidad: "",
};

const MAX_FOTOS = 6;
const MAX_VIDEO_SIZE = 40 * 1024 * 1024; // 40MB
const MAX_VIDEO_DURATION = 180; // 3 minutos
const MAX_IMG_SIZE_MB = 0.35;
const MAX_IMG_DIM = 1200;

type Localidad = {
  municipio_id: string | number;
  nombre: string;
  provincia?: string | { nombre: string };
  ccaa?: string | { nombre: string };
};

type FormMsg =
  | { msg: string; type: "success" | "error" | "info" }
  | null;

const OfrecerServicioIsland: React.FC = () => {
  const [user, setUser] = useState<any | null | undefined>(undefined);

  const [form, setForm] = useState(initialState);
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoURLs, setPhotoURLs] = useState<string[]>([]);
  const [video, setVideo] = useState<File | null>(null);
  const [videoURL, setVideoURL] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [formMsg, setFormMsg] = useState<FormMsg>(null);

  const [locQuery, setLocQuery] = useState("");
  const [locSuggestions, setLocSuggestions] = useState<Localidad[]>([]);
  const [selectedLoc, setSelectedLoc] = useState<Localidad | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const nombreRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  // ============================
  // USUARIO LOGUEADO
  // ============================
  useEffect(() => {
    const unsub = onUserStateChange((u: any) => setUser(u));
    return () => unsub && unsub();
  }, []);

  // ============================
  // AUTOCOMPLETE LOCALIDADES
  // ============================
  useEffect(() => {
    if (!locQuery || locQuery.length < 2) {
      setLocSuggestions([]);
      return;
    }

    let cancel = false;

    const fetchLocs = async () => {
      try {
        const res = await buscarLocalidades(locQuery);
        if (!cancel) {
          setLocSuggestions(res.data || []);
          setShowDropdown(true);
        }
      } catch {
        if (!cancel) {
          setLocSuggestions([]);
        }
      }
    };

    const t = setTimeout(fetchLocs, 200);
    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [locQuery]);

  const handleLocalidadInput = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const val = e.target.value;
    setLocQuery(val);
    setSelectedLoc(null);
    setShowDropdown(true);

    setForm((f) => ({
      ...f,
      pueblo: val,
      provincia: "",
      comunidad: "",
    }));
  };

  const applyLocalidad = (loc: Localidad) => {
    const provinciaNombre =
      typeof loc.provincia === "object"
        ? loc.provincia?.nombre
        : loc.provincia || "";
    const ccaaNombre =
      typeof loc.ccaa === "object" ? loc.ccaa?.nombre : loc.ccaa || "";

    setSelectedLoc(loc);
    setForm((f) => ({
      ...f,
      pueblo: loc.nombre,
      provincia: provinciaNombre || "",
      comunidad: ccaaNombre || "",
    }));

    setLocQuery(
      [loc.nombre, provinciaNombre, ccaaNombre].filter(Boolean).join(", ")
    );
    setShowDropdown(false);
  };

  const handleLocBlur = () =>
    setTimeout(() => setShowDropdown(false), 150);

  const ensureLocalidadCompleta = () => {
    if (selectedLoc) {
      const provinciaNombre =
        typeof selectedLoc.provincia === "object"
          ? selectedLoc.provincia?.nombre
          : selectedLoc.provincia || "";
      const ccaaNombre =
        typeof selectedLoc.ccaa === "object"
          ? selectedLoc.ccaa?.nombre
          : selectedLoc.ccaa || "";

      setForm((f) => ({
        ...f,
        pueblo: selectedLoc.nombre,
        provincia: provinciaNombre,
        comunidad: ccaaNombre,
      }));
      return true;
    }

    // Si no hay selectedLoc pero hay texto, no dejamos enviar
    return false;
  };

  // ============================
  // PREVIEW DE FOTOS
  // ============================
  useEffect(() => {
    if (photos.length === 0) {
      setPhotoURLs([]);
      return;
    }
    photos.forEach((file, i) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPhotoURLs((prev) => {
          const arr = [...prev];
          arr[i] = (e.target?.result as string) || "";
          return arr;
        });
      };
      reader.readAsDataURL(file);
    });
  }, [photos]);

  // ============================
  // HANDLERS FORM
  // ============================
  const handleInput = (
    e:
      | React.ChangeEvent<HTMLInputElement>
      | React.ChangeEvent<HTMLTextAreaElement>
      | React.ChangeEvent<HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const filesArr = Array.from(e.target.files);

    if (photos.length + filesArr.length > MAX_FOTOS) {
      setFormMsg({
        msg: `Máximo ${MAX_FOTOS} fotos permitidas.`,
        type: "error",
      });
      return;
    }

    const compressedArr: File[] = [];
    for (const file of filesArr) {
      if (!file.type.startsWith("image/")) continue;
      try {
        const compressed = await imageCompression(file, {
          maxWidthOrHeight: MAX_IMG_DIM,
          maxSizeMB: MAX_IMG_SIZE_MB,
          useWebWorker: true,
          initialQuality: 0.7,
        });
        compressedArr.push(compressed);
      } catch {
        setFormMsg({
          msg: "Error al procesar una imagen.",
          type: "error",
        });
      }
    }
    setPhotos((arr) => [...arr, ...compressedArr]);
  };

  const openPhotoDialog = () => {
    if (photoInputRef.current) {
      photoInputRef.current.value = "";
      photoInputRef.current.click();
    }
  };

  const openVideoDialog = () => {
    if (videoInputRef.current) {
      videoInputRef.current.value = "";
      videoInputRef.current.click();
    }
  };

  const removePhoto = (idx: number) =>
    setPhotos((arr) => arr.filter((_, i) => i !== idx));

  const handleDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    idx: number
  ) => {
    e.dataTransfer.setData("photoIndex", String(idx));
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, idx: number) => {
    const from = Number(e.dataTransfer.getData("photoIndex"));
    if (from === idx) return;
    const newPhotos = [...photos];
    const moved = newPhotos.splice(from, 1)[0];
    newPhotos.splice(idx, 0, moved);
    setPhotos(newPhotos);
  };

  const handleVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) {
      setVideo(null);
      setVideoURL("");
      return;
    }
    const file = e.target.files[0];

    if (file.size > MAX_VIDEO_SIZE) {
      setFormMsg({
        msg: "El video no puede superar los 40MB.",
        type: "error",
      });
      return;
    }

    const videoElem = document.createElement("video");
    videoElem.preload = "metadata";
    videoElem.onloadedmetadata = () => {
      window.URL.revokeObjectURL(videoElem.src);
      if (videoElem.duration > MAX_VIDEO_DURATION) {
        setFormMsg({
          msg: "El video no puede durar más de 3 minutos.",
          type: "error",
        });
        setVideo(null);
        setVideoURL("");
      } else {
        setVideo(file);
        setVideoURL(URL.createObjectURL(file));
      }
    };
    videoElem.src = URL.createObjectURL(file);
  };

  const resetForm = () => {
    setForm(initialState);
    setLocQuery("");
    setSelectedLoc(null);
    setPhotos([]);
    setPhotoURLs([]);
    setVideo(null);
    setVideoURL("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      setFormMsg({
        msg: "Debes iniciar sesión para publicar.",
        type: "error",
      });
      return;
    }

    if (!ensureLocalidadCompleta()) {
      setFormMsg({
        msg: "Debes elegir una localidad válida del listado.",
        type: "error",
      });
      return;
    }

    if (
      !form.nombre ||
      !form.categoria ||
      !form.oficio ||
      !form.descripcion ||
      !form.contacto
    ) {
      setFormMsg({
        msg: "Completa los campos obligatorios (nombre, categoría, oficio, descripción, contacto).",
        type: "error",
      });
      return;
    }

    setLoading(true);
    setFormMsg(null);

    try {
      // 1. Subir fotos a Firebase Storage
      const photoUrls: string[] = [];
      for (const file of photos) {
        const url = await uploadFile(file, "service_images");
        photoUrls.push(url);
      }

      // 2. Subir video (opcional)
      let videoUrl = "";
      if (video) {
        try {
          videoUrl = await uploadFile(video, "service_images/videos");
        } catch {
          setLoading(false);
          setFormMsg({
            msg: "Error al subir el video.",
            type: "error",
          });
          return;
        }
      }

      // 3. Construir payload para el backend
      const payload = {
        nombre: form.nombre,
        categoria: form.categoria,
        oficio: form.oficio,
        descripcion: form.descripcion,
        contacto: form.contacto,
        whatsapp: form.whatsapp || "",
        pueblo: form.pueblo,
        provincia: form.provincia,
        comunidad: form.comunidad,
        imagenes: photoUrls,
        videoUrl,
        // usuarioEmail lo pone el backend desde el token
      };

      // 4. Obtener el ID token de Firebase del usuario actual
      let idToken: string | null = null;
      try {
        if (user && typeof user.getIdToken === "function") {
          idToken = await user.getIdToken();
        }
      } catch (err) {
        console.warn("No se pudo obtener el token de Firebase:", err);
      }

      // 5. Llamar al backend seguro: POST /api/servicios con Authorization: Bearer
      const base = import.meta.env.PUBLIC_BACKEND_URL || "";
      const API = base.endsWith("/api") ? base : `${base}/api`;

      const res = await fetch(`${API}/servicios`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Error creando servicio:", res.status, text);
        setFormMsg({
          msg:
            "No se pudo guardar el servicio. Inténtalo de nuevo en unos minutos.",
          type: "error",
        });
        setLoading(false);
        return;
      }

      // Opcionalmente podríamos leer el JSON:
      // const data = await res.json();

      // ✅ Redirigir al panel de anuncios para que veas el nuevo servicio
      window.location.href = "/usuario/panel";
      return;
    } catch (err) {
      console.error("Error al crear servicio:", err);
      setFormMsg({
        msg: "Ocurrió un error al guardar el servicio.",
        type: "error",
      });
    } finally {
      setLoading(false);
      resetForm();
    }
  };

  // ============================
  // RENDER
  // ============================
  if (user === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-emerald-700 animate-pulse">
        Cargando formulario seguro…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <h2 className="text-2xl font-bold text-emerald-800 mb-3">
          Inicia sesión para publicar tu servicio
        </h2>
        <p className="text-gray-600 mb-6 max-w-md">
          EnMiPueblo necesita saber quién eres para mostrar tus anuncios en tu
          panel y permitirte editarlos o eliminarlos.
        </p>
        <button
          className="bg-emerald-600 text-white px-6 py-3 rounded-xl shadow hover:bg-emerald-700"
          onClick={() =>
            (window as any).showAuthModal &&
            (window as any).showAuthModal()
          }
        >
          Iniciar sesión
        </button>
      </div>
    );
  }

  return (
    <form
      className="bg-white rounded-3xl shadow-xl px-6 md:px-10 py-10 space-y-8 text-left border-2 border-green-100 max-w-3xl mx-auto"
      onSubmit={handleSubmit}
      id="ofrecer-servicio-form"
      autoComplete="off"
    >
      <header className="space-y-2">
        <h1 className="text-2xl md:text-3xl font-extrabold text-emerald-800">
          Publicar un servicio en tu pueblo
        </h1>
        <p className="text-gray-600 text-sm md:text-base">
          Cuenta qué hacés, en qué pueblo trabajás y cómo pueden contactarte.{" "}
          <span className="font-semibold">
            Las fotos y el video son opcionales pero muy recomendables.
          </span>
        </p>
      </header>

      {formMsg && (
        <div
          className={`p-3 rounded-xl text-sm ${
            formMsg.type === "success"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : formMsg.type === "error"
              ? "bg-red-50 text-red-700 border border-red-200"
              : "bg-blue-50 text-blue-700 border border-blue-200"
          }`}
        >
          {formMsg.msg}
        </div>
      )}

      {/* CAMPOS PRINCIPALES */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Nombre del servicio *
            </label>
            <input
              ref={nombreRef}
              name="nombre"
              value={form.nombre}
              onChange={handleInput}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Ej: Electricista urgente 24h"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Categoría *
            </label>
            <select
              name="categoria"
              value={form.categoria}
              onChange={handleInput}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              required
            >
              <option value="">Selecciona una categoría</option>
              {CATEGORIAS.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Oficio / título corto *
            </label>
            <input
              name="oficio"
              value={form.oficio}
              onChange={handleInput}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Ej: Instalaciones eléctricas, reformas..."
              required
            />
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Localidad (pueblo) *
            </label>
            <input
              value={locQuery}
              onChange={handleLocalidadInput}
              onBlur={handleLocBlur}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Escribe tu pueblo y elige del listado"
              required
            />
            {showDropdown && locSuggestions.length > 0 && (
              <div className="mt-1 max-h-60 overflow-auto bg-white border border-gray-200 rounded-xl shadow-lg text-sm z-10 relative">
                {locSuggestions.map((loc) => {
                  const provinciaNombre =
                    typeof loc.provincia === "object"
                      ? loc.provincia?.nombre
                      : loc.provincia || "";
                  const ccaaNombre =
                    typeof loc.ccaa === "object"
                      ? loc.ccaa?.nombre
                      : loc.ccaa || "";

                  return (
                    <button
                      key={loc.municipio_id}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-emerald-50"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applyLocalidad(loc);
                      }}
                    >
                      <span className="font-medium">{loc.nombre}</span>
                      <span className="text-gray-500 ml-1">
                        {[provinciaNombre, ccaaNombre]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Contacto (email o teléfono) *
            </label>
            <input
              name="contacto"
              value={form.contacto}
              onChange={handleInput}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Donde pueden contactarte"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              WhatsApp (opcional)
            </label>
            <input
              name="whatsapp"
              value={form.whatsapp}
              onChange={handleInput}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="+34 ..."
            />
          </div>
        </div>
      </div>

      {/* DESCRIPCIÓN */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Descripción detallada *
        </label>
        <textarea
          name="descripcion"
          value={form.descripcion}
          onChange={handleInput}
          rows={5}
          className="w-full border border-gray-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder="Cuenta qué ofreces, experiencia, zonas donde trabajas, etc."
          required
        />
      </div>

      {/* FOTOS */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">
            Fotos del servicio (máx. {MAX_FOTOS})
          </h2>
          <button
            type="button"
            onClick={openPhotoDialog}
            className="text-sm bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-xl border border-emerald-200 hover:bg-emerald-100"
          >
            Añadir fotos
          </button>
        </div>

        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handlePhoto}
          className="hidden"
        />

        {photoURLs.length === 0 ? (
          <p className="text-xs text-gray-500">
            Todavía no subiste fotos. No son obligatorias, pero ayudan mucho.
          </p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {photoURLs.map((url, idx) => (
              <div
                key={idx}
                className="relative group rounded-xl overflow-hidden border border-gray-200"
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(e, idx)}
              >
                <img
                  src={url}
                  alt={`Foto ${idx + 1}`}
                  className="w-full h-24 object-cover"
                />
                <button
                  type="button"
                  onClick={() => removePhoto(idx)}
                  className="absolute top-1 right-1 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full opacity-0 group-hover:opacity-100"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* VIDEO */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">
            Video de presentación (opcional, máx. 3 minutos / 40MB)
          </h2>
          <button
            type="button"
            onClick={openVideoDialog}
            className="text-sm bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-xl border border-emerald-200 hover:bg-emerald-100"
          >
            Subir video
          </button>
        </div>

        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          onChange={handleVideo}
          className="hidden"
        />

        {videoURL && (
          <video
            src={videoURL}
            controls
            className="mt-2 w-full max-h-64 rounded-2xl shadow"
          />
        )}
      </div>

      {/* BOTÓN ENVIAR */}
      <div className="flex justify-end pt-4">
        <button
          type="submit"
          disabled={loading}
          className="bg-emerald-600 disabled:bg-emerald-300 text-white font-semibold px-6 py-3 rounded-xl shadow hover:bg-emerald-700"
        >
          {loading ? "Publicando servicio…" : "Publicar servicio"}
        </button>
      </div>
    </form>
  );
};

export default OfrecerServicioIsland;
