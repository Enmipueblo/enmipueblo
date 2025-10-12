// public/scripts/anuncios-client.js

import { onUserStateChange } from '/src/lib/firebase.js';
import { getUserServicios } from '/src/lib/api-utils.js';

async function loadAnuncios(page = 1, limit = 9) {
  const listEl = document.getElementById('user-service-list');
  const pagEl = document.getElementById('user-pagination');

  // Leemos la cookie userEmail
  const cookie = document.cookie
    .split('; ')
    .find(row => row.startsWith('userEmail='));
  const email = cookie ? decodeURIComponent(cookie.split('=')[1]) : '';

  // Si no hay email, redirigimos al inicio
  if (!email) {
    window.location.href = '/';
    return;
  }

  // Petición paginada (tú ajusta getUserServicios para aceptar page/limit)
  const { data: servicios, totalPages } = await getUserServicios(
    email,
    page,
    limit,
  );

  // Render cards
  listEl.innerHTML = '';
  if (servicios.length === 0) {
    listEl.innerHTML =
      '<p class="text-gray-600">No tienes anuncios publicados todavía.</p>';
  } else {
    servicios.forEach(s => {
      const thumb = s.imagenes?.[0] || '';
      const wrapper = document.createElement('div');
      wrapper.className = 'bg-white rounded-lg shadow-md overflow-hidden';
      wrapper.innerHTML = `
        <a href="/servicio/${s._id}">
          ${
            thumb
              ? `<img src="${thumb}" class="w-full h-48 object-cover" loading="lazy"/>`
              : `<div class="w-full h-48 bg-gray-200 flex items-center justify-center text-gray-500">No hay imagen</div>`
          }
          <div class="p-4">
            <h3 class="text-xl font-bold text-emerald-700 mb-2">${s.oficio}</h3>
            <p class="text-gray-600 mb-1"><strong>Nombre:</strong> ${
              s.nombre
            }</p>
            <p class="text-gray-600 mb-1"><strong>Pueblo:</strong> ${
              s.pueblo
            }</p>
            <p class="text-gray-600 mb-1"><strong>Categoría:</strong> ${
              s.categoria
            }</p>
          </div>
        </a>
      `;
      listEl.appendChild(wrapper);
    });
  }

  // Render paginación
  pagEl.innerHTML = '';
  const prev = document.createElement('button');
  prev.textContent = '« Anterior';
  prev.disabled = page <= 1;
  prev.className = prev.disabled
    ? 'px-4 py-2 bg-gray-300 text-gray-600 rounded'
    : 'px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700';
  prev.onclick = () => loadAnuncios(page - 1, limit);
  pagEl.appendChild(prev);

  const info = document.createElement('span');
  info.textContent = `Página ${page} de ${totalPages}`;
  info.className = 'px-4 py-2 text-gray-700';
  pagEl.appendChild(info);

  const next = document.createElement('button');
  next.textContent = 'Siguiente »';
  next.disabled = page >= totalPages;
  next.className = next.disabled
    ? 'px-4 py-2 bg-gray-300 text-gray-600 rounded'
    : 'px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700';
  next.onclick = () => loadAnuncios(page + 1, limit);
  pagEl.appendChild(next);
}

document.addEventListener('DOMContentLoaded', () => {
  // Si el usuario cierra sesión, redirigimos al home
  onUserStateChange(user => {
    if (!user) window.location.href = '/';
  });

  // Cargamos la lista
  loadAnuncios();
});
