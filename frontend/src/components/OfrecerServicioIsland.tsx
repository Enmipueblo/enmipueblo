import React, { useEffect, useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import { onUserStateChange } from "../lib/firebase.js";
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
const MAX_IMG_SIZE_MB = 0.35;
const MAX_IMG_DIM = 1600;
const UPLOAD_CONCURRENCY = 3;
const COMPRESS_CONCURRENCY = 2;

type Localidad = {
  municipio_id?: string | number;
  id?: string | number;
  codigo?: string | number;
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

function isJwtLike(v: unknown) {
  const s = String(v || "").trim();
  return s.split(".").length === 3;
}

async function resolveGoogleIdToken(user: any): Promise<string> {
  try {
    const raw = localStorage.getItem("enmipueblo_auth_v1");
    if (raw) {
      const parsed = JSON.parse(raw);
      const token = parsed?.token;
      if (isJwtLike(token)) return String(token);
    }
  } catch {}

  const legacy = localStorage.getItem("enmi_google_id_token_v1");
  if (isJwtLike(legacy)) return String(legacy);

  const directCandidates = [
    user?.token,
    user?.idToken,
    user?.credential,
  ];

  for (const c of directCandidates) {
    if (isJwtLike(c)) return String(c);
  }

  try {
    if (user && typeof user.getIdToken === "function") {
      const t = await user.getIdToken();
      if (isJwtLike(t)) return String(t);
    }
  } catch {}

  throw new Error("No se encontró un token válido. Cierra sesión y vuelve a entrar con Google.");
}

function getApiBase() {
  const base = import.meta.env.PUBLIC_BACKEND_URL || "";
  return base.endsWith("/api") ? base : `${base}/api`;
}

function parseApiError(text: string) {
  try {
    const j = JSON.parse(text);
    return j?.error || j?.message || text;
  } catch {
    return text;
  }
}

// ✅ PROXY UPLOAD: el archivo va al backend /api/uploads/upload (multipart).
// El backend lo sube a R2 server-side. El navegador nunca habla con R2 directamente.
// Elimina el CORS 403 en r2.cloudflarestorage.com para siempre.
async function uploadFileDirect(
  file: File,
  folder: string,
  token: string,
  onProgress?: (pct: number) => void
): Promise<string> {
  const API = getApiBase();

  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file, file.name || "archivo");
    formData.append("folder", folder);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API}/uploads/upload`, true);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    // NO poner Content-Type: el browser añade el boundary correcto para multipart

    if (typeof onProgress === "function") {
      xhr.upload.onprogress = (evt) => {
        if (!evt.lengthComputable) return;
        onProgress(Math.round((evt.loaded / evt.total) * 100));
      };
    }

    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && json?.ok) {
          onProgress?.(100);
          const publicUrl = json?.data?.publicUrl || json?.publicUrl || json?.fileUrl || "";
          if (!publicUrl) return reject(new Error("El servidor no devolvio publicUrl"));
          resolve(publicUrl);
        } else {
          reject(new Error(json?.error || `Upload fallo (${xhr.status})`));
        }
      } catch {
        reject(new Error(`Upload fallo (${xhr.status})`));
      }
    };

    xhr.onerror = () => reject(new Error("Error de red subiendo archivo."));
    xhr.ontimeout = () => reject(new Error("Timeout subiendo archivo."));
    xhr.timeout = 120000;

    xhr.send(formData);
  });
}

async function compressImage(file: File): Promise<File> {
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
    return compressed as File;
  }
}

function getProvinciaNombre(loc: Localidad | null) {
  if (!loc) return "";
  return typeof loc.provincia === "object" ? loc.provincia?.nombre || "" : loc.provincia || "";
}

function getCcaaNombre(loc: Localidad | null) {
  if (!loc) return "";
  if (typeof loc.ccaa === "object") return loc.ccaa?.nombre || "";
  if (typeof loc.comunidad === "object") return loc.comunidad?.nombre || "";
  return loc.ccaa || loc.comunidad || "";
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

  const [locQuery, setLocQuery] = useState("");
  const [localidades, setLocalidades] = useState<Localidad[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedLoc, setSelectedLoc] = useState<Localidad | null>(null);
  const locDebounceRef = useRef<any>(null);

  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const [video, setVideo] = useState<File | null>(null);
  const [videoProgress, setVideoProgress] = useState<number>(0);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const unsub = onUserStateChange((u: any) => {
      setUser(u || null);
      setUserLoaded(true);
    });
    return () => unsub && unsub();
  }, []);

  useEffect(() => {
    if (!locQuery || locQuery.trim().length < 2) {
      setLocalidades([]);
      return;
    }

    if (locDebounceRef.current) clearTimeout(locDebounceRef.current);

    locDebounceRef.current = setTimeout(async () => {
      try {
        const res = await buscarLocalidades(locQuery.trim());
        const arr = (res as any)?.data || res || [];
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

  const applyLocalidad = (loc: Localidad) => {
    const provinciaNombre = getProvinciaNombre(loc);
    const ccaaNombre = getCcaaNombre(loc);

    setSelectedLoc({
      ...loc,
      provincia: provinciaNombre,
      ccaa: ccaaNombre,
      comunidad: ccaaNombre,
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

    const provinciaNombre = getProvinciaNombre(selectedLoc);
    const ccaaNombre = getCcaaNombre(selectedLoc);

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
    const { name, value } = e.target as any;
    setForm((f) => ({ ...f, [name]: value }));
  };

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

  const uploadPhotosParallel = async (token: string): Promise<string[]> => {
    const results: (string | null)[] = new Array(photos.length).fill(null);
    let nextIndex = 0;

    const worker = async () => {
      while (true) {
        const i = nextIndex++;
        if (i >= photos.length) return;

        setPhotos((prev) =>
          prev.map((p, idx) => (idx === i ? { ...p, status: "uploading", progress: 0 } : p))
        );

        try {
          const url = await uploadFileDirect(photos[i].file, "service_images/fotos", token, (pct: number) => {
            setPhotos((prev) => prev.map((p, idx) => (idx === i ? { ...p, progress: pct } : p)));
          });

          results[i] = url;

          setPhotos((prev) =>
            prev.map((p, idx) => (idx === i ? { ...p, status: "done", progress: 100 } : p))
          );
        } catch (e) {
          setPhotos((prev) => prev.map((p, idx) => (idx === i ? { ...p, status: "error" } : p)));
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

    if (photos.length < 1) {
      setFormMsg({ msg: "Debes subir al menos una foto.", type: "error" });
      return;
    }

    setLoading(true);
    setFormMsg({ msg: "Subiendo archivos…", type: "info" });

    try {
      const idToken = await resolveGoogleIdToken(user);
      const photoUrls = await uploadPhotosParallel(idToken);

      let videoUrl = "";
      if (video) {
        setVideoProgress(0);
        videoUrl = await uploadFileDirect(video, "service_images/video", idToken, (pct: number) => setVideoProgress(pct));
        setVideoProgress(100);
      }

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
        imagenes: photoUrls,
        videoUrl,
      };

      const API = getApiBase();

      const res = await fetch(`${API}/servicios`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(parseApiError(text) || "Error creando servicio");
      }

      setFormMsg({ msg: "¡Servicio publicado correctamente! Redirigiendo a tu panel…", type: "success" });

      setTimeout(() => {
        window.location.href = "/usuario/panel";
      }, 900);

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
      setFormMsg({
        msg: err?.message || "Error publicando. Revisa tu conexión e inténtalo.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const baseInput =
    "border rounded-2xl p-3 bg-white/88 backdrop-blur focus:outline-none focus:ring-4";
  const baseBorderStyle: React.CSSProperties = {
    borderColor: "var(--sb-border)",
    color: "var(--sb-ink)",
  };

  if (!userLoaded) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] animate-pulse" style={{ color: "var(--sb-ink2)" }}>
        Cargando formulario…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <h2 className="text-2xl font-extrabold mb-3" style={{ color: "var(--sb-ink)" }}>
          Inicia sesión para publicar tu servicio
        </h2>
        <p className="mb-6 max-w-md" style={{ color: "var(--sb-ink2)" }}>
          EnMiPueblo necesita saber quién eres para gestionar tus anuncios y permitirte editarlos o eliminarlos.
        </p>
        <a
          href="/"
          className="text-white font-extrabold px-6 py-3 rounded-2xl shadow hover:brightness-[0.97]"
          style={{ background: "linear-gradient(90deg, var(--sb-accent2), var(--sb-accent))" }}
        >
          Ir al inicio
        </a>
      </div>
    );
  }

  const provinciaText = getProvinciaNombre(selectedLoc);
  const ccaaText = getCcaaNombre(selectedLoc);

  return (
    <div className="max-w-4xl mx-auto">
      <form
        onSubmit={handleSubmit}
        className="rounded-3xl shadow p-6 md:p-10 border"
        style={{
          background: "var(--sb-card2)",
          borderColor: "var(--sb-border)",
          backdropFilter: "blur(10px)",
        }}
      >
        <h2 className="text-3xl font-extrabold mb-2" style={{ color: "var(--sb-ink)" }}>
          Publica tu servicio<span style={{ color: "var(--sb-accent)" }}>.</span>
        </h2>
        <p className="mb-8" style={{ color: "var(--sb-ink2)" }}>
          Completa la información y sube al menos una foto. El video es opcional. La localidad se elige del listado cargado en el sistema.
        </p>

        {formMsg && (
          <div
            className="mb-6 p-4 rounded-2xl border text-sm font-semibold"
            style={{
              background:
                formMsg.type === "success"
                  ? "rgba(14,165,164,0.10)"
                  : formMsg.type === "error"
                  ? "rgba(214,93,14,0.10)"
                  : "rgba(15,23,42,0.05)",
              borderColor:
                formMsg.type === "success"
                  ? "rgba(14,165,164,0.22)"
                  : formMsg.type === "error"
                  ? "rgba(214,93,14,0.22)"
                  : "rgba(15,23,42,0.10)",
              color: "var(--sb-ink)",
            }}
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
            className={baseInput}
            style={{ ...baseBorderStyle, boxShadow: "0 0 0 0 rgba(0,0,0,0)" }}
          />
          <input
            name="nombre"
            value={form.nombre}
            onChange={handleInput}
            placeholder="Título del anuncio *"
            className={baseInput}
            style={{ ...baseBorderStyle, boxShadow: "0 0 0 0 rgba(0,0,0,0)" }}
          />

          <select
            name="categoria"
            value={form.categoria}
            onChange={handleInput}
            className={baseInput}
            style={{ ...baseBorderStyle, boxShadow: "0 0 0 0 rgba(0,0,0,0)" }}
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
            className={baseInput}
            style={{ ...baseBorderStyle, boxShadow: "0 0 0 0 rgba(0,0,0,0)" }}
          />
        </div>

        <textarea
          name="descripcion"
          value={form.descripcion}
          onChange={handleInput}
          placeholder="Descripción *"
          rows={5}
          className="mt-4 w-full border rounded-2xl p-3 bg-white/88 backdrop-blur focus:outline-none focus:ring-4"
          style={baseBorderStyle}
        />

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            name="contacto"
            value={form.contacto}
            onChange={handleInput}
            placeholder="Contacto (teléfono/email) *"
            className={baseInput}
            style={baseBorderStyle}
          />
          <input
            name="whatsapp"
            value={form.whatsapp}
            onChange={handleInput}
            placeholder="WhatsApp (opcional)"
            className={baseInput}
            style={baseBorderStyle}
          />
        </div>

        <div className="mt-6 relative">
          <label className="block text-sm font-extrabold mb-2" style={{ color: "var(--sb-ink)" }}>
            Localidad *
          </label>

          <input
            value={locQuery}
            onChange={(e) => {
              setLocQuery(e.target.value);
              setSelectedLoc(null);
            }}
            onFocus={() => setShowDropdown(true)}
            onBlur={handleLocBlur}
            placeholder="Escribe tu pueblo…"
            className="w-full border rounded-2xl p-3 bg-white/88 backdrop-blur focus:outline-none focus:ring-4"
            style={baseBorderStyle}
          />

          <div className="mt-2 text-xs" style={{ color: "var(--sb-ink2)" }}>
            Elige una localidad del listado. Ya no hace falta mapa ni coordenadas.
          </div>

          {selectedLoc && (
            <div className="mt-2 text-xs" style={{ color: "var(--sb-ink2)" }}>
              Seleccionado:{" "}
              <span className="font-extrabold" style={{ color: "var(--sb-ink)" }}>
                {selectedLoc.nombre}
              </span>
              {provinciaText ? ` · ${provinciaText}` : ""}
              {ccaaText ? ` · ${ccaaText}` : ""}
            </div>
          )}

          {showDropdown && localidades.length > 0 && (
            <div
              className="absolute z-20 mt-2 w-full rounded-2xl shadow-lg overflow-hidden border"
              style={{
                background: "rgba(255,255,255,0.94)",
                borderColor: "var(--sb-border)",
                backdropFilter: "blur(10px)",
              }}
            >
              {localidades.slice(0, 12).map((loc) => {
                const prov = getProvinciaNombre(loc);
                const ccaa = getCcaaNombre(loc);
                return (
                  <button
                    key={String(loc.municipio_id || loc.id || loc.codigo || loc.nombre) + loc.nombre}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyLocalidad(loc)}
                    className="w-full text-left px-4 py-3"
                    style={{ color: "var(--sb-ink)" }}
                    onMouseEnter={(e) => ((e.currentTarget.style.background = "rgba(14,165,164,0.10)"))}
                    onMouseLeave={(e) => ((e.currentTarget.style.background = "transparent"))}
                  >
                    <div className="font-extrabold" style={{ color: "var(--sb-ink)" }}>
                      {loc.nombre}
                    </div>
                    <div className="text-xs" style={{ color: "var(--sb-ink2)" }}>
                      {[prov, ccaa].filter(Boolean).join(", ")}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-8">
          <div className="flex items-center justify-between gap-3 mb-3">
            <label className="block text-sm font-extrabold" style={{ color: "var(--sb-ink)" }}>
              Fotos obligatorias (mínimo 1, máximo {MAX_FOTOS})
            </label>

            <button
              type="button"
              onClick={openPhotoDialog}
              className="text-sm px-4 py-1.5 rounded-xl border hover:brightness-[0.98]"
              style={{
                background: "rgba(14,165,164,0.10)",
                borderColor: "rgba(14,165,164,0.18)",
                color: "var(--sb-ink)",
              }}
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
            className="border-2 border-dashed rounded-3xl p-5"
            style={{
              borderColor: "rgba(14,165,164,0.22)",
              background: "rgba(14,165,164,0.06)",
            }}
          >
            <p className="text-sm" style={{ color: "var(--sb-ink2)" }}>
              Arrastra tus fotos aquí o usa “Añadir fotos”. Se optimizan automáticamente.
            </p>

            {photos.length > 0 && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                {photos.map((p, idx) => (
                  <div
                    key={p.id}
                    className="flex gap-3 items-center rounded-2xl p-3 border"
                    style={{ background: "rgba(255,255,255,0.82)", borderColor: "var(--sb-border)" }}
                  >
                    <img
                      src={p.preview}
                      alt="preview"
                      className="w-16 h-16 rounded-xl object-cover border"
                      style={{ borderColor: "rgba(14,165,164,0.18)" }}
                    />
                    <div className="flex-1">
                      <div className="text-sm font-extrabold flex items-center gap-2" style={{ color: "var(--sb-ink)" }}>
                        Foto {idx + 1}
                        {idx === 0 && (
                          <span
                            className="text-xs px-2 py-0.5 rounded-lg border"
                            style={{
                              background: "rgba(14,165,164,0.10)",
                              borderColor: "rgba(14,165,164,0.18)",
                              color: "var(--sb-ink)",
                            }}
                          >
                            Principal
                          </span>
                        )}
                      </div>

                      <div className="text-xs mt-1" style={{ color: "var(--sb-ink2)" }}>
                        Estado:{" "}
                        <span className="font-extrabold">
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
                        <div className="mt-1 w-full rounded-full h-2 overflow-hidden" style={{ background: "rgba(148,163,184,0.22)" }}>
                          <div
                            className="h-2"
                            style={{ width: `${p.progress}%`, background: "var(--sb-accent2)" }}
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => setPrincipal(idx)}
                        className="text-xs px-3 py-1 rounded-xl border hover:brightness-[0.98]"
                        style={{
                          borderColor: "rgba(14,165,164,0.18)",
                          color: "var(--sb-ink)",
                          background: "rgba(255,255,255,0.78)",
                        }}
                        title="Hacer principal"
                      >
                        Principal
                      </button>
                      <button
                        type="button"
                        onClick={() => removePhoto(idx)}
                        className="text-xs px-3 py-1 rounded-xl border hover:brightness-[0.98]"
                        style={{
                          borderColor: "rgba(214,93,14,0.18)",
                          color: "var(--sb-ink)",
                          background: "rgba(214,93,14,0.08)",
                        }}
                        title="Eliminar"
                      >
                        Quitar
                      </button>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => movePhoto(idx, idx - 1)}
                          className="text-xs px-2 py-1 rounded-xl border hover:brightness-[0.98]"
                          style={{
                            borderColor: "rgba(14,165,164,0.18)",
                            color: "var(--sb-ink)",
                            background: "rgba(255,255,255,0.78)",
                          }}
                          title="Subir"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => movePhoto(idx, idx + 1)}
                          className="text-xs px-2 py-1 rounded-xl border hover:brightness-[0.98]"
                          style={{
                            borderColor: "rgba(14,165,164,0.18)",
                            color: "var(--sb-ink)",
                            background: "rgba(255,255,255,0.78)",
                          }}
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

        <div className="mt-8">
          <div className="flex items-center justify-between gap-3 mb-3">
            <label className="block text-sm font-extrabold" style={{ color: "var(--sb-ink)" }}>
              Vídeo opcional
            </label>

            {!video ? (
              <button
                type="button"
                onClick={openVideoDialog}
                className="text-sm px-4 py-1.5 rounded-xl border hover:brightness-[0.98]"
                style={{
                  background: "rgba(14,165,164,0.10)",
                  borderColor: "rgba(14,165,164,0.18)",
                  color: "var(--sb-ink)",
                }}
              >
                Subir video
              </button>
            ) : (
              <button
                type="button"
                onClick={removeVideo}
                className="text-sm px-4 py-1.5 rounded-xl border hover:brightness-[0.98]"
                style={{
                  background: "rgba(214,93,14,0.08)",
                  borderColor: "rgba(214,93,14,0.18)",
                  color: "var(--sb-ink)",
                }}
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
            <div className="rounded-2xl border p-4" style={{ background: "rgba(255,255,255,0.82)", borderColor: "var(--sb-border)" }}>
              <div className="text-sm font-extrabold" style={{ color: "var(--sb-ink)" }}>
                {video.name}
              </div>
              <div className="text-xs mt-1" style={{ color: "var(--sb-ink2)" }}>
                {Math.round((video.size / (1024 * 1024)) * 10) / 10} MB
              </div>

              {loading && videoProgress > 0 && (
                <div className="mt-2 w-full rounded-full h-2 overflow-hidden" style={{ background: "rgba(148,163,184,0.22)" }}>
                  <div className="h-2" style={{ width: `${videoProgress}%`, background: "var(--sb-accent2)" }} />
                </div>
              )}
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-10 w-full text-white font-extrabold py-4 rounded-2xl shadow-lg hover:brightness-[0.97] disabled:opacity-60"
          style={{ background: "linear-gradient(90deg, var(--sb-accent2), var(--sb-accent))" }}
        >
          {loading ? "Publicando…" : "Publicar servicio"}
        </button>
      </form>
    </div>
  );
};

export default OfrecerServicioIsland;