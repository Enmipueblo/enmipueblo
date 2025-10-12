import React, { useState, useEffect, useRef } from 'react';
import ServicioCard from './ServicioCard.tsx';
import { getServicios, getFavoritos } from '../lib/api-utils.js';
import { onUserStateChange } from '../lib/firebase.js';

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

const PAGE_SIZE = 12;
const DEBOUNCE_DELAY = 400;

const SearchServiciosIsland = () => {
  const [servicios, setServicios] = useState([]);
  const [favoritos, setFavoritos] = useState([]);
  const [query, setQuery] = useState('');
  const [categoria, setCategoria] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [usuarioEmail, setUsuarioEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [userLoaded, setUserLoaded] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Autocomplete localidades
  const [localidades, setLocalidades] = useState([]);
  const [localidadQuery, setLocalidadQuery] = useState('');
  const [localidadSuggestions, setLocalidadSuggestions] = useState([]);
  const [selectedLocalidad, setSelectedLocalidad] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    const unsub = onUserStateChange(user => {
      setUsuarioEmail(user?.email ?? null);
      setUserLoaded(true);
    });
    fetchServicios();
    return () => {
      if (unsub) unsub();
    };
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    fetch(`${import.meta.env.PUBLIC_BACKEND_URL || ''}/api/localidades`)
      .then(res => res.json())
      .then(data => setLocalidades(data))
      .catch(() => setLocalidades([]));
  }, []);

  // Autocompletado igual que en crear anuncio: busca por municipio, provincia, o comunidad (acento-insensitive, desde 2 letras)
  useEffect(() => {
    if (!localidadQuery || localidadQuery.length < 2) {
      setLocalidadSuggestions([]);
      return;
    }
    const q = localidadQuery
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    let startsWith = localidades.filter(
      loc =>
        loc.nombre
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .startsWith(q) ||
        loc.provincia?.nombre
          ?.toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .startsWith(q) ||
        loc.ccaa?.nombre
          ?.toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .startsWith(q),
    );
    let includes = localidades.filter(
      loc =>
        !startsWith.includes(loc) &&
        (loc.nombre
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .includes(q) ||
          loc.provincia?.nombre
            ?.toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .includes(q) ||
          loc.ccaa?.nombre
            ?.toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .includes(q)),
    );
    setLocalidadSuggestions([...startsWith, ...includes].slice(0, 25));
  }, [localidadQuery, localidades]);

  // Cualquier campo activa búsqueda (combinada)
  useEffect(() => {
    if (!userLoaded) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchServicios();
    }, DEBOUNCE_DELAY);
    // eslint-disable-next-line
  }, [query, categoria, page, selectedLocalidad, localidadQuery]);

  const fetchServicios = async () => {
    setLoading(true);

    // Mandar cada campo correctamente como parámetro
    let localidadParam = '';
    if (selectedLocalidad) {
      localidadParam = selectedLocalidad.nombre;
    } else if (localidadQuery.length > 1) {
      localidadParam = localidadQuery;
    }

    const res = await getServicios(
      query,
      localidadParam,
      categoria,
      page,
      PAGE_SIZE,
    );

    setServicios(res.data);
    setPage(res.page);
    setTotalPages(res.totalPages);
    setLoading(false);
  };

  const handleQueryChange = e => {
    setQuery(e.target.value);
    setPage(1);
  };

  const handleCategoriaChange = e => {
    setCategoria(e.target.value);
    setPage(1);
  };

  const handleLocalidadInput = e => {
    setLocalidadQuery(e.target.value);
    setSelectedLocalidad(null);
    setPage(1);
    setShowDropdown(true);
  };

  const handleSuggestionClick = loc => {
    setSelectedLocalidad(loc);
    setLocalidadQuery(
      `${loc.nombre}, ${loc.provincia?.nombre || ''}, ${
        loc.ccaa?.nombre || ''
      }`,
    );
    setShowDropdown(false);
    setPage(1);
  };

  const handleBlur = () => setTimeout(() => setShowDropdown(false), 120);

  const handlePage = p => setPage(p);

  const handleSubmit = e => e.preventDefault();

  const handleFavoritoChange = async () => {
    if (usuarioEmail) {
      const nuevos = await getFavoritos(usuarioEmail);
      setFavoritos(nuevos);
    }
  };

  if (!userLoaded) {
    return (
      <div className="text-center py-10 text-gray-500">Cargando usuario...</div>
    );
  }

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="max-w-4xl mx-auto mb-8 grid grid-cols-1 md:grid-cols-5 gap-4"
        autoComplete="off"
      >
        {/* Campo de búsqueda principal */}
        <input
          type="text"
          placeholder="Busca por oficio, nombre, etc…"
          className="col-span-2 shadow appearance-none border rounded-lg w-full py-3 px-4 text-gray-700"
          value={query}
          onChange={handleQueryChange}
        />

        {/* AUTOCOMPLETE LOCALIDAD */}
        <div className="col-span-2 relative">
          <input
            ref={inputRef}
            type="text"
            placeholder="Busca pueblo/localidad..."
            className="shadow appearance-none border rounded-lg w-full py-3 px-4 text-gray-700"
            value={localidadQuery}
            onChange={handleLocalidadInput}
            onFocus={() => setShowDropdown(true)}
            onBlur={handleBlur}
            autoComplete="off"
          />
          {showDropdown && localidadSuggestions.length > 0 && (
            <div className="absolute z-20 bg-white border border-green-200 rounded-lg shadow-xl w-full max-h-64 overflow-auto mt-1">
              {localidadSuggestions.map(loc => (
                <div
                  key={loc.municipio_id}
                  className="px-4 py-2 hover:bg-green-50 cursor-pointer flex flex-col"
                  onMouseDown={() => handleSuggestionClick(loc)}
                >
                  <span className="font-semibold text-green-700">
                    {loc.nombre}
                  </span>
                  <span className="text-xs text-gray-500">
                    {loc.provincia?.nombre || ''}{' '}
                    {loc.ccaa ? '· ' + loc.ccaa.nombre : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CATEGORÍA */}
        <select
          className="col-span-1 border rounded-lg p-3 text-gray-700"
          value={categoria}
          onChange={handleCategoriaChange}
        >
          <option value="">Categoría</option>
          {CATEGORIAS.map(c => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-6 rounded-lg transition duration-300"
        >
          Buscar
        </button>
      </form>
      {loading ? (
        <div className="text-center py-10 text-gray-500">Cargando...</div>
      ) : servicios.length === 0 ? (
        <div className="text-center py-10 text-gray-500">
          ¡Lo sentimos! No se encontraron servicios.
        </div>
      ) : (
        <div
          className="
            grid
            grid-cols-1
            sm:grid-cols-2
            md:grid-cols-3
            lg:grid-cols-4
            xl:grid-cols-4
            gap-x-4
            gap-y-6
            place-items-center
          "
        >
          {servicios.map(servicio => (
            <ServicioCard
              key={servicio._id}
              servicio={servicio}
              usuarioEmail={usuarioEmail}
              showFavorito={true}
              favoritos={favoritos}
              onFavoritoChange={handleFavoritoChange}
            />
          ))}
        </div>
      )}
      <div className="mt-6 flex justify-center space-x-2">
        <button
          disabled={page <= 1}
          onClick={() => handlePage(page - 1)}
          className="px-4 py-2 rounded bg-emerald-600 text-white disabled:bg-gray-300"
        >
          Anterior
        </button>
        <span className="px-4 py-2">
          Página {page} de {totalPages}
        </span>
        <button
          disabled={page >= totalPages}
          onClick={() => handlePage(page + 1)}
          className="px-4 py-2 rounded bg-emerald-600 text-white disabled:bg-gray-300"
        >
          Siguiente
        </button>
      </div>
    </>
  );
};

export default SearchServiciosIsland;
