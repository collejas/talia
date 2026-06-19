#!/usr/bin/env node

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const baseUrl = "https://talia.mx";
const today = new Date().toISOString().slice(0, 10);

const urls = [
  { loc: "/", priority: "1.0" },
  { loc: "/caracteristicas", priority: "0.95" },
  { loc: "/precios", priority: "0.9" },
  { loc: "/automatizar-ventas-whatsapp", priority: "0.9" },
  { loc: "/ia-para-inmobiliarias", priority: "0.9" },
  { loc: "/ia-para-whatsapp", priority: "0.9" },
  { loc: "/whatsapp-ia", priority: "0.9" },
  { loc: "/automatizacion-whatsapp", priority: "0.9" },
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
