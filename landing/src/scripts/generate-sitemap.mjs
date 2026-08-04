#!/usr/bin/env node

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const baseUrl = "https://talia.mx";
const today = new Date().toISOString().slice(0, 10);

const urls = [
  { loc: "/", priority: "1.0" },
  { loc: "/que-es-talia", priority: "0.95" },
  { loc: "/crm-con-ia-para-whatsapp", priority: "0.98" },
  { loc: "/asistente-ia-empresas", priority: "0.9" },
  { loc: "/ia-de-whatsapp", priority: "0.98" },
  { loc: "/ia-para-ventas", priority: "0.95" },
  { loc: "/automatizacion-de-ventas", priority: "0.93" },
  { loc: "/seguimiento-ventas", priority: "0.93" },
  { loc: "/agenda-y-cotizaciones", priority: "0.92" },
  { loc: "/prospeccion", priority: "0.97" },
  { loc: "/prospeccion/google", priority: "0.96" },
  { loc: "/prospeccion/gob-mx", priority: "0.95" },
  { loc: "/prospeccion/buscar-contactos", priority: "0.95" },
  { loc: "/prospeccion/webscraper", priority: "0.95" },
  { loc: "/prospeccion-comercial", priority: "0.96" },
  { loc: "/campanas-marketing", priority: "0.9" },
  { loc: "/video-demostracion-inmobiliarias", priority: "0.88" },
  { loc: "/industrias/inmobiliarias", priority: "0.94" },
  { loc: "/industrias/servicios", priority: "0.9" },
  { loc: "/industrias/negocios-locales", priority: "0.9" },
  { loc: "/industrias/ventas-b2b", priority: "0.9" },
  { loc: "/industrias/turismo", priority: "0.9" },
  { loc: "/caracteristicas", priority: "0.95" },
  { loc: "/precios", priority: "0.9" },
];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">

${urls
  .map(
    ({ loc, priority }) => `  <url>
    <loc>${baseUrl}${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
  </url>`
  )
  .join("\n\n")}

</urlset>
`;

const outputPath = resolve(process.cwd(), "sitemap.xml");
writeFileSync(outputPath, sitemap, "utf8");
console.log(`Wrote ${outputPath} with lastmod ${today}`);
