"use server";

import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

const CWD = process.cwd();
const CANDIDATE_STATES_FILES = [
  process.env.TALIA_GEO_STATES_FILE,
  path.join(CWD, "..", "..", "backend/app/data/geo/mexico_states_mini.geojson"),
  path.join(CWD, "..", "..", "..", "backend/app/data/geo/mexico_states_mini.geojson"),
  path.join(CWD, "..", "..", "..", "..", "backend/app/data/geo/mexico_states_mini.geojson"),
  "/var/www/talia/backend/app/data/geo/mexico_states_mini.geojson",
].filter((value): value is string => Boolean(value && value.trim()));

async function resolveStatesFile(): Promise<string | null> {
  for (const candidate of CANDIDATE_STATES_FILES) {
    try {
      await fs.access(candidate, fs.constants.R_OK);
      return candidate;
    } catch {
      // try next candidate
    }
  }
  return null;
}

export async function GET() {
  try {
    const statesFile = await resolveStatesFile();
    if (!statesFile) {
      throw new Error("states_geojson_not_found");
    }
    const text = await fs.readFile(statesFile, "utf-8");
    const data = JSON.parse(text);
    return NextResponse.json({ geojson: data });
  } catch (error) {
    console.error("Failed to load states geojson", error);
    return NextResponse.json(
      { error: "geojson_missing", message: "No fue posible cargar los estados." },
      { status: 500 },
    );
  }
}
