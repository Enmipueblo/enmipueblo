import React, { useEffect, useRef, useState } from "react";
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
const MAX_VIDEO_DURATION = 180; // 3 min
const MAX_IMG_SIZE_MB = 0.45;
const MAX_IMG_DIM = 1400;
const UPLOAD_CONCURRENCY = 3;

type Localidad = {
  municipio_id: string | number;
  nombre: string;
  provincia?: string | { nombre: string };
  ccaa?: string | { nombre: string };
};

type FormMsg =
  | { msg: string; type: "success" | "error" | "info" }
  | null;

type PhotoItem = {
  id: string;
  file: File;
  preview: string;
  progress: number;
  status: "ready" | "uploading" | "done" | "error";
};

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function compressImage(file: File): Promise<File> {
  // browser-image-compression ya está en tu proyecto
  const compressed = await imageCompression(file, {
    maxWidthOrHeight: MAX_IMG_DIM,
    maxSizeMB: MAX_IMG_SIZE_MB,
    useWebWorker: true,
    initialQuality: 0.8,
  });

  // asegurar nombre coherente
  const safeName = (file.name || "foto").replace(/\s+/g, "_");
  const outName = safeName.toLowerCase().endsWith(".jpg") || safeName.toLowerCase().endsWith(".jpeg")
    ? safeName
    : safeName.replace(/\.[^.]+$/, "") + ".jpg";

  try {
    return new File([compressed], outName, { type: compressed.type || "image/jpeg" });
  } catch {
    // fallback si el navegador no permite File()
    return compressed as File;
  }
}

