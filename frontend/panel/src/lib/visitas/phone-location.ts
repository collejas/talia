import fs from "node:fs";
import path from "node:path";

type LadaStateEntry = {
  cve_ent: string;
  nom_ent: string;
};

type LadaCatalog = Record<string, LadaStateEntry[]>;

type LadaLocalityEntry = {
  lada: string | number;
  localidad?: string;
  cve_ent?: string | number;
};

type LadaLocalities = Record<string, LadaLocalityEntry[]>;

type PhoneLocationResult = {
  countryCode: string | null;
  countryName: string | null;
  lada: string | null;
  stateCode: string | null;
  stateName: string | null;
  municipalityName: string | null;
};

let cachedLadaCatalog: LadaCatalog | null = null;
let cachedLocalities: LadaLocalities | null = null;
let cachedDataRoot: string | null = null;

function resolveDataRoot(): string {
  if (cachedDataRoot) return cachedDataRoot;
  const candidates: string[] = [];
  const envRoot = process.env.TALIA_ROOT;
  if (envRoot) {
    candidates.push(path.join(envRoot, "backend", "app", "data"));
  }
  const cwd = process.cwd();
  candidates.push(path.join(cwd, "..", "..", "backend", "app", "data"));
  candidates.push(path.join(cwd, "..", "backend", "app", "data"));
  candidates.push(path.join(cwd, "..", "..", "..", "backend", "app", "data"));
  candidates.push("/var/www/talia/backend/app/data");
  const selected = candidates.find((candidate) => fs.existsSync(candidate));
  cachedDataRoot = selected ?? candidates[0];
  return cachedDataRoot;
}

function dataPath(...segments: string[]): string {
  return path.join(resolveDataRoot(), ...segments);
}

function loadLadaCatalog(): LadaCatalog {
  if (!cachedLadaCatalog) {
    const raw = fs.readFileSync(dataPath("ladas", "ladas_by_lada.json"), "utf8");
    cachedLadaCatalog = JSON.parse(raw) as LadaCatalog;
  }
  return cachedLadaCatalog!;
}

function loadLocalities(): LadaLocalities {
  if (!cachedLocalities) {
    const raw = fs.readFileSync(dataPath("ladas", "ladas_clean.json"), "utf8");
    const parsed = JSON.parse(raw) as LadaLocalityEntry[];
    const mapping: LadaLocalities = {};
    parsed.forEach((entry) => {
      const lada = entry.lada?.toString().trim();
      if (!lada) return;
      mapping[lada] = mapping[lada] || [];
      mapping[lada].push(entry);
    });
    cachedLocalities = mapping;
  }
  return cachedLocalities!;
}

function digitsOnly(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/\D+/g, "");
}

function normalizeMexicanLada(phone: string | null | undefined): string | null {
  const digits = digitsOnly(phone);
  if (!digits.startsWith("52")) return null;
  let national = digits.slice(2);
  if (national.startsWith("1") && national.length >= 11) {
    national = national.slice(1);
  }
  if (!national.length) return null;
  const catalog = loadLadaCatalog();
  for (const length of [3, 2]) {
    const candidate = national.slice(0, length);
    if (catalog[candidate]) {
      return candidate;
    }
  }
  return null;
}

export function inferPhoneLocation(phone: string | null | undefined): PhoneLocationResult {
  const digits = digitsOnly(phone);
  if (!digits) {
    return {
      countryCode: null,
      countryName: null,
      lada: null,
      stateCode: null,
      stateName: null,
      municipalityName: null,
    };
  }

  if (digits.startsWith("52")) {
    const lada = normalizeMexicanLada(phone);
    const catalog = loadLadaCatalog();
    const localities = loadLocalities();
    let stateCode: string | null = null;
    let stateName: string | null = null;
    if (lada && catalog[lada]) {
      const entries = catalog[lada];
      if (entries.length === 1) {
        stateCode = entries[0].cve_ent?.toString().padStart(2, "0") ?? null;
        stateName = entries[0].nom_ent ?? null;
      }
    }
    if (!stateCode && lada && localities[lada]) {
      const entries = localities[lada];
      const states = new Set(
        entries.map((item) => item.cve_ent?.toString().padStart(2, "0")).filter(Boolean) as string[],
      );
      if (states.size === 1) {
        stateCode = [...states][0];
        const catalogEntry = catalog[lada]?.find(
          (entry) => entry.cve_ent?.toString().padStart(2, "0") === stateCode,
        );
        stateName = catalogEntry?.nom_ent ?? stateName;
      }
    }

    let municipalityName: string | null = null;
    if (lada && localities[lada]) {
      const names = new Set(
        localities[lada]
          .map((item) => (item.localidad ? String(item.localidad).trim() : ""))
          .filter(Boolean),
      );
      if (names.size === 1) {
        municipalityName = [...names][0];
      }
    }

    return {
      countryCode: "MX",
      countryName: "México",
      lada: lada,
      stateCode,
      stateName,
      municipalityName,
    };
  }

  return {
    countryCode: null,
    countryName: null,
    lada: null,
    stateCode: null,
    stateName: null,
    municipalityName: null,
  };
}
