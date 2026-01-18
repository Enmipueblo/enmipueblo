import React, { useEffect, useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import { onUserStateChange, uploadFile } from "../lib/firebase.js";
import { buscarLocalidades, getServicio, updateServicio } from "../lib/api-utils.js";

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
  "Reparación Electrodomésticos",
  "Informática",
  "Diseño Gráfico",
  "Marketing",
  "Clases Particulares",
  "Salud y Bienestar",
  "Turismo",
  "Eventos",
  "Asesoría Legal",
  "Otros",
];

const MAX_FOTOS = 6;
const MAX_VIDEO_SIZE = 40 * 1024 * 1024;
const MAX_VIDEO_DURATION = 180;
const MAX_IMG_SIZE_MB = 0.45;
const MAX_IMG_DIM = 1400;
const UPLOAD_CONCURRENCY = 3;

type Localidad = {
  municipio_id?: string | number;
  nombre: string;
  provincia?: string | { nombre: string };
  ccaa?: string | { nombre: string };
};

type FormMsg = { msg: string; type: "success" | "error" | "info" } | null;

type PhotoItem = {
  id: string;
  url: string;          // preview para nuevas / url real para existentes
  file?: File;          // solo para nuevas
  isNew: boolean;
  progress: number;
  status: "ready" | "uploading" | "done" | "error";
};

type Props = { id?: string };

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function compressImage(file: File): Promise<File> {
  const compressed = await imageCompression(file, {
    maxWidthOrHeight: MAX_IMG_DIM,
    maxSizeMB: MAX_IMG_SIZE_MB,
    useWebWorker: true,
    initialQuality: 0.8,
  });

  const safeName = (file.name || "foto").replace(/\s+/g, "_");
  const outName =
    safeName.toLowerCase().endsWith(".jpg") || safeName.toLowerCase().endsWith(".jpeg")
      ? safeName
      : safeName.replace(/\.[^.]+$/, "") + ".jpg";

  try {
    return new File([compressed], outName, { type: compressed.type || "image/jpeg" });
  } catch {
    return compressed as File;
  }
}

