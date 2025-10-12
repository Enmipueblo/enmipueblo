import React, { useEffect, useState, useRef } from 'react';
import imageCompression from 'browser-image-compression';
import { onUserStateChange, uploadFile } from '../lib/firebase.js';

const CATEGORIAS = [
  'Albañilería',
  'Carpintería',
  'Electricidad',
  'Fontanería',
  'Pintura',
  'Jardinería',
  'Limpieza',
  'Panadería',
  'Hostelería',
  'Transporte',
  'Reparación Electrodomésticos',
  'Informática',
  'Diseño Gráfico',
  'Marketing',
  'Clases Particulares',
  'Salud y Bienestar',
  'Turismo',
  'Eventos',
  'Asesoría Legal',
  'Otros',
];

const initialState = {
  nombre: '',
  categoria: '',
  oficio: '',
  descripcion: '',
  contacto: '',
  whatsapp: '',
  pueblo: '',
  provincia: '',
  comunidad: '',
};

const MAX_FOTOS = 6;
const MAX_VIDEO_SIZE = 40 * 1024 * 1024; // 40MB
const MAX_VIDEO_DURATION = 180; // 3 minutos
const MAX_IMG_SIZE_MB = 0.35;
const MAX_IMG_DIM = 1200;

type Localidad = {
  municipio_id: string | number;
  nombre: string;
  provincia?: { id?: string | number; nombre: string };
  ccaa?: { id?: string | number; nombre: string };
};

