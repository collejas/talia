"use server";

import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

const STATES_FILE = path.join(process.cwd(), "..", "..", "backend/app/data/geo/mexico_states_mini.geojson");

export async function GET() {
  try {
    const text = await fs.readFile(STATES_FILE, "utf-8");
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
