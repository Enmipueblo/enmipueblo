import React, { useEffect, useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import { onUserStateChange, uploadFile } from "../lib/firebase.js";
import { buscarLocalidades, geocodeES } from "../lib/api-utils.js";
import LocationPickerModal from "./LocationPickerModal.tsx";

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
const MAX_IMG_DIM = 1600;
const UPLOAD_CONCURRENCY = 3;
const COMPRESS_CONCURRENCY = 2;

type Localidad = {
  municipio_id: string | number;
  nombre: string;
  provincia?: string | { nombre: string };
  ccaa?: string | { nombre: string };
  comunidad?: string | { nombre: string };
  lat?: number;
  lng?: number;
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
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

async function compressImage(file: File): Promise<File> {
  // Optimización real: WebP + resize + límite de peso.
  // (reduce muchísimo el tiempo de subida en móvil)
  const safeBase = (file.name || "foto")
    .replace(/\s+/g, "_")
    .replace(/\.[^.]+$/, "");
  const outName = `${safeBase}.webp`;

  const compressed = await imageCompression(file, {
    maxWidthOrHeight: MAX_IMG_DIM,
    maxSizeMB: MAX_IMG_SIZE_MB,
    useWebWorker: true,
    initialQuality: 0.78,
    fileType: "image/webp",
  });

  try {
    return new File([compressed], outName, { type: "image/webp" });
  } catch {
    // fallback si el navegador no permite File()
    return compressed as File;
  }
}

const OfrecerServicioIsland: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [userLoaded, setUserLoaded] = useState(false);

  const [form, setForm] = useState({
    profesionalNombre: "",
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

  const [loading, setLoading] = useState(false);
  const [formMsg, setFormMsg] = useState<FormMsg>(null);

  // Localidades
  const [locQuery, setLocQuery] = useState("");
  const [localidades, setLocalidades] = useState<Localidad[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedLoc, setSelectedLoc] = useState<Localidad | null>(null);
  const locDebounceRef = useRef<any>(null);

  // Fotos
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  // Video
  const [video, setVideo] = useState<File | null>(null);
  const [videoProgress, setVideoProgress] = useState<number>(0);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  // Mapa / modal
  const [mapOpen, setMapOpen] = useState(false);

  // ------------------------------------------------
  // AUTH
  // ------------------------------------------------
  useEffect(() => {
    const unsub = onUserStateChange((u: any) => {
      setUser(u || null);
      setUserLoaded(true);
    });
    return () => unsub && unsub();
  }, []);

  // ------------------------------------------------
  // LOCALIDADES
  // ------------------------------------------------
  useEffect(() => {
    if (!locQuery || locQuery.trim().length < 2) {
      setLocalidades([]);
      return;
    }

    if (locDebounceRef.current) clearTimeout(locDebounceRef.current);

    locDebounceRef.current = setTimeout(async () => {
      try {
        const res = await buscarLocalidades(locQuery.trim());
        const arr = res?.data || res || [];
        setLocalidades(Array.isArray(arr) ? arr : []);
        setShowDropdown(true);
      } catch {
        setLocalidades([]);
      }
    }, 220);

    return () => {
      if (locDebounceRef.current) clearTimeout(locDebounceRef.current);
    };
  }, [locQuery]);

  const applyLocalidad = async (loc: Localidad, opts?: { lat?: number; lng?: number }) => {
    const provinciaNombre =
      typeof loc.provincia === "object" ? loc.provincia?.nombre : loc.provincia || "";
    const ccaaNombre =
      typeof loc.ccaa === "object" ? loc.ccaa?.nombre : loc.ccaa || "";

    // Coordenadas: si vienen del mapa, las usamos. Si no, intentamos geocodificar el texto.
    let lat = opts?.lat ?? loc.lat;
    let lng = opts?.lng ?? loc.lng;
    if ((!lat || !lng) && (loc?.nombre || provinciaNombre || ccaaNombre)) {
      try {
        const txt = [loc.nombre, provinciaNombre, ccaaNombre, "España"].filter(Boolean).join(", ");
        const g = await geocodeES(txt);
        if (g?.lat && g?.lng) {
          lat = g.lat;
          lng = g.lng;
        }
      } catch {}
    }

    setSelectedLoc({
      ...loc,
      comunidad: loc.comunidad ?? ccaaNombre,
      lat,
      lng,
    });
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

  // ------------------------------------------------
  // HANDLERS FORM
  // ------------------------------------------------
  const handleInput = (
    e:
      | React.ChangeEvent<HTMLInputElement>
      | React.ChangeEvent<HTMLTextAreaElement>
      | React.ChangeEvent<HTMLSelectElement>
  ) => {
    const { name, value } = e.target as any;
    setForm((f) => ({ ...f, [name]: value }));
  };

  // ------------------------------------------------
  // FOTOS
  // ------------------------------------------------
  const addPhotos = async (files: File[]) => {
    if (files.length === 0) return;

    const remain = MAX_FOTOS - photos.length;
    if (remain <= 0) {
      setFormMsg({ msg: `Máximo ${MAX_FOTOS} fotos permitidas.`, type: "error" });
      return;
    }

    const slice = files.slice(0, remain);

    setFormMsg({ msg: `Procesando fotos… 0/${slice.length}`, type: "info" });

    const results: (PhotoItem | null)[] = new Array(slice.length).fill(null);
    let nextIndex = 0;
    let done = 0;

    const worker = async () => {
      while (true) {
        const i = nextIndex++;
        if (i >= slice.length) return;

        const f = slice[i];
        try {
          const compressed = await compressImage(f);
          const preview = URL.createObjectURL(compressed);
          results[i] = {
            id: uid(),
            file: compressed,
            preview,
            progress: 0,
            status: "ready",
          };
        } catch {
          results[i] = null;
        } finally {
          done++;
          setFormMsg({ msg: `Procesando fotos… ${done}/${slice.length}`, type: "info" });
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(COMPRESS_CONCURRENCY, slice.length) },
      () => worker()
    );
    await Promise.all(workers);

    const okItems = results.filter(Boolean) as PhotoItem[];

    if (okItems.length === 0) {
      setFormMsg({ msg: "No se pudo procesar ninguna imagen.", type: "error" });
      return;
    }

    setPhotos((prev) => [...prev, ...okItems]);
    setFormMsg(null);
  };

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files).filter((f) => f.type.startsWith("image/"));
    await addPhotos(files);
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

  const onDropZoneDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const onDropZoneDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const dt = e.dataTransfer;
    if (!dt?.files?.length) return;
    await addPhotos(Array.from(dt.files));
  };

  // ------------------------------------------------
  // VIDEO
  // ------------------------------------------------
  const handleVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > MAX_VIDEO_SIZE) {
      setFormMsg({ msg: "El video es demasiado grande (máx 40MB).", type: "error" });
      return;
    }

    try {
      const url = URL.createObjectURL(file);
      const videoEl = document.createElement("video");
      videoEl.preload = "metadata";
      videoEl.src = url;

      const duration: number = await new Promise((resolve, reject) => {
        videoEl.onloadedmetadata = () => {
          URL.revokeObjectURL(url);
          resolve(videoEl.duration || 0);
        };
        videoEl.onerror = () => reject(new Error("No se pudo leer el video"));
      });

      if (duration > MAX_VIDEO_DURATION) {
        setFormMsg({ msg: "El video supera 3 minutos. Recórtalo y vuelve a intentarlo.", type: "error" });
        return;
      }

      setVideo(file);
      setFormMsg(null);
    } catch {
      setFormMsg({ msg: "No se pudo validar el video.", type: "error" });
    }
  };

  const openVideoDialog = () => {
    if (videoInputRef.current) {
      videoInputRef.current.value = "";
      videoInputRef.current.click();
    }
  };

  const removeVideo = () => {
    setVideo(null);
    setVideoProgress(0);
  };

  // ------------------------------------------------
  // UPLOAD PARALLEL
  // ------------------------------------------------
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

    const workers = Array.from(
      { length: Math.min(UPLOAD_CONCURRENCY, photos.length) },
      () => worker()
    );
    await Promise.all(workers);

    return results.map((x) => x || "").filter(Boolean);
  };

  // ------------------------------------------------
  // SUBMIT
  // ------------------------------------------------
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

    if (!Number.isFinite(selectedLoc?.lat) || !Number.isFinite(selectedLoc?.lng)) {
      setFormMsg({
        msg: "Para que te encuentren por distancia, selecciona una ubicación en el mapa (o una localidad que devuelva coordenadas).",
        type: "error",
      });
      return;
    }

    if (
      !form.profesionalNombre ||
      !form.nombre ||
      !form.categoria ||
      !form.oficio ||
      !form.descripcion ||
      !form.contacto ||
      !form.pueblo
    ) {
      setFormMsg({ msg: "Completa los campos obligatorios.", type: "error" });
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
        videoUrl = (await uploadFile(video, "service_images/video", (pct: number) => setVideoProgress(pct))) as string;
        setVideoProgress(100);
      }

      // 3) Crear servicio
      const payload: any = {
        profesionalNombre: form.profesionalNombre,
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

      // ✅ coords para búsquedas por distancia
      if (Number.isFinite(selectedLoc?.lat) && Number.isFinite(selectedLoc?.lng)) {
        payload.lat = selectedLoc.lat;
        payload.lng = selectedLoc.lng;
      }

      let idToken: string | null = null;
      try {
        idToken = await user.getIdToken();
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
        throw new Error(text || "Error creando servicio");
      }

      setFormMsg({ msg: "¡Servicio publicado correctamente! Redirigiendo a tu panel…", type: "success" });

setTimeout(() => {
  window.location.href = "/usuario/panel";
}, 900);
      // reset
      setForm({
        profesionalNombre: "",
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
      setLocQuery("");
      setSelectedLoc(null);

      setPhotos((arr) => {
        arr.forEach((p) => p.preview && URL.revokeObjectURL(p.preview));
        return [];
      });

      setVideo(null);
      setVideoProgress(0);
    } catch (err: any) {
      console.error(err);
      setFormMsg({ msg: "Error publicando. Revisa tu conexión e inténtalo.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  // ------------------------------------------------
  // RENDER
  // ------------------------------------------------
  if (!userLoaded) {
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
        <a
          href="/"
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-3 rounded-2xl shadow"
        >
          Ir al inicio
        </a>
      </div>
    );
  }

  const provinciaText =
    typeof selectedLoc?.provincia === "object" ? selectedLoc?.provincia?.nombre : selectedLoc?.provincia || "";
  const ccaaText =
    typeof selectedLoc?.ccaa === "object" ? selectedLoc?.ccaa?.nombre : selectedLoc?.ccaa || "";

  return (
    <div className="max-w-4xl mx-auto">
      <LocationPickerModal
        open={mapOpen}
        title="Elegir ubicación"
        showRadius={false}
        initialRadiusKm={25}
        initialValueText={locQuery}
        initialLat={selectedLoc?.lat ?? null}
        initialLng={selectedLoc?.lng ?? null}
        onClose={() => setMapOpen(false)}
        onApply={(p) => {
          const lat = p.lat;
          const lng = p.lng;

          if (p.nombre) {
            void applyLocalidad(
              {
                municipio_id: p.id || "0",
                nombre: p.nombre,
                provincia: p.provincia,
                ccaa: p.comunidad,
              } as any,
              { lat, lng }
            );
          } else {
            setSelectedLoc((prev) =>
              prev
                ? { ...prev, lat, lng }
                : {
                    municipio_id: "0",
                    nombre: "Ubicación en mapa",
                    provincia: form.provincia,
                    ccaa: form.comunidad,
                    lat,
                    lng,
                  }
            );
          }

          setMapOpen(false);
        }}
      />

      <form onSubmit={handleSubmit} className="bg-white rounded-3xl shadow p-6 md:p-10 border border-emerald-100">
        <h2 className="text-3xl font-extrabold text-emerald-900 mb-2">
          Publica tu servicio
        </h2>
        <p className="text-gray-600 mb-8">
          Completa la información y sube fotos (y opcionalmente un video). Las fotos se optimizan automáticamente.
        </p>

        {formMsg && (
          <div
            className={[
              "mb-6 p-4 rounded-2xl border text-sm font-semibold",
              formMsg.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : formMsg.type === "error"
                ? "bg-red-50 border-red-200 text-red-700"
                : "bg-slate-50 border-slate-200 text-slate-700",
            ].join(" ")}
          >
            {formMsg.msg}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            name="profesionalNombre"
            value={form.profesionalNombre}
            onChange={handleInput}
            placeholder="Nombre del profesional *"
            className="border border-emerald-200 rounded-2xl p-3 focus:outline-none focus:ring-4 focus:ring-emerald-100"
          />
          <input
            name="nombre"
            value={form.nombre}
            onChange={handleInput}
            placeholder="Título del anuncio *"
            className="border border-emerald-200 rounded-2xl p-3 focus:outline-none focus:ring-4 focus:ring-emerald-100"
          />

          <select
            name="categoria"
            value={form.categoria}
            onChange={handleInput}
            className="border border-emerald-200 rounded-2xl p-3 focus:outline-none focus:ring-4 focus:ring-emerald-100"
          >
            <option value="">Categoría *</option>
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <input
            name="oficio"
            value={form.oficio}
            onChange={handleInput}
            placeholder="Oficio / Especialidad *"
            className="border border-emerald-200 rounded-2xl p-3 focus:outline-none focus:ring-4 focus:ring-emerald-100"
          />
        </div>

        <textarea
          name="descripcion"
          value={form.descripcion}
          onChange={handleInput}
          placeholder="Descripción *"
          rows={5}
          className="mt-4 w-full border border-emerald-200 rounded-2xl p-3 focus:outline-none focus:ring-4 focus:ring-emerald-100"
        />

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            name="contacto"
            value={form.contacto}
            onChange={handleInput}
            placeholder="Contacto (teléfono/email) *"
            className="border border-emerald-200 rounded-2xl p-3 focus:outline-none focus:ring-4 focus:ring-emerald-100"
          />
          <input
            name="whatsapp"
            value={form.whatsapp}
            onChange={handleInput}
            placeholder="WhatsApp (opcional)"
            className="border border-emerald-200 rounded-2xl p-3 focus:outline-none focus:ring-4 focus:ring-emerald-100"
          />
        </div>

        {/* Localidad */}
        <div className="mt-6 relative">
          <label className="block text-sm font-bold text-emerald-900 mb-2">
            Localidad *
          </label>

          <div className="flex gap-2">
            <input
              value={locQuery}
              onChange={(e) => {
                setLocQuery(e.target.value);
                setSelectedLoc(null);
              }}
              onFocus={() => setShowDropdown(true)}
              onBlur={handleLocBlur}
              placeholder="Escribe tu pueblo…"
              className="flex-1 border border-emerald-200 rounded-2xl p-3 focus:outline-none focus:ring-4 focus:ring-emerald-100"
            />
            <button
              type="button"
              onClick={() => setMapOpen(true)}
              className="px-4 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold shadow"
              title="Elegir en el mapa"
            >
              Mapa
            </button>
          </div>

          {selectedLoc && (
            <div className="mt-2 text-xs text-slate-600">
              Seleccionado:{" "}
              <span className="font-bold text-emerald-900">
                {selectedLoc.nombre}
              </span>
              {provinciaText ? ` · ${provinciaText}` : ""}
              {ccaaText ? ` · ${ccaaText}` : ""}
              {Number.isFinite(selectedLoc.lat) && Number.isFinite(selectedLoc.lng) ? (
                <span className="ml-2 text-emerald-700 font-bold">· coords OK</span>
              ) : (
                <span className="ml-2 text-red-600 font-bold">· sin coords</span>
              )}
            </div>
          )}

          {showDropdown && localidades.length > 0 && (
            <div className="absolute z-20 mt-2 w-full bg-white border border-emerald-100 rounded-2xl shadow-lg overflow-hidden">
              {localidades.slice(0, 12).map((loc) => {
                const prov = typeof loc.provincia === "object" ? loc.provincia?.nombre : loc.provincia || "";
                const ccaa = typeof loc.ccaa === "object" ? loc.ccaa?.nombre : loc.ccaa || "";
                return (
                  <button
                    key={String(loc.municipio_id) + loc.nombre}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => void applyLocalidad(loc)}
                    className="w-full text-left px-4 py-3 hover:bg-emerald-50"
                  >
                    <div className="font-bold text-emerald-950">{loc.nombre}</div>
                    <div className="text-xs text-slate-500">
                      {[prov, ccaa].filter(Boolean).join(", ")}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Fotos */}
        <div className="mt-8">
          <div className="flex items-center justify-between gap-3 mb-3">
            <label className="block text-sm font-bold text-emerald-900">
              Fotos (máx {MAX_FOTOS})
            </label>

            <button
              type="button"
              onClick={openPhotoDialog}
              className="text-sm bg-emerald-50 text-emerald-700 px-4 py-1.5 rounded-xl border border-emerald-200 hover:bg-emerald-100"
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
            onDragOver={onDropZoneDragOver}
            onDrop={onDropZoneDrop}
            className="border-2 border-dashed border-emerald-200 rounded-3xl p-5 bg-emerald-50/50"
          >
            <p className="text-sm text-slate-600">
              Arrastra tus fotos aquí o usa “Añadir fotos”. Se optimizan automáticamente.
            </p>

            {photos.length > 0 && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                {photos.map((p, idx) => (
                  <div key={p.id} className="flex gap-3 items-center bg-white rounded-2xl p-3 border border-emerald-100">
                    <img
                      src={p.preview}
                      alt="preview"
                      className="w-16 h-16 rounded-xl object-cover border border-emerald-100"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-bold text-emerald-950 flex items-center gap-2">
                        Foto {idx + 1}
                        {idx === 0 && (
                          <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-lg">
                            Principal
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-slate-500 mt-1">
                        Estado:{" "}
                        <span className="font-bold">
                          {p.status === "ready"
                            ? "lista"
                            : p.status === "uploading"
                            ? `subiendo ${p.progress}%`
                            : p.status === "done"
                            ? "subida"
                            : "error"}
                        </span>
                      </div>

                      {p.status === "uploading" && (
                        <div className="mt-1 w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div
                            className="h-2 bg-emerald-500"
                            style={{ width: `${p.progress}%` }}
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => setPrincipal(idx)}
                        className="text-xs px-3 py-1 rounded-xl border border-emerald-200 hover:bg-emerald-50"
                        title="Hacer principal"
                      >
                        Principal
                      </button>
                      <button
                        type="button"
                        onClick={() => removePhoto(idx)}
                        className="text-xs px-3 py-1 rounded-xl border border-red-200 text-red-600 hover:bg-red-50"
                        title="Eliminar"
                      >
                        Quitar
                      </button>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => movePhoto(idx, idx - 1)}
                          className="text-xs px-2 py-1 rounded-xl border border-emerald-200 hover:bg-emerald-50"
                          title="Subir"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => movePhoto(idx, idx + 1)}
                          className="text-xs px-2 py-1 rounded-xl border border-emerald-200 hover:bg-emerald-50"
                          title="Bajar"
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Video */}
        <div className="mt-8">
          <div className="flex items-center justify-between gap-3 mb-3">
            <label className="block text-sm font-bold text-emerald-900">
              Video (opcional)
            </label>

            {!video ? (
              <button
                type="button"
                onClick={openVideoDialog}
                className="text-sm bg-emerald-50 text-emerald-700 px-4 py-1.5 rounded-xl border border-emerald-200 hover:bg-emerald-100"
              >
                Subir video
              </button>
            ) : (
              <button
                type="button"
                onClick={removeVideo}
                className="text-sm bg-red-50 text-red-700 px-4 py-1.5 rounded-xl border border-red-200 hover:bg-red-100"
              >
                Quitar video
              </button>
            )}
          </div>

          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            onChange={handleVideo}
            className="hidden"
          />

          {video && (
            <div className="bg-white rounded-2xl border border-emerald-100 p-4">
              <div className="text-sm font-bold text-emerald-950">
                {video.name}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {Math.round((video.size / (1024 * 1024)) * 10) / 10} MB
              </div>

              {loading && videoProgress > 0 && (
                <div className="mt-2 w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-2 bg-emerald-500"
                    style={{ width: `${videoProgress}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-10 w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-extrabold py-4 rounded-2xl shadow-lg"
        >
          {loading ? "Publicando…" : "Publicar servicio"}
        </button>
      </form>
    </div>
  );
};

export default OfrecerServicioIsland;
