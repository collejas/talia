import { performance } from "node:perf_hooks";

import { NextResponse } from "next/server";

import { decodeJwtOrganizacionId, decodeJwtUserId } from "@/lib/auth/jwt";
import { resolveServerAccessToken } from "@/lib/auth/server-session";
import { loadConversionMapTablesForConversionMap } from "@/lib/visitas/data";

function parseList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function GET(request: Request) {
  const started = performance.now();
  const { searchParams } = new URL(request.url);
  const table = searchParams.get("table")?.trim().toLowerCase();
  const section = table === "visits" || table === "conversations" ? table : "both";
  const filters = {
    canales: parseList(searchParams.get("canales")),
    estado: searchParams.get("estado")?.trim() || null,
    sourceClass: searchParams.get("source_class")?.trim() || null,
    utmSource: searchParams.get("utm_source")?.trim() || null,
    utmMedium: searchParams.get("utm_medium")?.trim() || null,
    utmCampaign: searchParams.get("utm_campaign")?.trim() || null,
    campanaId: searchParams.get("campana_id")?.trim() || null,
    campanaTipo: searchParams.get("campana_tipo")?.trim() || null,
    templateId: searchParams.get("template_id")?.trim() || null,
    waCanalPublicitario: searchParams.get("wa_canal_publicitario")?.trim() || null,
    waCampanaPublicitaria: searchParams.get("wa_campana_publicitaria")?.trim() || null,
    waReglaId: searchParams.get("wa_regla_id")?.trim() || null,
    rango: searchParams.get("rango")?.trim() || null,
    desde: searchParams.get("desde")?.trim() || null,
    hasta: searchParams.get("hasta")?.trim() || null,
  };

  const accessToken = await resolveServerAccessToken({ minTtlSeconds: 0 });
  const cacheScope = [
    decodeJwtOrganizacionId(accessToken) || "unknown-org",
    decodeJwtUserId(accessToken) || "unknown-user",
  ].join(":");

  const response = await loadConversionMapTablesForConversionMap(filters, { cacheScope, section });
  const durationMs = performance.now() - started;
  const payload = {
    ok: true,
    ...response,
  };
  const visitsRows = response.visitsTable?.length ?? 0;
  const conversationsRows = response.conversationsTable?.length ?? 0;
  console.info("crm.mapa_conversion.tables.request", {
    section,
    duration_ms: Math.round(durationMs * 100) / 100,
    visits_rows: visitsRows,
    conversations_rows: conversationsRows,
  });
  return NextResponse.json(payload, {
    headers: {
      "Server-Timing": `total;dur=${Math.round(durationMs * 100) / 100}`,
      "X-Response-Time-Ms": String(Math.round(durationMs * 100) / 100),
    },
  });
}
