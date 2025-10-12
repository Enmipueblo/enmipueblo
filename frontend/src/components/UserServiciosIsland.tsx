import React, { useEffect, useState, useRef } from 'react';
import ServicioCard from './ServicioCard.tsx';
import {
  getUserServicios,
  deleteServicio,
  updateServicio,
} from '../lib/api-utils.js';
import { onUserStateChange, uploadFile } from '../lib/firebase.js';
import imageCompression from 'browser-image-compression';

const PAGE_SIZE = 9;

// Configs iguales a alta de anuncio
const MAX_FOTOS = 6;
const MAX_VIDEO_SIZE = 40 * 1024 * 1024; // 40MB
const MAX_VIDEO_DURATION = 180; // 3 minutos
const MAX_IMG_SIZE_MB = 0.35;
const MAX_IMG_DIM = 1200;

const UserServiciosIsland = () => {
  const [usuarioEmail, setUsuarioEmail] = useState<string | null>(null);
  const [servicios, setServicios] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Edit/Borrar modals
  const [modalBorrar, setModalBorrar] = useState({
    open: false,
    servicioId: null,
  });
  const [modalEditar, setModalEditar] = useState({
    open: false,
    servicio: null,
  });
  const [editForm, setEditForm] = useState({});
  const [editMsg, setEditMsg] = useState<string>('');

  // Fotos y video edición
  const [editExistingPhotos, setEditExistingPhotos] = useState<string[]>([]);
  const [editPhotos, setEditPhotos] = useState<File[]>([]);
  const [editPhotoURLs, setEditPhotoURLs] = useState<string[]>([]);
  const [editExistingVideoUrl, setEditExistingVideoUrl] = useState<string>('');
  const [editVideo, setEditVideo] = useState<File | null>(null);
  const [editVideoURL, setEditVideoURL] = useState<string>('');

  const editPhotoInputRef = useRef<HTMLInputElement>(null);
  const editVideoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribe = onUserStateChange(user => {
      if (!user) {
        window.location.href = '/';
      } else {
        setUsuarioEmail(user.email);
      }
    });
    return () => unsubscribe && unsubscribe();
  }, []);

  const fetchServicios = () => {
    if (!usuarioEmail) {
      setServicios([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    getUserServicios(usuarioEmail, page, PAGE_SIZE)
      .then(result => {
        setServicios(result.data);
        setTotalPages(result.totalPages || 1);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchServicios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioEmail, page]);

  // --- BORRAR ---
  const onBorrar = servicioId => setModalBorrar({ open: true, servicioId });
  const confirmarBorrar = async () => {
    if (!modalBorrar.servicioId) return;
    await deleteServicio(modalBorrar.servicioId);
    setModalBorrar({ open: false, servicioId: null });
    fetchServicios();
  };

  // --- EDITAR ---
  const onEditar = servicio => {
    setEditForm({ ...servicio });
    setEditExistingPhotos(servicio.imagenes || []);
    setEditPhotos([]);
    setEditPhotoURLs([]);
    setEditExistingVideoUrl(servicio.videoUrl || '');
    setEditVideo(null);
    setEditVideoURL('');
    setEditMsg('');
    setModalEditar({ open: true, servicio });
  };
  const handleEditChange = e => {
    const { name, value } = e.target;
    setEditForm(prev => ({ ...prev, [name]: value }));
  };

  // FOTOS EXISTENTES: quitar del array
  const removeExistingPhoto = idx =>
    setEditExistingPhotos(arr => arr.filter((_, i) => i !== idx));

  // FOTOS NUEVAS: compresión igual que alta
  const handleEditPhoto = async e => {
    setEditMsg('');
    if (!e.target.files) return;
    const filesArr = Array.from(e.target.files);

    // Limita máx 6 entre actuales y nuevas
    if (editExistingPhotos.length + filesArr.length > MAX_FOTOS) {
      setEditMsg(`Máximo ${MAX_FOTOS} fotos entre actuales y nuevas.`);
      return;
    }

    // Optimiza y añade
    let compressedArr: File[] = [];
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
      } catch (error) {
        setEditMsg('Error al procesar imagen.');
      }
    }
    setEditPhotos(compressedArr);
  };

  // Previsualización de fotos nuevas
  useEffect(() => {
    setEditPhotoURLs([]);
    if (editPhotos.length > 0) {
      editPhotos.forEach((file, i) => {
        const reader = new FileReader();
        reader.onload = e => {
          setEditPhotoURLs(urls => {
            const updated = [...urls];
            updated[i] = e.target?.result as string;
            return updated;
          });
        };
        reader.readAsDataURL(file);
      });
    }
  }, [editPhotos]);
  const removeEditPhoto = idx =>
    setEditPhotos(arr => arr.filter((_, i) => i !== idx));

  // Drag & drop para reordenar fotos nuevas
  const handleDragStart = (e, idx) => {
    e.dataTransfer.setData('photoIndex', idx);
  };
  const handleDrop = (e, idx) => {
    const from = Number(e.dataTransfer.getData('photoIndex'));
    if (from === idx) return;
    const newPhotos = [...editPhotos];
    const moved = newPhotos.splice(from, 1)[0];
    newPhotos.splice(idx, 0, moved);
    setEditPhotos(newPhotos);
  };

  // VIDEO EXISTENTE: quitar
  const removeExistingVideo = () => setEditExistingVideoUrl('');

  // VIDEO NUEVO: validaciones igual que alta
  const handleEditVideo = e => {
    setEditMsg('');
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > MAX_VIDEO_SIZE) {
        setEditMsg('El video no puede superar los 40MB.');
        return;
      }
      const videoElem = document.createElement('video');
      videoElem.preload = 'metadata';
      videoElem.onloadedmetadata = () => {
        window.URL.revokeObjectURL(videoElem.src);
        if (videoElem.duration > MAX_VIDEO_DURATION) {
          setEditMsg('El video no puede durar más de 3 minutos.');
          return;
        }
        setEditVideo(file);
      };
      videoElem.src = URL.createObjectURL(file);
    } else setEditVideo(null);
  };
  useEffect(() => {
    setEditVideoURL('');
    if (editVideo) {
      const reader = new FileReader();
      reader.onload = e => setEditVideoURL(e.target?.result as string);
      reader.readAsDataURL(editVideo);
    }
  }, [editVideo]);
  const removeEditVideo = () => setEditVideo(null);

  // --- SUBMIT EDICIÓN ---
  const confirmarEditar = async e => {
    e.preventDefault();

    // Fotos: antiguas que quedan + nuevas subidas
    let photoUrls = [...editExistingPhotos];
    if (editPhotos.length > 0) {
      for (let i = 0; i < editPhotos.length; i++) {
        const url = await uploadFile(
          editPhotos[i],
          `service_images/fotos/${Date.now()}_${editPhotos[i].name}`,
        );
        photoUrls.push(url);
      }
    }

    // Si hay más de 6, trunca
    if (photoUrls.length > MAX_FOTOS) photoUrls = photoUrls.slice(0, MAX_FOTOS);

    // Video: nuevo o actual (si no fue eliminado)
    let videoUrl = editVideo
      ? await uploadFile(
          editVideo,
          `service_images/videos/${Date.now()}_${editVideo.name}`,
        )
      : editExistingVideoUrl;

    await updateServicio(modalEditar.servicio._id, {
      ...editForm,
      imagenes: photoUrls,
      videoUrl,
    });

    setModalEditar({ open: false, servicio: null });
    setEditPhotos([]);
    setEditPhotoURLs([]);
    setEditExistingPhotos([]);
    setEditVideo(null);
    setEditVideoURL('');
    setEditExistingVideoUrl('');
    fetchServicios();
  };

  if (usuarioEmail === null) {
    return (
      <div className="text-center py-10">
        <p className="text-emerald-700 text-xl font-semibold mb-4">
          Debes iniciar sesión para ver tus anuncios.
        </p>
        <p>Redirigiendo al inicio...</p>
      </div>
    );
  }

  return (
    <>
      {/* MODAL BORRAR */}
      {modalBorrar.open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 shadow-xl max-w-md w-full">
            <h3 className="text-xl mb-4 font-semibold">¿Eliminar anuncio?</h3>
            <p className="mb-6">Esta acción no se puede deshacer.</p>
            <div className="flex justify-end gap-4">
              <button
                onClick={() =>
                  setModalBorrar({ open: false, servicioId: null })
                }
                className="px-4 py-2 rounded bg-gray-300 hover:bg-gray-400 text-gray-700"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarBorrar}
                className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
              >
                Borrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDITAR */}
      {modalEditar.open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <form
            onSubmit={confirmarEditar}
            className="bg-white rounded-lg p-8 shadow-xl max-w-lg w-full space-y-4"
          >
            <h3 className="text-2xl mb-2 font-semibold">Editar anuncio</h3>
            <input
              name="nombre"
              className="w-full border rounded px-3 py-2"
              value={editForm.nombre || ''}
              onChange={handleEditChange}
              placeholder="Nombre"
            />
            <input
              name="oficio"
              className="w-full border rounded px-3 py-2"
              value={editForm.oficio || ''}
              onChange={handleEditChange}
              placeholder="Oficio"
            />
            <textarea
              name="descripcion"
              className="w-full border rounded px-3 py-2"
              value={editForm.descripcion || ''}
              onChange={handleEditChange}
              placeholder="Descripción"
            />
            <input
              name="contacto"
              className="w-full border rounded px-3 py-2"
              value={editForm.contacto || ''}
              onChange={handleEditChange}
              placeholder="Contacto"
            />
            <input
              name="pueblo"
              className="w-full border rounded px-3 py-2"
              value={editForm.pueblo || ''}
              onChange={handleEditChange}
              placeholder="Pueblo"
            />
            <input
              name="categoria"
              className="w-full border rounded px-3 py-2"
              value={editForm.categoria || ''}
              onChange={handleEditChange}
              placeholder="Categoría"
            />
            {/* Fotos actuales */}
            <div>
              <label className="block mb-1">Fotos actuales</label>
              {editExistingPhotos.length > 0 ? (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {editExistingPhotos.map((url, i) => (
                    <div className="relative" key={i}>
                      <img
                        src={url}
                        alt={`foto-actual-${i}`}
                        className="h-20 w-20 object-cover rounded"
                      />
                      <button
                        type="button"
                        onClick={() => removeExistingPhoto(i)}
                        className="absolute top-0 right-0 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">
                  No quedan fotos antiguas.
                </p>
              )}
            </div>
            {/* Añadir fotos nuevas */}
            <div>
              <label className="block mb-1">
                Agregar fotos nuevas{' '}
                <span className="text-gray-400">
                  (máx. {MAX_FOTOS} entre todas)
                </span>
              </label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleEditPhoto}
                className="block w-full"
                ref={editPhotoInputRef}
                disabled={editExistingPhotos.length >= MAX_FOTOS}
              />
              {editPhotoURLs.length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {editPhotoURLs.map((url, i) => (
                    <div
                      className="relative group"
                      key={i}
                      draggable
                      onDragStart={e => handleDragStart(e, i)}
                      onDrop={e => handleDrop(e, i)}
                      onDragOver={e => e.preventDefault()}
                    >
                      <img
                        src={url}
                        alt={`preview-${i}`}
                        className="h-20 w-20 object-cover rounded"
                      />
                      <button
                        type="button"
                        onClick={() => removeEditPhoto(i)}
                        className="absolute top-0 right-0 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <span className="text-xs text-gray-500 block">
                {editExistingPhotos.length + editPhotos.length} / {MAX_FOTOS}{' '}
                seleccionadas
              </span>
            </div>
            {/* Video actual */}
            <div>
              <label className="block mb-1">Video actual</label>
              {editExistingVideoUrl && !editVideo ? (
                <div className="mt-2 flex items-center gap-2">
                  <video
                    src={editExistingVideoUrl}
                    controls
                    className="max-h-24 rounded shadow"
                  />
                  <button
                    type="button"
                    className="text-red-600 text-xs ml-2"
                    onClick={removeExistingVideo}
                  >
                    Eliminar video
                  </button>
                </div>
              ) : (
                <p className="text-gray-500 text-sm">Sin video actual.</p>
              )}
            </div>
            {/* Agregar video nuevo */}
            <div>
              <label className="block mb-1">
                Agregar video nuevo{' '}
                <span className="text-gray-400">(máx. 3 min y 40MB)</span>
              </label>
              <input
                type="file"
                accept="video/mp4,video/webm"
                onChange={handleEditVideo}
                className="block w-full"
                ref={editVideoInputRef}
                disabled={!!editVideo}
              />
              {editVideoURL && (
                <div className="mt-2 flex items-center gap-2">
                  <video
                    src={editVideoURL}
                    controls
                    className="max-h-24 rounded shadow"
                  />
                  <button
                    type="button"
                    className="text-red-600 text-xs ml-2"
                    onClick={removeEditVideo}
                  >
                    Quitar nuevo video
                  </button>
                </div>
              )}
            </div>
            {editMsg && (
              <div className="bg-red-100 text-red-700 px-3 py-2 rounded text-sm">
                {editMsg}
              </div>
            )}
            <div className="flex justify-end gap-4 mt-6">
              <button
                type="button"
                onClick={() => setModalEditar({ open: false, servicio: null })}
                className="px-4 py-2 rounded bg-gray-300 hover:bg-gray-400 text-gray-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={editMsg !== ''}
              >
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ANUNCIOS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-3 text-center text-gray-500 py-10">
            Cargando tus anuncios...
          </div>
        ) : servicios.length === 0 ? (
          <div className="col-span-3 text-center text-gray-500 py-10">
            No tienes anuncios publicados.
          </div>
        ) : (
          servicios.map(servicio => (
            <div key={servicio._id} className="relative group">
              <ServicioCard
                servicio={servicio}
                usuarioEmail={usuarioEmail}
                showFavorito={false}
              />
              <div className="absolute top-3 right-3 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition">
                <button
                  onClick={() => onEditar(servicio)}
                  className="bg-yellow-400 text-white rounded px-2 py-1 text-sm shadow hover:bg-yellow-500"
                  title="Editar"
                  type="button"
                >
                  Editar
                </button>
                <button
                  onClick={() => onBorrar(servicio._id)}
                  className="bg-red-600 text-white rounded px-2 py-1 text-sm shadow hover:bg-red-700"
                  title="Eliminar"
                  type="button"
                >
                  Borrar
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="mt-6 flex justify-center space-x-2">
        <button
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
          className="px-4 py-2 rounded bg-emerald-600 text-white disabled:bg-gray-300"
        >
          Anterior
        </button>
        <span className="px-4 py-2">
          Página {page} de {totalPages}
        </span>
        <button
          disabled={page >= totalPages}
          onClick={() => setPage(page + 1)}
          className="px-4 py-2 rounded bg-emerald-600 text-white disabled:bg-gray-300"
        >
          Siguiente
        </button>
      </div>
    </>
  );
};

export default UserServiciosIsland;
