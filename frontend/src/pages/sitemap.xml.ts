// src/pages/sitemap.xml.ts
export async function GET() {
  // ✅ Pon aquí tu dominio real
  const SITE = "https://enmipueblo.com";

  // Rutas reales que existen hoy en tu proyecto
  const routes = [
    "/",
    "/buscar",
    "/ofrecer",
    "/contacto",
    "/aviso-legal",
    "/politica-privacidad",
    "/politica-cookies",
    "/gracias",
    "/gracias2",
    "/servicio",          // ojo: los detalles van por query (?id=...), no se pueden listar uno por uno
    "/admin/panel",       // normalmente conviene NO indexarlo (lo bloqueamos en robots.txt)
    "/usuario/panel",
    "/usuario/favoritos",
    "/usuario/anuncios",
    "/editar-servicio",
  ];

  const today = new Date().toISOString();

  const urls = routes
    .map((path) => {
      const loc = `${SITE}${path}`;
      return `
  <url>
    <loc>${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${path === "/" ? "1.0" : "0.6"}</priority>
  </url>`;
    })
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
>
${urls}
</urlset>`;

  return new Response(xml.trim(), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
}
