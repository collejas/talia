import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

import { getPanelApiBaseUrl } from "@/lib/api/panel";
import { resolveServerAccessToken } from "@/lib/auth/server-session";

type CountryItem = { code: string; name: string };

function parseCountriesFromGeojson(raw: unknown): CountryItem[] {
  const features = typeof raw === "object" && raw && Array.isArray((raw as { features?: unknown[] }).features)
    ? (raw as { features: unknown[] }).features
    : [];
  const byCode = new Map<string, string>();
  for (const feature of features) {
    if (typeof feature !== "object" || !feature) continue;
    const props = (feature as { properties?: Record<string, unknown> }).properties;
    if (!props || typeof props !== "object") continue;
    const code = String(props.ISO_A2 ?? "").trim().toUpperCase();
    if (code.length !== 2 || code === "-99") continue;
    const name = String(props.NAME_ES ?? props.NAME ?? props.NAME_EN ?? code).trim();
    if (!name) continue;
    if (!byCode.has(code)) byCode.set(code, name);
  }
  const items = Array.from(byCode.entries())
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
  const mx = items.find((item) => item.code === "MX");
  return mx ? [mx, ...items.filter((item) => item.code !== "MX")] : items;
}

async function loadLocalCountriesFallback(): Promise<CountryItem[]> {
  const filePath = path.join(process.cwd(), "..", "..", "backend", "app", "data", "geo", "world.geojson");
  const text = await fs.readFile(filePath, "utf-8");
  const parsed = JSON.parse(text) as unknown;
  return parseCountriesFromGeojson(parsed);
}

export async function GET() {
  const token = await resolveServerAccessToken({ minTtlSeconds: 300 });
  if (!token) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }

  let targetUrl: string;
  try {
    targetUrl = `${getPanelApiBaseUrl()}/crm/prospeccion/google/countries`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "backend_not_configured";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let backendResponse: Response;
  try {
    backendResponse = await fetch(targetUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
  } catch (error) {
    try {
      const items = await loadLocalCountriesFallback();
      return NextResponse.json({ ok: true, items });
    } catch {
      const message = error instanceof Error ? error.message : "backend_unreachable";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  if (!backendResponse.ok) {
    try {
      const items = await loadLocalCountriesFallback();
      return NextResponse.json({ ok: true, items });
    } catch {
      const text = await backendResponse.text();
      const contentType = backendResponse.headers.get("content-type") ?? "application/json";
      return new NextResponse(text || null, {
        status: backendResponse.status,
        headers: { "content-type": contentType },
      });
    }
  }

  const text = await backendResponse.text();
  const contentType = backendResponse.headers.get("content-type") ?? "application/json";
  return new NextResponse(text || null, {
    status: backendResponse.status,
    headers: { "content-type": contentType },
  });
}
