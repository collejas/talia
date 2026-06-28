#!/usr/bin/env node

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function parseBoolean(value) {
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

const showPublicBilling = parseBoolean(process.env.SHOW_PUBLIC_BILLING);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "..", "..", "..");
const outputPath = resolve(root, "landing/src/assets/js/public-config.js");
const contents = `window.TALIA_PUBLIC_CONFIG = {\n  showPublicBilling: ${showPublicBilling ? "true" : "false"},\n};\n`;

writeFileSync(outputPath, contents, "utf8");
console.log(`Wrote ${outputPath} with showPublicBilling=${showPublicBilling ? "true" : "false"}`);
