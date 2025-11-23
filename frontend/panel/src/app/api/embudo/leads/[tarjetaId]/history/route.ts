"use server";

import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

type LeadHistoryRow = {
  movimiento_id: string;
  tarjeta_id: string;
  tipo: string | null;
  cambiado_por: string | null;
  cambiado_nombre: string | null;
  cambiado_en: string;
  fuente: string | null;
  etapa_origen_id: string | null;
  etapa_origen_nombre: string | null;
  etapa_destino_id: string | null;
  etapa_destino_nombre: string | null;
  motivo: string | null;
  nota: string | null;
  metadata: Record<string, unknown> | null;
};

type CrmHistoryItem = {
  id: string;
  oportunidad_id: string;
  tipo: string;
  cambiado_en: string;
  cambiado_por_id: string | null;
  cambiado_por_nombre: string | null;
  fuente: string | null;
  etapa_origen_id: string | null;
  etapa_origen_nombre: string | null;
  etapa_destino_id: string | null;
  etapa_destino_nombre: string | null;
  motivo: string | null;
  nota: string | null;
  metadata: Record<string, unknown> | null;
};

type CrmHistoryResponse = {
  items: CrmHistoryItem[];
  limit: number;
  offset: number;
};

function parseInteger(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tarjetaId: string }> },
) {
  const { tarjetaId } = await params;
  if (!tarjetaId) {
    return NextResponse.json({ error: "Falta tarjetaId." }, { status: 400 });
  }
  const url = new URL(request.url);
  const limit = parseInteger(url.searchParams.get("limit"), 50);
  const offset = parseInteger(url.searchParams.get("offset"), 0);

  const response = await callCrmApi<CrmHistoryResponse>(
    `/crm/pipeline/opportunities/${tarjetaId}/history`,
    {
      searchParams: {
        limit: String(limit),
        offset: String(offset),
      },
    },
  );

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error ?? "No se pudo cargar el historial." },
      { status: response.status ?? 400 },
    );
  }

  const data = Array.isArray(response.data?.items) ? response.data.items : [];
  return NextResponse.json({ data: data.map(mapCrmHistoryToLeadHistory) });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tarjetaId: string }> },
) {
  const { tarjetaId } = await params;
  if (!tarjetaId) {
    return NextResponse.json({ error: "Falta tarjetaId." }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const texto = typeof (payload as { texto?: unknown })?.texto === "string"
    ? ((payload as { texto: string }).texto ?? "")
    : "";
  const metadataCandidate = (payload as { metadata?: unknown })?.metadata;
  const metadata =
    metadataCandidate && typeof metadataCandidate === "object" && !Array.isArray(metadataCandidate)
      ? (metadataCandidate as Record<string, unknown>)
      : {};

  const response = await callCrmApi<CrmHistoryItem>(`/crm/pipeline/opportunities/${tarjetaId}/history`, {
    method: "POST",
    body: {
      texto,
      metadata,
    },
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error ?? "No se pudo guardar la nota." },
      { status: response.status ?? 400 },
    );
  }

  return NextResponse.json({ data: [mapCrmHistoryToLeadHistory(response.data)] });
}

function mapCrmHistoryToLeadHistory(entry: CrmHistoryItem): LeadHistoryRow {
  return {
    movimiento_id: entry.id,
    tarjeta_id: entry.oportunidad_id,
    tipo: entry.tipo ?? "movimiento",
    cambiado_por: entry.cambiado_por_id,
    cambiado_nombre: entry.cambiado_por_nombre,
    cambiado_en: entry.cambiado_en,
    fuente: entry.fuente,
    etapa_origen_id: entry.etapa_origen_id,
    etapa_origen_nombre: entry.etapa_origen_nombre,
    etapa_destino_id: entry.etapa_destino_id,
    etapa_destino_nombre: entry.etapa_destino_nombre,
    motivo: entry.motivo,
    nota: entry.nota,
    metadata: entry.metadata ?? null,
  };
}
