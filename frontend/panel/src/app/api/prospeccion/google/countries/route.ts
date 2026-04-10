import { NextResponse } from "next/server";
import { callCrmApi } from "@/lib/api/crm";

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

export async function GET() {
  const trendsResponse = await callCrmApi<{ ok: boolean; items: CountryItem[] }>(
    "/crm/prospeccion/google/countries",
    { withUserToken: true },
  );
  if (trendsResponse.ok) {
    return NextResponse.json(trendsResponse.data);
  }

  const geoResponse = await callCrmApi<{ ok: boolean; geojson: unknown }>(
    "/crm/demografia/geo/paises",
    { withUserToken: true },
  );
  if (geoResponse.ok) {
    const items = parseCountriesFromGeojson(geoResponse.data?.geojson);
    return NextResponse.json({ ok: true, items });
  }

  return NextResponse.json(
    {
      error: trendsResponse.error || geoResponse.error || "google_countries_unavailable",
    },
    { status: trendsResponse.status || geoResponse.status || 502 },
  );
}
