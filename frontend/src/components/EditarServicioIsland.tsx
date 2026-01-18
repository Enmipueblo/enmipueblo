import React, { useEffect, useRef, useState } from "react";
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
  const [locDirty, setLocDirty] = useState(false);

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  // ID desde URL
  useEffect(() => {
    if (serviceId || typeof window === "undefined") return;
    try {
      const params = new URLSearchParams(window.location.search);
      const sid = params.get("id");
      if (sid) setServiceId(sid);
    } catch {}
  }, [serviceId]);

  // Auth
  useEffect(() => {
    const unsub = onUserStateChange((u: any) => setUser(u));
    return () => unsub && unsub();
  }, []);

  // Cargar servicio
  useEffect(() => {
    if (!user || !serviceId) return;

    (async () => {
      setLoading(true);
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
        setLocDirty(false);
      } catch (err) {
        console.error("Error cargando servicio para editar:", err);
        setFormMsg({ msg: "No se pudo cargar el servicio.", type: "error" });
      } finally {
        setLoading(false);
      }
    })();
  }, [user, serviceId]);

  // Localidades
  useEffect(() => {
    if (!locQuery || locQuery.length < 2) {
      setLocSuggestions([]);
      return;
    }

    const base =
      (typeof window !== "undefined" && (window as any).BACKEND_URL) ||
      import.meta.env.PUBLIC_BACKEND_URL ||
      "";

    const fetchLocs = async () => {
      try {
        const res = await fetch(`${base}/localidades/buscar?q=${encodeURIComponent(locQuery)}`);
        if (!res.ok) return setLocSuggestions([]);
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
    setLocDirty(false);
  };

  const handleLocInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocQuery(val);
    setSelectedLoc(null);
    setForm((f) => ({ ...f, pueblo: val, provincia: "", comunidad: "" }));
    setLocDirty(true);
    setShowDropdown(true);
  };

  const handleLocBlur = () => setTimeout(() => setShowDropdown(false), 150);

  const ensureLocalidad = () => {
    if (locDirty && !selectedLoc) return false;

    if (selectedLoc) {
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
    }

    return !!(form.pueblo && form.provincia && form.comunidad);
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

    const selected = files.slice(0, remain);

    const newItems: PhotoItem[] = [];
    for (const f of selected) {
      try {
        const compressed = await compressImage(f);
        const previewUrl = URL.createObjectURL(compressed);
        newItems.push({
          id: uid(),
          url: previewUrl,
          file: compressed,
          isNew: true,
          progress: 0,
          status: "ready",
        });
      } catch (e) {
        console.warn("No se pudo comprimir foto:", e);
      }
    }

    setPhotos((prev) => [...prev, ...newItems]);
  };

  const removePhoto = (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const onPickPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    await addPhotos(files);
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  // Video
  const onPickVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    if (f.size > MAX_VIDEO_SIZE) {
      setFormMsg({ msg: "El video es demasiado grande (máx 40MB).", type: "error" });
      if (videoInputRef.current) videoInputRef.current.value = "";
      return;
    }

    const url = URL.createObjectURL(f);
    const video = document.createElement("video");
    video.src = url;

    const durationOk = await new Promise<boolean>((resolve) => {
      video.onloadedmetadata = () => {
        resolve(video.duration <= MAX_VIDEO_DURATION);
      };
      video.onerror = () => resolve(false);
    });

    if (!durationOk) {
      setFormMsg({ msg: "El video es demasiado largo (máx 3 minutos).", type: "error" });
      URL.revokeObjectURL(url);
      if (videoInputRef.current) videoInputRef.current.value = "";
      return;
    }

    setRemoveVideo(false);
    setExistingVideoUrl("");
    setVideoFile(f);
    setVideoPreview(url);
    setVideoProgress(0);
  };

  const clearVideo = () => {
    setVideoFile(null);
    setVideoPreview("");
    setRemoveVideo(true);
    if (videoInputRef.current) videoInputRef.current.value = "";
  };

  // Upload fotos en paralelo
  const uploadPhotosParallel = async (): Promise<string[]> => {
    const results: (string | null)[] = photos.map((p) => (p.isNew ? null : p.url));

    let nextIdx = 0;
    const worker = async () => {
      while (true) {
        const i = nextIdx++;
        if (i >= photos.length) return;

        const item = photos[i];
        if (!item.isNew || !item.file) continue;

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
    <form onSubmit={handleSubmit} className="max-w-3xl mx-auto p-6 bg-white rounded-3xl shadow-xl space-y-6">
      <h2 className="text-3xl font-bold text-emerald-700 text-center mb-4">Editar Servicio</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block mb-1 font-semibold text-gray-700">Nombre</label>
          <input
            name="nombre"
            value={form.nombre}
            onChange={handleInput}
            className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-emerald-400"
            required
          />
        </div>

        <div>
          <label className="block mb-1 font-semibold text-gray-700">Categoría</label>
          <select
            name="categoria"
            value={form.categoria}
            onChange={handleInput}
            className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-emerald-400"
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

        <div className="sm:col-span-2">
          <label className="block mb-1 font-semibold text-gray-700">Oficio</label>
          <input
            name="oficio"
            value={form.oficio}
            onChange={handleInput}
            className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-emerald-400"
            required
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block mb-1 font-semibold text-gray-700">Descripción</label>
          <textarea
            name="descripcion"
            value={form.descripcion}
            onChange={handleInput}
            className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-emerald-400"
            rows={5}
            required
          />
        </div>

        <div>
          <label className="block mb-1 font-semibold text-gray-700">Contacto</label>
          <input
            name="contacto"
            value={form.contacto}
            onChange={handleInput}
            className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-emerald-400"
          />
        </div>

        <div>
          <label className="block mb-1 font-semibold text-gray-700">WhatsApp</label>
          <input
            name="whatsapp"
            value={form.whatsapp}
            onChange={handleInput}
            className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-emerald-400"
            placeholder="+34 600 000 000"
          />
        </div>

        <div className="sm:col-span-2 relative">
          <label className="block mb-1 font-semibold text-gray-700">Localidad</label>
          <input
            value={locQuery}
            onChange={handleLocInput}
            onFocus={() => setShowDropdown(true)}
            onBlur={handleLocBlur}
            className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-emerald-400"
            placeholder="Ej: Graus, Huesca…"
          />

          {showDropdown && locSuggestions.length > 0 && (
            <div className="absolute z-50 mt-1 w-full bg-white border rounded-xl shadow max-h-60 overflow-auto">
              {locSuggestions.slice(0, 12).map((loc, idx) => {
                const provinciaNombre =
                  typeof loc.provincia === "object" ? loc.provincia?.nombre : loc.provincia || "";
                const ccaaNombre =
                  typeof loc.ccaa === "object" ? loc.ccaa?.nombre : loc.ccaa || "";
                const label = [loc.nombre, provinciaNombre, ccaaNombre].filter(Boolean).join(", ");

                return (
                  <button
                    key={`${loc.municipio_id || idx}-${idx}`}
                    type="button"
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={() => applyLocalidad(loc)}
                    className="w-full text-left px-4 py-2 hover:bg-emerald-50"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2 mt-3">
            <div>
              <label className="block mb-1 text-sm font-semibold text-gray-700">Provincia</label>
              <input
                name="provincia"
                value={form.provincia}
                onChange={handleInput}
                className="w-full p-3 border rounded-xl bg-gray-50"
                readOnly
              />
            </div>
            <div>
              <label className="block mb-1 text-sm font-semibold text-gray-700">Comunidad</label>
              <input
                name="comunidad"
                value={form.comunidad}
                onChange={handleInput}
                className="w-full p-3 border rounded-xl bg-gray-50"
                readOnly
              />
            </div>
          </div>
        </div>
      </div>

      <div>
        <label className="block mb-2 font-semibold text-gray-700">Fotos (mínimo 1, máximo {MAX_FOTOS})</label>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {photos.map((p) => (
            <div key={p.id} className="relative rounded-xl overflow-hidden border">
              <img src={p.url} alt="foto" className="w-full h-32 object-cover" />

              <button
                type="button"
                onClick={() => removePhoto(p.id)}
                className="absolute top-2 right-2 bg-black/60 text-white rounded-full w-7 h-7 flex items-center justify-center"
                title="Eliminar"
              >
                ✕
              </button>

              {p.status === "uploading" && (
                <div className="absolute bottom-0 left-0 right-0 h-2 bg-gray-200">
                  <div className="h-2 bg-emerald-400" style={{ width: `${p.progress}%` }} />
                </div>
              )}
              {p.status === "error" && (
                <div className="absolute inset-0 bg-red-600/60 text-white flex items-center justify-center text-sm">
                  Error
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-3">
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={onPickPhotos}
            className="hidden"
            id="edit-photos"
          />
          <label
            htmlFor="edit-photos"
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl cursor-pointer"
          >
            📷 Añadir fotos
          </label>

          <span className="text-sm text-gray-500">{photos.length}/{MAX_FOTOS}</span>
        </div>
      </div>

      <div>
        <label className="block mb-2 font-semibold text-gray-700">Video (opcional, máx 3 min / 40MB)</label>

        <div className="flex items-center gap-3">
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            onChange={onPickVideo}
            className="hidden"
            id="edit-video"
          />
          <label
            htmlFor="edit-video"
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-xl cursor-pointer"
          >
            🎥 Elegir video
          </label>

          <button
            type="button"
            onClick={clearVideo}
            className="px-4 py-2 rounded-xl bg-gray-200 hover:bg-gray-300"
          >
            Quitar video
          </button>
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
