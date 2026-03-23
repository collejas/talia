import { NextResponse } from "next/server";
import path from "node:path";
import { promises as fs } from "node:fs";

const PRIMARY_LOG_DIR = "/var/www/talia/logs";
const PRIMARY_LOG_FILE = path.join(PRIMARY_LOG_DIR, "mapbox-debug.log");
const FALLBACK_LOG_DIR = "/tmp";
const FALLBACK_LOG_FILE = path.join(FALLBACK_LOG_DIR, "talia-mapbox-debug.log");

function isPermissionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === "EACCES" || code === "EPERM";
}

async function appendLine(logDir: string, logFile: string, entry: string) {
  await fs.mkdir(logDir, { recursive: true });
  await fs.appendFile(logFile, `${entry}\n`);
}

async function writeLog(entry: string) {
  try {
    await appendLine(PRIMARY_LOG_DIR, PRIMARY_LOG_FILE, entry);
    return { file: PRIMARY_LOG_FILE as string };
  } catch (error) {
    if (!isPermissionError(error)) {
      throw error;
    }
    await appendLine(FALLBACK_LOG_DIR, FALLBACK_LOG_FILE, entry);
    return { file: FALLBACK_LOG_FILE as string, fallback: true as const };
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const timestamp = new Date().toISOString();
    const headerTag = request.headers.get("x-mapbox-msg") ?? "mapbox-log";
    const result = await writeLog(`${timestamp} | ${headerTag} | ${JSON.stringify(body)}`);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Error writing mapbox log:", error);
    return NextResponse.json(
      { ok: false, error: "No se pudo escribir el log de Mapbox" },
      { status: 500 },
    );
  }
}
