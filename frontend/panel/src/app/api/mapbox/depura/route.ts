import { NextResponse } from "next/server";
import path from "node:path";
import { promises as fs } from "node:fs";

const LOG_DIR = "/var/www/talia/logs";
const LOG_FILE = path.join(LOG_DIR, "mapbox-debug.log");

async function writeLog(entry: string) {
  await fs.mkdir(LOG_DIR, { recursive: true });
  await fs.appendFile(LOG_FILE, `${entry}\n`);
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const timestamp = new Date().toISOString();
    const headerTag = request.headers.get("x-mapbox-msg") ?? "mapbox-log";
    await writeLog(`${timestamp} | ${headerTag} | ${JSON.stringify(body)}`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error writing mapbox log:", error);
    return NextResponse.json(
      { ok: false, error: "No se pudo escribir el log de Mapbox" },
      { status: 500 },
    );
  }
}
