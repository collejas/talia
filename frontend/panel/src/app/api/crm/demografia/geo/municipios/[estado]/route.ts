"use server";

import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

type Params = {
  params: Promise<{
    estado: string;
  }>;
};

const CWD = process.cwd();
const CANDIDATE_GEO_BASE_DIRS = [
  process.env.TALIA_GEO_BASE_DIR,
  path.join(CWD, "..", "..", "backend/app/data/geo"),
  path.join(CWD, "..", "..", "..", "backend/app/data/geo"),
  path.join(CWD, "..", "..", "..", "..", "backend/app/data/geo"),
  "/var/www/talia/backend/app/data/geo",
].filter((value): value is string => Boolean(value && value.trim()));

function normalizeStateCode(value: string): string | null {
  const digits = value.replace(/[^\d]+/g, "");
  if (!digits) return null;
  return digits.padStart(2, "0");
}

export async function GET(_request: Request, { params }: Params) {
  const { estado } = await params;
  if (!estado) {
    return NextResponse.json({ error: "estado_invalid" }, { status: 400 });
  }
  const estadoCode = normalizeStateCode(estado);
  if (!estadoCode) {
    return NextResponse.json({ error: "estado_invalid" }, { status: 400 });
  }

  try {
    let geoBase: string | null = null;
    let manifest: Record<string, { path: string }> | null = null;
    for (const candidate of CANDIDATE_GEO_BASE_DIRS) {
      const manifestFile = path.join(candidate, "municipios", "manifest.json");
      try {
        const manifestText = await fs.readFile(manifestFile, "utf-8");
        manifest = JSON.parse(manifestText) as Record<string, { path: string }>;
        geoBase = candidate;
        break;
      } catch {
        // keep trying other paths
      }
    }
    if (!geoBase || !manifest) {
      return NextResponse.json(
        { error: "geojson_missing", message: "No fue posible cargar el catálogo de municipios." },
        { status: 500 },
      );
    }
    const entry = manifest[estadoCode];
    if (!entry || !entry.path) {
      return NextResponse.json({ error: "estado_not_found" }, { status: 404 });
    }
    const municipalitiesFile = path.join(geoBase, "municipios", entry.path);
    const geoText = await fs.readFile(municipalitiesFile, "utf-8");
    const geojson = JSON.parse(geoText);
    return NextResponse.json({ geojson });
  } catch (error) {
    console.error("Failed to load municipalities geojson", error);
    return NextResponse.json(
      { error: "geojson_missing", message: "No fue posible cargar los municipios." },
      { status: 500 },
    );
  }
}