const EditarServicioIsland: React.FC<Props> = ({ id }) => {
  const [user, setUser] = useState<any>(undefined);
  const [serviceId, setServiceId] = useState<string | null>(id ?? null);

  const [form, setForm] = useState({
    nombre: "",
    categoria: "",
    oficio: "",
    descripcion: "",
    contacto: "",
    whatsapp: "",
    pueblo: "",
    provincia: "",
    comunidad: "",
  });

  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string>("");
  const [existingVideoUrl, setExistingVideoUrl] = useState<string>("");
  const [removeVideo, setRemoveVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formMsg, setFormMsg] = useState<FormMsg>(null);

  const [locQuery, setLocQuery] = useState("");
  const [locSuggestions, setLocSuggestions] = useState<Localidad[]>([]);
  const [selectedLoc, setSelectedLoc] = useState<Localidad | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  // ID desde URL
  useEffect(() => {
    if (serviceId || typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      const fromQuery = url.searchParams.get("id");
      const parts = url.pathname.split("/").filter(Boolean);
      const fromPath =
        parts.length > 1 && parts[0] === "editar-servicio" ? parts[1] : parts[parts.length - 1];
      setServiceId(fromQuery || fromPath || null);
    } catch {
      setServiceId(null);
    }
  }, [serviceId]);

  // Usuario
  useEffect(() => {
    const unsub = onUserStateChange((u) => setUser(u));
    return () => unsub?.();
  }, []);

  // Cargar servicio
  useEffect(() => {
    if (!user || !serviceId) return;

    (async () => {
      try {
        const servicio = await getServicio(serviceId);

        setForm({
          nombre: servicio.nombre || "",
          categoria: servicio.categoria || "",
          oficio: servicio.oficio || "",
          descripcion: servicio.descripcion || "",
          contacto: servicio.contacto || "",
          whatsapp: servicio.whatsapp || "",
          pueblo: servicio.pueblo || "",
          provincia: servicio.provincia || "",
          comunidad: servicio.comunidad || "",
        });

        const imgs: string[] = servicio.imagenes || [];
        setPhotos(
          imgs.map((url) => ({
            id: uid(),
            url,
            isNew: false,
            progress: 0,
            status: "ready",
          }))
        );

        if (servicio.videoUrl) {
          setExistingVideoUrl(servicio.videoUrl);
          setVideoPreview(servicio.videoUrl);
        }

        setLocQuery([servicio.pueblo, servicio.provincia, servicio.comunidad].filter(Boolean).join(", "));

        // Preselecciona la localidad actual para que el guardado exija una localidad valida
        const _pueblo = servicio.pueblo || "";
        const _prov = servicio.provincia || "";
        const _ccaa = servicio.comunidad || "";
        if (_pueblo) {
          setSelectedLoc({ nombre: _pueblo, provincia: _prov, ccaa: _ccaa });
          setShowDropdown(false);
        }
      } catch (err) {
        console.error("Error cargando servicio para editar:", err);
        setFormMsg({ msg: "No se pudo cargar el servicio.", type: "error" });
      } finally {
        setLoading(false);
      }
    })();
  }, [user, serviceId]);

  // Localidades (igual que tu versión, pero con dropdown controlado)
  useEffect(() => {
    if (!locQuery || locQuery.length < 2) {
      setLocSuggestions([]);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const data = await buscarLocalidades(locQuery);
        if (cancelled) return;
        setLocSuggestions(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setLocSuggestions([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [locQuery]);

  const applyLocalidad = (loc: Localidad) => {
    const provinciaNombre =
      typeof loc.provincia === "object" ? loc.provincia?.nombre : loc.provincia || "";
    const ccaaNombre =
      typeof loc.ccaa === "object" ? loc.ccaa?.nombre : loc.ccaa || "";

    setSelectedLoc(loc);
    setForm((f) => ({
      ...f,
      pueblo: loc.nombre,
      provincia: provinciaNombre,
      comunidad: ccaaNombre,
    }));

    setLocQuery([loc.nombre, provinciaNombre, ccaaNombre].filter(Boolean).join(", "));
    setShowDropdown(false);
  };

  const handleLocInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocQuery(val);
    setSelectedLoc(null);
    setForm((f) => ({ ...f, pueblo: val, provincia: "", comunidad: "" }));
    setShowDropdown(true);
  };

  const handleLocBlur = () => setTimeout(() => setShowDropdown(false), 150);

  const ensureLocalidad = () => {
    if (!selectedLoc) {
      setFormMsg({ msg: "Selecciona una localidad de la lista.", type: "error" });
      return false;
    }

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

  const handleInput = (
    e:
      | React.ChangeEvent<HTMLInputElement>
      | React.ChangeEvent<HTMLTextAreaElement>
      | React.ChangeEvent<HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  // Fotos
  const addPhotos = async (files: File[]) => {
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
          url: preview,
          file: compressed,
          isNew: true,
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
      if (item?.isNew && item?.url) URL.revokeObjectURL(item.url);
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

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, idx: number) => {
    e.dataTransfer.setData("photoIndex", String(idx));
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>, idx: number) => {
    const from = Number(e.dataTransfer.getData("photoIndex"));
    if (Number.isNaN(from) || from === idx) return;
    movePhoto(from, idx);
  };

  const onDropZoneDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const dt = e.dataTransfer;
    if (!dt?.files?.length) return;
    await addPhotos(Array.from(dt.files));
  };

  // Video
  const handleVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) {
      setVideoFile(null);
      setVideoPreview(existingVideoUrl);
      setRemoveVideo(false);
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
        return;
      }
      setVideoFile(file);
      setVideoPreview(URL.createObjectURL(file));
      setRemoveVideo(false);
      setVideoProgress(0);
    };
    videoElem.src = URL.createObjectURL(file);
  };

  const handleVideoDialog = () => {
    if (videoInputRef.current) {
      videoInputRef.current.value = "";
      videoInputRef.current.click();
    }
  };

  const eliminarVideoActual = () => {
    setRemoveVideo(true);
    setVideoFile(null);
    setVideoPreview("");
    setExistingVideoUrl("");
    setVideoProgress(0);
  };

  // Subidas
  const uploadPhotosParallel = async (): Promise<string[]> => {
    const results: (string | null)[] = new Array(photos.length).fill(null);
    let nextIndex = 0;

    const worker = async () => {
      while (true) {
        const i = nextIndex++;
        if (i >= photos.length) return;

        const item = photos[i];

        // existentes: se quedan igual
        if (!item.isNew) {
          results[i] = item.url;
          continue;
        }

        setPhotos((prev) =>
          prev.map((p, idx) => (idx === i ? { ...p, status: "uploading", progress: 0 } : p))
        );

        try {
          const url = (await uploadFile(item.file!, "service_images/fotos", (pct: number) => {
            setPhotos((prev) => prev.map((p, idx) => (idx === i ? { ...p, progress: pct } : p)));
          })) as string;

          results[i] = url;

          setPhotos((prev) =>
            prev.map((p, idx) => (idx === i ? { ...p, status: "done", progress: 100 } : p))
          );
        } catch (e) {
          setPhotos((prev) =>
            prev.map((p, idx) => (idx === i ? { ...p, status: "error" } : p))
          );
          throw e;
        }
      }
    };

    const workers = Array.from({ length: Math.min(UPLOAD_CONCURRENCY, photos.length) }, () => worker());
    await Promise.all(workers);

    return results.map((x) => x || "").filter(Boolean);
  };

  // Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) return setFormMsg({ msg: "Debes iniciar sesión.", type: "error" });
    if (!serviceId) return setFormMsg({ msg: "No se encontró el identificador del servicio.", type: "error" });
    if (!ensureLocalidad()) return setFormMsg({ msg: "Debes indicar una localidad válida.", type: "error" });
    if (!form.nombre || !form.oficio || !form.descripcion) {
      return setFormMsg({ msg: "Completa nombre, oficio y descripción.", type: "error" });
    }
    if (photos.length === 0) return setFormMsg({ msg: "Debes tener al menos una foto.", type: "error" });

    setSaving(true);
    setFormMsg({ msg: "Subiendo archivos…", type: "info" });

    let finalPhotoUrls: string[] = [];
    try {
      finalPhotoUrls = await uploadPhotosParallel();
    } catch {
      setSaving(false);
      setFormMsg({ msg: "Error al subir una foto.", type: "error" });
      return;
    }

    let finalVideoUrl = existingVideoUrl;

    if (videoFile) {
      try {
        setVideoProgress(0);
        finalVideoUrl = (await uploadFile(videoFile, "service_images/videos", (pct: number) => {
          setVideoProgress(pct);
        })) as string;
      } catch {
        setSaving(false);
        setFormMsg({ msg: "Error al subir el video.", type: "error" });
        return;
      }
    } else if (removeVideo) {
      finalVideoUrl = "";
    }

    try {
      const payload = {
        ...form,
        imagenes: finalPhotoUrls,
        videoUrl: finalVideoUrl,
        usuarioEmail: user.email,
      };

      const res = await updateServicio(serviceId, payload);
      if ((res as any).error || (res as any).ok === false) {
        throw new Error((res as any).error || "Error al actualizar.");
      }

      setFormMsg({ msg: "Servicio actualizado con éxito.", type: "success" });
      setTimeout(() => {
        window.location.href = "/usuario/panel?tab=anuncios";
      }, 1200);
    } catch (err: any) {
      console.error("Error updateServicio:", err);
      setFormMsg({ msg: err?.message || "Error al guardar cambios.", type: "error" });
    }

    setSaving(false);
  };

  // Render
  if (user === undefined || loading || !serviceId) {
    return <div className="text-center py-16 text-gray-500 animate-pulse">Cargando servicio…</div>;
  }
  if (!user) {
    return <div className="text-center py-16 text-emerald-700">Debes iniciar sesión para editar tus servicios.</div>;
  }

  return (
    <form
      className="bg-white rounded-3xl shadow-xl px-8 py-10 space-y-6 text-left border-2 border-green-100 max-w-2xl mx-auto"
      onSubmit={handleSubmit}
      autoComplete="off"
    >
      <h2 className="text-2xl font-bold text-green-700 mb-2">Editar servicio</h2>
      <p className="text-sm text-gray-600 mb-4">
        La primera foto será la principal. Puedes arrastrar para ordenar o marcar una como principal.
      </p>

      {/* DATOS */}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-green-700 font-semibold mb-2">Nombre</label>
          <input
            name="nombre"
            type="text"
            required
            className="w-full px-4 py-3 rounded-xl border border-green-300 focus:outline-none focus:ring-2 focus:ring-green-600 text-gray-800"
            value={form.nombre}
            onChange={handleInput}
          />
        </div>

        <div>
          <label className="block text-green-700 font-semibold mb-2">Categoría</label>
          <select
            name="categoria"
            required
            className="w-full px-4 py-3 rounded-xl border border-green-300 focus:outline-none focus:ring-2 focus:ring-green-600 text-gray-800"
            value={form.categoria}
            onChange={handleInput}
          >
            <option value="">Selecciona una categoría</option>
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="block text-green-700 font-semibold mb-2">Oficio o Servicio</label>
          <input
            name="oficio"
            type="text"
            required
            className="w-full px-4 py-3 rounded-xl border border-green-300 focus:outline-none focus:ring-2 focus:ring-green-600 text-gray-800"
            value={form.oficio}
            onChange={handleInput}
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-green-700 font-semibold mb-2">Descripción</label>
          <textarea
            name="descripcion"
            required
            rows={4}
            className="w-full px-4 py-3 rounded-xl border border-green-300 focus:outline-none focus:ring-2 focus:ring-green-600 text-gray-800"
            value={form.descripcion}
            onChange={handleInput}
          />
        </div>

        <div>
          <label className="block text-green-700 font-semibold mb-2">Contacto</label>
          <input
            name="contacto"
            type="text"
            required
            className="w-full px-4 py-3 rounded-xl border border-green-300 focus:outline-none focus:ring-2 focus:ring-green-600 text-gray-800"
            value={form.contacto}
            onChange={handleInput}
          />
        </div>

        <div>
          <label className="block text-green-700 font-semibold mb-2">WhatsApp (opcional)</label>
          <input
            name="whatsapp"
            type="text"
            className="w-full px-4 py-3 rounded-xl border border-green-300 focus:outline-none focus:ring-2 focus:ring-green-600 text-gray-800"
            value={form.whatsapp}
            onChange={handleInput}
            placeholder="Ej: 34666777888"
          />
        </div>

        {/* Localidad */}
        <div className="relative md:col-span-2">
          <label className="block text-green-700 font-semibold mb-2">Pueblo o localidad</label>
          <input
            type="text"
            required
            className="w-full px-4 py-3 rounded-xl border border-green-300 focus:outline-none focus:ring-2 focus:ring-green-600 text-gray-800"
            value={locQuery}
            onChange={handleLocInput}
            onFocus={() => setShowDropdown(true)}
            onBlur={handleLocBlur}
            placeholder="Ej: Graus, Huesca, Aragón"
          />

          {showDropdown && locSuggestions.length > 0 && (
            <div className="absolute z-20 bg-white border border-green-200 rounded-lg shadow-xl w-full max-h-64 overflow-auto mt-1">
              {locSuggestions.map((loc) => {
                const provinciaNombre =
                  typeof loc.provincia === "object" ? loc.provincia?.nombre : loc.provincia;
                const ccaaNombre = typeof loc.ccaa === "object" ? loc.ccaa?.nombre : loc.ccaa;

                return (
                  <div
                    key={String(loc.municipio_id ?? loc.nombre)}
                    className="px-4 py-2 hover:bg-green-50 cursor-pointer flex flex-col"
                    onMouseDown={() => applyLocalidad(loc)}
                  >
                    <span className="font-semibold text-green-700">{loc.nombre}</span>
                    <span className="text-xs text-gray-500">
                      {[provinciaNombre, ccaaNombre].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* FOTOS */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="block text-green-700 font-semibold">
            Fotos del servicio <span className="text-gray-500">(máx. {MAX_FOTOS})</span>
          </label>

          <button
            type="button"
            className="text-sm bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-xl border border-emerald-200 hover:bg-emerald-100"
            onClick={openPhotoDialog}
            disabled={photos.length >= MAX_FOTOS}
          >
            Añadir fotos
          </button>
        </div>

        <input
          type="file"
          accept="image/*"
          multiple
          ref={photoInputRef}
          className="hidden"
          onChange={handlePhoto}
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
            La primera foto será la principal. Arrastra para reordenar o marca “⭐”.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {photos.map((p, idx) => (
            <div
              key={p.id}
              className="relative group rounded-xl overflow-hidden border border-gray-200 bg-white"
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, idx)}
            >
              <img src={p.url} alt={`foto-${idx}`} className="h-28 w-full object-cover" />

              {idx === 0 && (
                <span className="absolute top-2 left-2 text-xs bg-emerald-600 text-white px-2 py-1 rounded-full shadow">
                  ⭐ Principal
                </span>
              )}

              {saving && (p.status === "uploading" || p.status === "done") && (
                <div className="absolute bottom-0 left-0 right-0 bg-black/40">
                  <div className="h-1.5 bg-emerald-400" style={{ width: `${p.progress}%` }} />
                </div>
              )}

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
                  className="text-xs bg-black/70 text-white px-2 py-1 rounded-lg"
                  onClick={() => removePhoto(idx)}
                  title="Eliminar"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* VIDEO */}
      <div className="space-y-2">
        <label className="block text-green-700 font-semibold">
          Video del servicio <span className="text-gray-500">(opcional, máx. 3 min y 40MB)</span>
        </label>

        <input
          type="file"
          accept="video/mp4,video/webm,video/*"
          ref={videoInputRef}
          className="hidden"
          onChange={handleVideo}
        />

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            className="bg-emerald-500 text-white font-semibold py-2 px-4 rounded-xl hover:bg-emerald-700 transition"
            onClick={handleVideoDialog}
          >
            {videoFile ? "Cambiar video" : "Subir video"}
          </button>

          {videoPreview && (
            <button
              type="button"
              className="text-red-600 text-xs underline"
              onClick={eliminarVideoActual}
            >
              Quitar video
            </button>
          )}
        </div>

        {videoPreview && (
          <div className="mt-2 space-y-2">
            <video src={videoPreview} controls className="max-h-48 rounded shadow" style={{ maxWidth: 320 }} />
            {saving && (videoFile || removeVideo === false) && (
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden" style={{ maxWidth: 320 }}>
                <div className="h-2 bg-emerald-400" style={{ width: `${videoProgress}%` }} />
              </div>
            )}
          </div>
        )}
      </div>

      {formMsg && (
        <div
          className={`mt-2 text-center text-sm rounded p-2 ${
            formMsg.type === "success"
              ? "bg-green-100 text-green-700"
              : formMsg.type === "error"
              ? "bg-red-100 text-red-700"
              : "bg-blue-100 text-blue-700"
          }`}
        >
          {formMsg.msg}
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className={`w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-4 px-6 rounded-2xl text-lg transition duration-300 shadow-lg ${
          saving ? "opacity-50 cursor-not-allowed" : ""
        }`}
      >
        {saving ? "Guardando cambios…" : "💾 Guardar cambios"}
      </button>
    </form>
  );
};

export default EditarServicioIsland;
