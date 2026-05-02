import { NextResponse } from "next/server";

import { loadConversionMapTablesForConversionMap } from "@/lib/visitas/data";

function parseList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
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

  const response = await loadConversionMapTablesForConversionMap(filters);
  return NextResponse.json({
    ok: true,
    ...response,
  });
}
