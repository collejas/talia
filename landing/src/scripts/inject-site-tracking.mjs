#!/usr/bin/env node

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const landingRoot = resolve(scriptDir, '..');
const scriptTag = '  <script type="module" src="https://talia.mx/assets/js/site-tracking.js?v=20260815-cors1"\n'
  + '    data-talia-public-site-id="talia_site_058c3bb887b24340b5d06bc5629e0faf"\n'
  + '    data-talia-tracking-endpoint="https://talia.mx/api/crm/web/visit"></script>\n';

function findHtmlFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...findHtmlFiles(path));
    } else if (entry.endsWith('.html')) {
      files.push(path);
    }
  }
  return files;
}

let updated = 0;
for (const filePath of findHtmlFiles(landingRoot)) {
  const source = readFileSync(filePath, 'utf8');
  if (source.includes('/assets/js/site-tracking.js')) continue;
  const closingBody = source.lastIndexOf('</body>');
  if (closingBody < 0) continue;
  const next = `${source.slice(0, closingBody)}${scriptTag}${source.slice(closingBody)}`;
  writeFileSync(filePath, next, 'utf8');
  updated += 1;
}

console.log(`Injected site tracking into ${updated} HTML files.`);