function norm(s: string) {
  return (s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function resolveLocalidadFromText(
  query: string,
  localidades: Localidad[],
): Localidad | null {
  const q = norm(query.replaceAll(',', ' ')).replace(/\s+/g, ' ');
  if (!q) return null;

  const exact = localidades.find(l => {
    const n = norm(l.nombre);
    const p = norm(l.provincia?.nombre || '');
    return q === n || q === `${n} ${p}`.trim();
  });
  if (exact) return exact;

  const starts = localidades.filter(l => {
    const n = norm(l.nombre);
    const p = norm(l.provincia?.nombre || '');
    const c = norm(l.ccaa?.nombre || '');
    return n.startsWith(q) || p.startsWith(q) || c.startsWith(q);
  });
  if (starts.length === 1) return starts[0];

  const includes = localidades.filter(l => {
    const n = norm(l.nombre);
    const p = norm(l.provincia?.nombre || '');
    const c = norm(l.ccaa?.nombre || '');
    return n.includes(q) || p.includes(q) || c.includes(q);
  });
  if (includes.length === 1) return includes[0];

  return null;
}

const OfrecerServicioIsland = () => {
  const [user, setUser] = useState<any>(undefined);
  const [form, setForm] = useState(initialState);
  const [photos, setPhotos] = useState<File[]>([]);
  const [video, setVideo] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [formMsg, setFormMsg] = useState<{
    msg: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);
  const [photoURLs, setPhotoURLs] = useState<string[]>([]);
  const [videoURL, setVideoURL] = useState('');

  // Localidades (idéntico a Buscar)
  const [localidades, setLocalidades] = useState<Localidad[]>([]);
  const [query, setQuery] = useState(''); // texto visible en input
  const [suggestions, setSuggestions] = useState<Localidad[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const unsub = onUserStateChange((u: any) => setUser(u));
    return () => unsub && unsub();
  }, []);

  useEffect(() => {
    const base =
      (typeof window !== 'undefined' && (window as any).BACKEND_URL) ||
      import.meta.env.PUBLIC_BACKEND_URL ||
      '';
    fetch(`${base}/api/localidades`)
      .then(res => res.json())
      .then((data: Localidad[]) =>
        setLocalidades(Array.isArray(data) ? data : []),
      )
      .catch(() => setLocalidades([]));
  }, []);

  useEffect(() => {
    if (!query || query.length < 2) {
      setSuggestions([]);
      return;
    }
    const q = norm(query);
    const startsWith = localidades.filter(
      loc =>
        norm(loc.nombre).startsWith(q) ||
        norm(loc.provincia?.nombre || '').startsWith(q) ||
        norm(loc.ccaa?.nombre || '').startsWith(q),
    );
    const includes = localidades.filter(
      loc =>
        !startsWith.includes(loc) &&
        (norm(loc.nombre).includes(q) ||
          norm(loc.provincia?.nombre || '').includes(q) ||
          norm(loc.ccaa?.nombre || '').includes(q)),
    );
    setSuggestions([...startsWith, ...includes].slice(0, 25));
  }, [query, localidades]);

  useEffect(() => {
    setPhotoURLs([]);
    if (photos.length > 0) {
      photos.forEach((file, i) => {
        const reader = new window.FileReader();
        reader.onload = e => {
          setPhotoURLs(urls => {
            const updated = [...urls];
            updated[i] = (e.target?.result as string) || '';
            return updated;
          });
        };
        reader.readAsDataURL(file);
      });
    }
  }, [photos]);

  useEffect(() => {
    setVideoURL('');
    if (video) {
      const reader = new window.FileReader();
      reader.onload = e => setVideoURL((e.target?.result as string) || '');
      reader.readAsDataURL(video);
    }
  }, [video]);

  const handleInput = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  };

  // AUTOCOMPLETE handlers
  const handleLocalidadInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setShowDropdown(true);
    setForm(f => ({ ...f, pueblo: val, provincia: '', comunidad: '' }));
  };

  const applyLocalidad = (loc: Localidad) => {
    setForm(f => ({
      ...f,
      pueblo: loc.nombre,
      provincia: loc.provincia?.nombre || '',
      comunidad: loc.ccaa?.nombre || '',
    }));
    setQuery(
      `${loc.nombre}, ${loc.provincia?.nombre || ''}, ${
        loc.ccaa?.nombre || ''
      }`,
    );
    setShowDropdown(false);
  };

  const handleSuggestionClick = (loc: Localidad) => applyLocalidad(loc);
  const handleBlur = () => setTimeout(() => setShowDropdown(false), 120);

  // FOTOS
  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const filesArr = Array.from(e.target.files);
    if (photos.length + filesArr.length > MAX_FOTOS) {
      setFormMsg({
        msg: `Máximo ${MAX_FOTOS} fotos permitidas.`,
        type: 'error',
      });
      return;
    }
    const compressedArr: File[] = [];
    for (const file of filesArr) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const compressed = await imageCompression(file, {
          maxWidthOrHeight: MAX_IMG_DIM,
          maxSizeMB: MAX_IMG_SIZE_MB,
          useWebWorker: true,
          initialQuality: 0.7,
        });
        compressedArr.push(compressed);
      } catch {
        setFormMsg({ msg: 'Error al procesar imagen.', type: 'error' });
      }
    }
    setPhotos(arr => [...arr, ...compressedArr]);
  };

  const openPhotoDialog = () => {
    if (photoInputRef.current) {
      photoInputRef.current.value = '';
      photoInputRef.current.click();
    }
  };
  const removePhoto = (idx: number) =>
    setPhotos(arr => arr.filter((_, i) => i !== idx));

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, idx: number) => {
    e.dataTransfer.setData('photoIndex', String(idx));
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>, idx: number) => {
    const from = Number(e.dataTransfer.getData('photoIndex'));
    if (from === idx) return;
    const newPhotos = [...photos];
    const moved = newPhotos.splice(from, 1)[0];
    newPhotos.splice(idx, 0, moved);
    setPhotos(newPhotos);
  };

  // VIDEO
  const handleVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > MAX_VIDEO_SIZE) {
        setFormMsg({
          msg: 'El video no puede superar los 40MB.',
          type: 'error',
        });
        return;
      }
      const videoElem = document.createElement('video');
      videoElem.preload = 'metadata';
      videoElem.onloadedmetadata = () => {
        window.URL.revokeObjectURL(videoElem.src);
        if (videoElem.duration > MAX_VIDEO_DURATION) {
          setFormMsg({
            msg: 'El video no puede durar más de 3 minutos.',
            type: 'error',
          });
          return;
        }
        setVideo(file);
      };
      videoElem.src = URL.createObjectURL(file);
    } else setVideo(null);
  };
  const removeVideo = () => setVideo(null);

  const handleVideoDialog = () => {
    if (videoInputRef.current) {
      videoInputRef.current.value = '';
      videoInputRef.current.click();
    }
  };

  const ensureLocalidadCompleta = () => {
    if (form.provincia && form.comunidad) return true;
    const loc = resolveLocalidadFromText(query, localidades);
    if (loc) {
      applyLocalidad(loc);
      return true;
    }
    return false;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setFormMsg({ msg: 'Debes iniciar sesión para publicar.', type: 'error' });
      return;
    }
    if (!ensureLocalidadCompleta()) {
      setFormMsg({
        msg: 'Debes elegir una localidad válida del listado.',
        type: 'error',
      });
      return;
    }

    setLoading(true);
    setFormMsg({ msg: 'Subiendo archivos…', type: 'info' });

    let photoUrls: string[] = [];
    try {
      for (let i = 0; i < photos.length; i++) {
        const file = photos[i];
        const uniqueFileName = `service_images/fotos/${Date.now()}_${Math.floor(
          Math.random() * 1e6,
        )}_${file.name}`;
        const url = await uploadFile(file, uniqueFileName);
        photoUrls.push(url);
      }
    } catch {
      setLoading(false);
      setFormMsg({ msg: 'Error al subir una foto.', type: 'error' });
      return;
    }

    let videoUrl = '';
    if (video) {
      try {
        const uniqueFileName = `service_images/videos/${Date.now()}_${Math.floor(
          Math.random() * 1e6,
        )}_${video.name}`;
        videoUrl = await uploadFile(video, uniqueFileName);
      } catch {
        setLoading(false);
        setFormMsg({ msg: 'Error al subir el video.', type: 'error' });
        return;
      }
    }

    const base =
      (typeof window !== 'undefined' && (window as any).BACKEND_URL) ||
      import.meta.env.PUBLIC_BACKEND_URL ||
      '';
    const payload = {
      ...form,
      imagenes: photoUrls,
      videoUrl,
      usuarioEmail: user.email,
    };

    try {
      setFormMsg({ msg: 'Publicando servicio…', type: 'info' });
      const res = await fetch(`${base}/api/form`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (res.ok) {
        setFormMsg({
          msg: result.mensaje || '¡Servicio publicado con éxito!',
          type: 'success',
        });
        setTimeout(() => {
          window.location.href = '/gracias';
        }, 1200);
      } else {
        setFormMsg({
          msg: result.mensaje || 'Error al publicar.',
          type: 'error',
        });
      }
    } catch (err: any) {
      setFormMsg({ msg: err?.message || 'Error al publicar.', type: 'error' });
    }
    setLoading(false);
  };

  if (user === undefined) return null;

  if (!user) {
    return (
      <div className="bg-yellow-50 p-6 rounded-lg shadow-lg max-w-lg mx-auto mt-10 text-center">
        <p className="text-emerald-700 font-semibold text-lg mb-4">
          Debes iniciar sesión para publicar un servicio.
        </p>
        <button
          type="button"
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-6 rounded-xl shadow-lg transition-all duration-200 mt-1"
          onClick={() =>
            (window as any).showAuthModal && (window as any).showAuthModal()
          }
        >
          Iniciar Sesión
        </button>
      </div>
    );
  }

  return (
    <form
      className="bg-white rounded-3xl shadow-xl px-8 py-10 space-y-6 text-left border-2 border-green-100 max-w-2xl mx-auto"
      onSubmit={handleSubmit}
      id="ofrecer-servicio-form"
      autoComplete="off"
    >
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
            {CATEGORIAS.map(cat => (
              <option key={cat} value={cat}>
                {cat}
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
            Descripción breve
          </label>
          <textarea
            name="descripcion"
            required
            rows={4}
            placeholder="¿Qué hacés? ¿Cómo trabajás?"
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
            WhatsApp (solo si tienes)
          </label>
          <input
            name="whatsapp"
            type="text"
            placeholder="Ej: 34666777888"
            maxLength={18}
            autoComplete="off"
            className="w-full px-4 py-3 rounded-xl border border-green-300 focus:outline-none focus:ring-2 focus:ring-green-600 text-gray-800"
            value={form.whatsapp}
            onChange={handleInput}
          />
          <span className="text-xs text-gray-500">
            Solo número, sin espacios. Ejemplo: 34666777888
          </span>
        </div>

        {/* --- AUTOCOMPLETE DE LOCALIDAD --- */}
        <div className="relative md:col-span-2">
          <label className="block text-green-700 font-semibold mb-2">
            Pueblo o localidad
          </label>
          <input
            ref={inputRef}
            name="pueblo"
            type="text"
            required
            className="w-full px-4 py-3 rounded-xl border border-green-300 focus:outline-none focus:ring-2 focus:ring-green-600 text-gray-800"
            value={query}
            onChange={handleLocalidadInput}
            onFocus={() => setShowDropdown(true)}
            onBlur={handleBlur}
            autoComplete="off"
            placeholder="Ej: Graus, Huesca, Aragón"
          />
          {showDropdown && suggestions.length > 0 && (
            <div className="absolute z-20 bg-white border border-green-200 rounded-lg shadow-xl w-full max-h-64 overflow-auto mt-1">
              {suggestions.map(loc => (
                <div
                  key={String(loc.municipio_id)}
                  className="px-4 py-2 hover:bg-green-50 cursor-pointer flex flex-col"
                  onMouseDown={() => handleSuggestionClick(loc)}
                >
                  <span className="font-semibold text-green-700">
                    {loc.nombre}
                  </span>
                  <span className="text-xs text-gray-500">
                    {loc.provincia?.nombre || ''}
                    {loc.ccaa ? ' · ' + loc.ccaa.nombre : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
          <input type="hidden" name="provincia" value={form.provincia} />
          <input type="hidden" name="comunidad" value={form.comunidad} />
        </div>
      </div>

      {/* Fotos */}
      <div>
        <label className="block text-green-700 font-semibold mb-2">
          Fotos del Servicio{' '}
          <span className="text-gray-500">(máx. {MAX_FOTOS})</span>
        </label>
        <input
          type="file"
          accept="image/*"
          multiple
          ref={photoInputRef}
          style={{ display: 'none' }}
          onChange={handlePhoto}
        />
        <button
          type="button"
          className="bg-emerald-500 text-white font-semibold py-2 px-4 rounded-xl mb-2 hover:bg-emerald-700 transition"
          onClick={openPhotoDialog}
          disabled={photos.length >= MAX_FOTOS}
        >
          {photos.length === 0 ? 'Agregar Fotos' : 'Agregar más Fotos'}
        </button>
        <span className="ml-2 text-sm text-gray-500">
          ({photos.length} / {MAX_FOTOS} seleccionadas)
        </span>

        {photos.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-3">
            {photos.map((file, i) => (
              <div
                key={i}
                className="relative group border-2 border-green-100 rounded-xl overflow-hidden shadow-md"
                draggable
                onDragStart={e => handleDragStart(e, i)}
                onDrop={e => handleDrop(e, i)}
                onDragOver={e => e.preventDefault()}
              >
                <img
                  src={photoURLs[i]}
                  alt={`preview-${i}`}
                  className="h-28 w-28 object-cover rounded-lg"
                />
                <button
                  type="button"
                  className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-90 group-hover:opacity-100 transition"
                  onClick={() => removePhoto(i)}
                  aria-label="Quitar foto"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Video */}
      <div>
        <label className="block text-green-700 font-semibold mb-2">
          Video del Servicio{' '}
          <span className="text-gray-500">(opcional, máx. 3 min y 40MB)</span>
        </label>
        <input
          type="file"
          accept="video/mp4,video/webm"
          ref={videoInputRef}
          style={{ display: 'none' }}
          onChange={handleVideo}
        />
        <button
          type="button"
          className="bg-emerald-500 text-white font-semibold py-2 px-4 rounded-xl mb-2 hover:bg-emerald-700 transition"
          onClick={handleVideoDialog}
          disabled={!!video}
        >
          {video ? 'Cambiar video' : 'Agregar video'}
        </button>
        <span className="ml-2 text-xs text-gray-500">(Video)</span>

        {video && (
          <div className="mt-2 flex items-center space-x-3">
            <video
              src={videoURL}
              controls
              className="max-h-40 rounded shadow"
              style={{ maxWidth: 200 }}
            />
            <div>
              <span className="text-gray-700 block">{video.name}</span>
              <button
                type="button"
                className="text-red-600 hover:text-red-800 text-xs ml-2"
                onClick={removeVideo}
              >
                Eliminar
              </button>
            </div>
          </div>
        )}
      </div>

      {formMsg && (
        <div
          className={`mt-2 text-center text-sm rounded p-2 ${
            formMsg.type === 'success'
              ? 'bg-green-100 text-green-700'
              : formMsg.type === 'error'
              ? 'bg-red-100 text-red-700'
              : 'bg-blue-100 text-blue-700'
          }`}
        >
          {formMsg.msg}
        </div>
      )}

      <button
        type="submit"
        className={`w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-4 px-6 rounded-2xl text-lg transition duration-300 shadow-lg ${
          loading ? 'opacity-50 cursor-not-allowed' : ''
        }`}
        disabled={loading}
      >
        {loading ? 'Publicando…' : '✅ Publicar Servicio'}
      </button>
    </form>
  );
};

export default OfrecerServicioIsland;
