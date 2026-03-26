"use server";

import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

type Params = {
  params: Promise<{
    estado: string;
  }>;
};

const GEO_BASE = path.join(process.cwd(), "..", "..", "backend/app/data/geo");
const MANIFEST_FILE = path.join(GEO_BASE, "municipios", "manifest.json");

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
    const manifestText = await fs.readFile(MANIFEST_FILE, "utf-8");
    const manifest = JSON.parse(manifestText) as Record<string, { path: string }>;
    const entry = manifest[estadoCode];
    if (!entry || !entry.path) {
      return NextResponse.json({ error: "estado_not_found" }, { status: 404 });
    }
    const municipalitiesFile = path.join(GEO_BASE, "municipios", entry.path);
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
