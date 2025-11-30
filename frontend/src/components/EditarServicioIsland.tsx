import React, { useEffect, useState, useRef } from "react";
import imageCompression from "browser-image-compression";
import { onUserStateChange, uploadFile } from "../lib/firebase.js";
import { getServicio, updateServicio } from "../lib/api-utils.js";

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
const MAX_VIDEO_SIZE = 40 * 1024 * 1024; // 40MB
const MAX_VIDEO_DURATION = 180; // 3 min
const MAX_IMG_SIZE_MB = 0.35;
const MAX_IMG_DIM = 1200;

type Localidad = {
  municipio_id?: string | number;
  nombre: string;
  provincia?: string | { nombre: string };
  ccaa?: string | { nombre: string };
};

type FormMsg =
  | { msg: string; type: "success" | "error" | "info" }
  | null;

type PhotoItem = {
  url: string;
  file?: File;
  isNew: boolean;
};

const EditarServicioIsland: React.FC<{ id: string }> = ({ id }) => {
  const [user, setUser] = useState<any>(undefined);
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

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formMsg, setFormMsg] = useState<FormMsg>(null);

  // Localidades
  const [locQuery, setLocQuery] = useState("");
  const [locSuggestions, setLocSuggestions] = useState<Localidad[]>([]);
  const [selectedLoc, setSelectedLoc] = useState<Localidad | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  // ==========================
  // Usuario
  // ==========================
  useEffect(() => {
    const unsub = onUserStateChange((u) => setUser(u));
    return () => unsub?.();
  }, []);

  // ==========================
  // Cargar servicio inicial
  // ==========================
  useEffect(() => {
    if (!user || !id) return;

    (async () => {
      try {
        const servicio = await getServicio(id);

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
        setPhotos(imgs.map((url) => ({ url, isNew: false })));

        if (servicio.videoUrl) {
          setExistingVideoUrl(servicio.videoUrl);
          setVideoPreview(servicio.videoUrl);
        }

        const locText = [
          servicio.pueblo,
          servicio.provincia,
          servicio.comunidad,
        ]
          .filter(Boolean)
          .join(", ");
        setLocQuery(locText);
      } catch (err) {
        console.error("Error cargando servicio para editar:", err);
        setFormMsg({
          msg: "No se pudo cargar el servicio.",
          type: "error",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [user, id]);

  // ==========================
  // Autocomplete localidades
  // ==========================
  useEffect(() => {
    if (!locQuery || locQuery.length < 2) {
      setLocSuggestions([]);
      return;
    }

    const base =
      (typeof window !== "undefined" &&
        (window as any).BACKEND_URL) ||
      import.meta.env.PUBLIC_BACKEND_URL ||
      "";

    const fetchLocs = async () => {
      try {
        const res = await fetch(
          `${base}/api/localidades/buscar?q=${encodeURIComponent(locQuery)}`
        );
        if (!res.ok) {
          setLocSuggestions([]);
          return;
        }
        const data = await res.json();
        if (!Array.isArray(data)) return setLocSuggestions([]);
        setLocSuggestions(data);
      } catch {
        setLocSuggestions([]);
      }
    };

    fetchLocs();
  }, [locQuery]);

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
      provincia: provinciaNombre,
      comunidad: ccaaNombre,
    }));

    setLocQuery(
      [loc.nombre, provinciaNombre, ccaaNombre].filter(Boolean).join(", ")
    );
    setShowDropdown(false);
  };

  const handleLocInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocQuery(val);
    setSelectedLoc(null);
    setForm((f) => ({
      ...f,
      pueblo: val,
    }));
    setShowDropdown(true);
  };

  const handleLocBlur = () =>
    setTimeout(() => setShowDropdown(false), 150);

  const ensureLocalidad = () => {
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

    // si ya trae datos del servicio original, los aceptamos
    return !!form.pueblo;
  };

  // ==========================
  // Inputs básicos
  // ==========================
  const handleInput = (
    e:
      | React.ChangeEvent<HTMLInputElement>
      | React.ChangeEvent<HTMLTextAreaElement>
      | React.ChangeEvent<HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  // ==========================
  // Fotos
  // ==========================
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

    const newItems: PhotoItem[] = [];

    for (const file of filesArr) {
      if (!file.type.startsWith("image/")) continue;
      try {
        const compressed = await imageCompression(file, {
          maxWidthOrHeight: MAX_IMG_DIM,
          maxSizeMB: MAX_IMG_SIZE_MB,
          useWebWorker: true,
          initialQuality: 0.7,
        });
        const preview = URL.createObjectURL(compressed);
        newItems.push({
          url: preview,
          file: compressed,
          isNew: true,
        });
      } catch {
        setFormMsg({
          msg: "Error al procesar una imagen.",
          type: "error",
        });
      }
    }

    setPhotos((arr) => [...arr, ...newItems]);
  };

  const openPhotoDialog = () => {
    if (photoInputRef.current) {
      photoInputRef.current.value = "";
      photoInputRef.current.click();
    }
  };

  const removePhoto = (idx: number) => {
    setPhotos((arr) => arr.filter((_, i) => i !== idx));
  };

  const handleDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    idx: number
  ) => {
    e.dataTransfer.setData("photoIndex", String(idx));
  };

  const handleDrop = (
    e: React.DragEvent<HTMLDivElement>,
    idx: number
  ) => {
    const from = Number(e.dataTransfer.getData("photoIndex"));
    if (from === idx) return;
    const newPhotos = [...photos];
    const moved = newPhotos.splice(from, 1)[0];
    newPhotos.splice(idx, 0, moved);
    setPhotos(newPhotos);
  };

  // ==========================
  // Video
  // ==========================
  const handleVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) {
      setVideoFile(null);
      setVideoPreview(existingVideoUrl);
      setRemoveVideo(false);
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
        return;
      }
      setVideoFile(file);
      setVideoPreview(URL.createObjectURL(file));
      setRemoveVideo(false);
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
  };

  // ==========================
  // Submit
  // ==========================
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      setFormMsg({
        msg: "Debes iniciar sesión.",
        type: "error",
      });
      return;
    }

    if (!ensureLocalidad()) {
      setFormMsg({
        msg: "Debes indicar una localidad válida.",
        type: "error",
      });
      return;
    }

    if (!form.nombre || !form.oficio || !form.descripcion) {
      setFormMsg({
        msg: "Completa nombre, oficio y descripción.",
        type: "error",
      });
      return;
    }

    if (photos.length === 0) {
      setFormMsg({
        msg: "Debes tener al menos una foto.",
        type: "error",
      });
      return;
    }

    setSaving(true);
    setFormMsg({ msg: "Guardando cambios…", type: "info" });

    // 1) Fotos: subir solo las nuevas, mantener URLs viejas
    const finalPhotoUrls: string[] = [];

    try {
      for (const item of photos) {
        if (item.isNew && item.file) {
          const url = await uploadFile(
            item.file,
            "service_images/fotos"
          );
          finalPhotoUrls.push(url);
        } else {
          finalPhotoUrls.push(item.url);
        }
      }
    } catch {
      setSaving(false);
      setFormMsg({
        msg: "Error al subir una foto.",
        type: "error",
      });
      return;
    }

    // 2) Video
    let finalVideoUrl = existingVideoUrl;

    if (videoFile) {
      try {
        finalVideoUrl = await uploadFile(
          videoFile,
          "service_images/videos"
        );
      } catch {
        setSaving(false);
        setFormMsg({
          msg: "Error al subir el video.",
          type: "error",
        });
        return;
      }
    } else if (removeVideo) {
      finalVideoUrl = "";
    }

    // 3) Llamar a API de actualización
    try {
      const payload = {
        ...form,
        imagenes: finalPhotoUrls,
        videoUrl: finalVideoUrl,
        usuarioEmail: user.email,
      };

      const res = await updateServicio(id, payload);

      if (res.error || res.ok === false) {
        throw new Error(res.error || "Error al actualizar.");
      }

      setFormMsg({
        msg: "Servicio actualizado con éxito.",
        type: "success",
      });

      setTimeout(() => {
        window.location.href = "/usuario?tab=anuncios";
      }, 1200);
    } catch (err: any) {
      console.error("Error updateServicio:", err);
      setFormMsg({
        msg: err?.message || "Error al guardar cambios.",
        type: "error",
      });
    }

    setSaving(false);
  };

  // ==========================
  // Render
  // ==========================
  if (user === undefined || loading) {
    return (
      <div className="text-center py-16 text-gray-500 animate-pulse">
        Cargando servicio…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-16 text-emerald-700">
        Debes iniciar sesión para editar tus servicios.
      </div>
    );
  }

  return (
    <form
      className="bg-white rounded-3xl shadow-xl px-8 py-10 space-y-6 text-left border-2 border-green-100 max-w-2xl mx-auto"
      onSubmit={handleSubmit}
      autoComplete="off"
    >
      <h2 className="text-2xl font-bold text-green-700 mb-2">
        Editar servicio
      </h2>
      <p className="text-sm text-gray-600 mb-4">
        Actualiza los datos de tu anuncio. Los cambios se verán reflejados al instante.
      </p>

      {/* DATOS BÁSICOS */}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-green-700 font-semibold mb-2">
            Nombre y Apellido
          </label>
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
          <label className="block text-green-700 font-semibold mb-2">
            Categoría
          </label>
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
          <label className="block text-green-700 font-semibold mb-2">
            Oficio o Servicio
          </label>
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
          <label className="block text-green-700 font-semibold mb-2">
            Descripción
          </label>
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
          <label className="block text-green-700 font-semibold mb-2">
            Teléfono o medio de contacto
          </label>
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
          <label className="block text-green-700 font-semibold mb-2">
            WhatsApp (opcional)
          </label>
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
          <label className="block text-green-700 font-semibold mb-2">
            Pueblo o localidad
          </label>
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
                  typeof loc.provincia === "object"
                    ? loc.provincia?.nombre
                    : loc.provincia;
                const ccaaNombre =
                  typeof loc.ccaa === "object" ? loc.ccaa?.nombre : loc.ccaa;

                return (
                  <div
                    key={String(loc.municipio_id ?? loc.nombre)}
                    className="px-4 py-2 hover:bg-green-50 cursor-pointer flex flex-col"
                    onMouseDown={() => applyLocalidad(loc)}
                  >
                    <span className="font-semibold text-green-700">
                      {loc.nombre}
                    </span>
                    <span className="text-xs text-gray-500">
                      {[provinciaNombre, ccaaNombre]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* FOTOS */}
      <div>
        <label className="block text-green-700 font-semibold mb-2">
          Fotos del servicio{" "}
          <span className="text-gray-500">(máx. {MAX_FOTOS})</span>
        </label>

        <input
          type="file"
          accept="image/*"
          multiple
          ref={photoInputRef}
          style={{ display: "none" }}
          onChange={handlePhoto}
        />

        <button
          type="button"
          className="bg-emerald-500 text-white font-semibold py-2 px-4 rounded-xl mb-2 hover:bg-emerald-700 transition"
          onClick={openPhotoDialog}
          disabled={photos.length >= MAX_FOTOS}
        >
          {photos.length === 0 ? "Agregar fotos" : "Agregar más fotos"}
        </button>

        <span className="ml-2 text-sm text-gray-500">
          ({photos.length} / {MAX_FOTOS} seleccionadas)
        </span>

        {photos.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-3">
            {photos.map((p, i) => (
              <div
                key={i}
                className="relative group border-2 border-green-100 rounded-xl overflow-hidden shadow-md"
                draggable
                onDragStart={(e) => handleDragStart(e, i)}
                onDrop={(e) => handleDrop(e, i)}
                onDragOver={(e) => e.preventDefault()}
              >
                <img
                  src={p.url}
                  alt={`foto-${i}`}
                  className="h-28 w-28 object-cover rounded-lg"
                />
                <button
                  type="button"
                  className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-90 group-hover:opacity-100 transition"
                  onClick={() => removePhoto(i)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* VIDEO */}
      <div>
        <label className="block text-green-700 font-semibold mb-2">
          Video del servicio{" "}
          <span className="text-gray-500">
            (opcional, máx. 3 min y 40MB)
          </span>
        </label>

        <input
          type="file"
          accept="video/mp4,video/webm"
          ref={videoInputRef}
          style={{ display: "none" }}
          onChange={handleVideo}
        />

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            className="bg-emerald-500 text-white font-semibold py-2 px-4 rounded-xl mb-2 hover:bg-emerald-700 transition"
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
          <div className="mt-3">
            <video
              src={videoPreview}
              controls
              className="max-h-40 rounded shadow"
              style={{ maxWidth: 240 }}
            />
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