const OfrecerServicioIsland: React.FC = () => {
  const [user, setUser] = useState<any | null | undefined>(undefined);

  const [form, setForm] = useState(initialState);

  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [video, setVideo] = useState<File | null>(null);
  const [videoURL, setVideoURL] = useState<string>("");
  const [videoProgress, setVideoProgress] = useState<number>(0);

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
        if (!cancel) setLocSuggestions([]);
      }
    };

    const t = setTimeout(fetchLocs, 200);
    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [locQuery]);

  const handleLocalidadInput = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      typeof loc.provincia === "object" ? loc.provincia?.nombre : loc.provincia || "";
    const ccaaNombre =
      typeof loc.ccaa === "object" ? loc.ccaa?.nombre : loc.ccaa || "";

    setSelectedLoc(loc);
    setForm((f) => ({
      ...f,
      pueblo: loc.nombre,
      provincia: provinciaNombre || "",
      comunidad: ccaaNombre || "",
    }));

    setLocQuery([loc.nombre, provinciaNombre, ccaaNombre].filter(Boolean).join(", "));
    setShowDropdown(false);
  };

  const handleLocBlur = () => setTimeout(() => setShowDropdown(false), 150);

  const ensureLocalidadCompleta = () => {
    if (!selectedLoc) return false;

    const provinciaNombre =
      typeof selectedLoc.provincia === "object" ? selectedLoc.provincia?.nombre : selectedLoc.provincia || "";
    const ccaaNombre =
      typeof selectedLoc.ccaa === "object" ? selectedLoc.ccaa?.nombre : selectedLoc.ccaa || "";

    setForm((f) => ({
      ...f,
      pueblo: selectedLoc.nombre,
      provincia: provinciaNombre,
      comunidad: ccaaNombre,
    }));
    return true;
  };

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

  // ============================
  // FOTOS: añadir / ordenar / principal
  // ============================
  const addPhotos = async (files: File[]) => {
    if (files.length === 0) return;

    const remain = MAX_FOTOS - photos.length;
    if (remain <= 0) {
      setFormMsg({ msg: `Máximo ${MAX_FOTOS} fotos permitidas.`, type: "error" });
      return;
    }

    const slice = files.slice(0, remain);

    setFormMsg({ msg: "Procesando fotos…", type: "info" });

    const newItems: PhotoItem[] = [];
    for (const f of slice) {
      if (!f.type.startsWith("image/")) continue;
      try {
        const compressed = await compressImage(f);
        const preview = URL.createObjectURL(compressed);
        newItems.push({
          id: uid(),
          file: compressed,
          preview,
          progress: 0,
          status: "ready",
        });
      } catch {
        setFormMsg({ msg: "Error al procesar una imagen.", type: "error" });
      }
    }

    setPhotos((prev) => [...prev, ...newItems]);
    setFormMsg(null);
  };

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    await addPhotos(Array.from(e.target.files));
  };

  const openPhotoDialog = () => {
    if (photoInputRef.current) {
      photoInputRef.current.value = "";
      photoInputRef.current.click();
    }
  };

  const removePhoto = (idx: number) => {
    setPhotos((arr) => {
      const item = arr[idx];
      if (item?.preview) URL.revokeObjectURL(item.preview);
      return arr.filter((_, i) => i !== idx);
    });
  };

  const setPrincipal = (idx: number) => {
    setPhotos((arr) => {
      if (idx <= 0) return arr;
      const copy = [...arr];
      const [moved] = copy.splice(idx, 1);
      copy.unshift(moved);
      return copy;
    });
  };

  const movePhoto = (from: number, to: number) => {
    setPhotos((arr) => {
      if (to < 0 || to >= arr.length) return arr;
      const copy = [...arr];
      const [moved] = copy.splice(from, 1);
      copy.splice(to, 0, moved);
      return copy;
    });
  };

  // Drag & drop reordenar
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, idx: number) => {
    e.dataTransfer.setData("photoIndex", String(idx));
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>, idx: number) => {
    const from = Number(e.dataTransfer.getData("photoIndex"));
    if (Number.isNaN(from) || from === idx) return;
    movePhoto(from, idx);
  };

  // Dropzone
  const onDropZoneDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const dt = e.dataTransfer;
    if (!dt?.files?.length) return;
    await addPhotos(Array.from(dt.files));
  };

  // ============================
  // VIDEO
  // ============================
  const openVideoDialog = () => {
    if (videoInputRef.current) {
      videoInputRef.current.value = "";
      videoInputRef.current.click();
    }
  };

  const handleVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) {
      setVideo(null);
      setVideoURL("");
      setVideoProgress(0);
      return;
    }

    const file = e.target.files[0];

    if (file.size > MAX_VIDEO_SIZE) {
      setFormMsg({ msg: "El video no puede superar los 40MB.", type: "error" });
      return;
    }

    const videoElem = document.createElement("video");
    videoElem.preload = "metadata";
    videoElem.onloadedmetadata = () => {
      window.URL.revokeObjectURL(videoElem.src);
      if (videoElem.duration > MAX_VIDEO_DURATION) {
        setFormMsg({ msg: "El video no puede durar más de 3 minutos.", type: "error" });
        setVideo(null);
        setVideoURL("");
        setVideoProgress(0);
      } else {
        setVideo(file);
        setVideoURL(URL.createObjectURL(file));
        setVideoProgress(0);
      }
    };
    videoElem.src = URL.createObjectURL(file);
  };

  const resetForm = () => {
    setForm(initialState);
    setLocQuery("");
    setSelectedLoc(null);

    setPhotos((arr) => {
      arr.forEach((p) => p.preview && URL.revokeObjectURL(p.preview));
      return [];
    });

    setVideo(null);
    setVideoURL("");
    setVideoProgress(0);
  };

  // ============================
  // SUBIDA PARALELA con progreso
  // ============================
  const uploadPhotosParallel = async (): Promise<string[]> => {
    const results: (string | null)[] = new Array(photos.length).fill(null);
    let nextIndex = 0;

    const worker = async () => {
      while (true) {
        const i = nextIndex++;
        if (i >= photos.length) return;

        setPhotos((prev) =>
          prev.map((p, idx) =>
            idx === i ? { ...p, status: "uploading", progress: 0 } : p
          )
        );

        try {
          const url = (await uploadFile(photos[i].file, "service_images/fotos", (pct: number) => {
            setPhotos((prev) =>
              prev.map((p, idx) =>
                idx === i ? { ...p, progress: pct } : p
              )
            );
          })) as string;

          results[i] = url;

          setPhotos((prev) =>
            prev.map((p, idx) =>
              idx === i ? { ...p, status: "done", progress: 100 } : p
            )
          );
        } catch (e) {
          setPhotos((prev) =>
            prev.map((p, idx) =>
              idx === i ? { ...p, status: "error" } : p
            )
          );
          throw e;
        }
      }
    };

    const workers = Array.from({ length: Math.min(UPLOAD_CONCURRENCY, photos.length) }, () => worker());
    await Promise.all(workers);

    return results.map((x) => x || "").filter(Boolean);
  };

  // ============================
  // SUBMIT
  // ============================
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      setFormMsg({ msg: "Debes iniciar sesión para publicar.", type: "error" });
      return;
    }

    if (!ensureLocalidadCompleta()) {
      setFormMsg({ msg: "Debes elegir una localidad válida del listado.", type: "error" });
      return;
    }

    if (!form.nombre || !form.categoria || !form.oficio || !form.descripcion || !form.contacto) {
      setFormMsg({
        msg: "Completa los campos obligatorios (nombre, categoría, oficio, descripción, contacto).",
        type: "error",
      });
      return;
    }

    setLoading(true);
    setFormMsg({ msg: "Subiendo archivos…", type: "info" });

    try {
      // 1) Fotos (paralelo)
      const photoUrls = await uploadPhotosParallel();

      // 2) Video (opcional, con progreso)
      let videoUrl = "";
      if (video) {
        setVideoProgress(0);
        videoUrl = (await uploadFile(video, "service_images/videos", (pct: number) => {
          setVideoProgress(pct);
        })) as string;
      }

      // 3) payload
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
        imagenes: photoUrls, // orden = principal primero
        videoUrl,
      };

      // token
      let idToken: string | null = null;
      try {
        if (user && typeof user.getIdToken === "function") idToken = await user.getIdToken();
      } catch {}

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
        setFormMsg({ msg: "No se pudo guardar el servicio. Inténtalo de nuevo.", type: "error" });
        setLoading(false);
        return;
      }

      window.location.href = "/usuario/panel";
      return;
    } catch (err) {
      console.error("Error al crear servicio:", err);
      setFormMsg({ msg: "Ocurrió un error al guardar el servicio.", type: "error" });
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
          EnMiPueblo necesita saber quién eres para gestionar tus anuncios y permitirte editarlos o eliminarlos.
        </p>
        <button
          className="bg-emerald-600 text-white px-6 py-3 rounded-xl shadow hover:bg-emerald-700"
          onClick={() => (window as any).showAuthModal && (window as any).showAuthModal()}
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
          <span className="font-semibold">Tip:</span> La <strong>primera foto</strong> es la principal.
          Puedes <strong>arrastrar</strong> para ordenar o marcar una como <strong>principal</strong>.
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
                    typeof loc.provincia === "object" ? loc.provincia?.nombre : loc.provincia || "";
                  const ccaaNombre =
                    typeof loc.ccaa === "object" ? loc.ccaa?.nombre : loc.ccaa || "";

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
                        {[provinciaNombre, ccaaNombre].filter(Boolean).join(", ")}
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
            disabled={photos.length >= MAX_FOTOS}
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

        <div
          className="border-2 border-dashed border-emerald-200 rounded-2xl p-4 bg-emerald-50/40"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDropZoneDrop}
        >
          <p className="text-sm text-emerald-800 font-semibold">
            Arrastra y suelta fotos aquí, o usa “Añadir fotos”.
          </p>
          <p className="text-xs text-gray-600 mt-1">
            La primera foto será la principal. Puedes arrastrar para reordenar o marcar “Principal”.
          </p>
        </div>

        {photos.length === 0 ? (
          <p className="text-xs text-gray-500">
            Todavía no subiste fotos. No son obligatorias, pero ayudan muchísimo.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {photos.map((p, idx) => (
              <div
                key={p.id}
                className="relative group rounded-xl overflow-hidden border border-gray-200 bg-white"
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(e, idx)}
                title="Arrastra para reordenar"
              >
                <img src={p.preview} alt={`Foto ${idx + 1}`} className="w-full h-28 object-cover" />

                {/* Badge principal */}
                {idx === 0 && (
                  <span className="absolute top-2 left-2 text-xs bg-emerald-600 text-white px-2 py-1 rounded-full shadow">
                    ⭐ Principal
                  </span>
                )}

                {/* Progreso */}
                {loading && (p.status === "uploading" || p.status === "done") && (
                  <div className="absolute bottom-0 left-0 right-0 bg-black/40">
                    <div
                      className="h-1.5 bg-emerald-400"
                      style={{ width: `${p.progress}%` }}
                    />
                  </div>
                )}

                {/* Controles */}
                <div className="absolute inset-x-0 bottom-2 px-2 flex items-center justify-between opacity-0 group-hover:opacity-100 transition">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="text-xs bg-white/90 border border-gray-200 px-2 py-1 rounded-lg"
                      onClick={() => setPrincipal(idx)}
                      disabled={idx === 0}
                      title="Marcar como principal"
                    >
                      ⭐
                    </button>
                    <button
                      type="button"
                      className="text-xs bg-white/90 border border-gray-200 px-2 py-1 rounded-lg"
                      onClick={() => movePhoto(idx, idx - 1)}
                      disabled={idx === 0}
                      title="Mover a la izquierda"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      className="text-xs bg-white/90 border border-gray-200 px-2 py-1 rounded-lg"
                      onClick={() => movePhoto(idx, idx + 1)}
                      disabled={idx === photos.length - 1}
                      title="Mover a la derecha"
                    >
                      →
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => removePhoto(idx)}
                    className="text-xs bg-black/70 text-white px-2 py-1 rounded-lg"
                    title="Eliminar foto"
                  >
                    ✕
                  </button>
                </div>
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
          <div className="space-y-2">
            <video src={videoURL} controls className="w-full max-h-64 rounded-2xl shadow" />
            {loading && video && (
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div className="h-2 bg-emerald-400" style={{ width: `${videoProgress}%` }} />
              </div>
            )}
          </div>
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
