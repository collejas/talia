"use server";

import { NextResponse } from "next/server";

import { callSupabaseRpc } from "@/lib/leads/supabase";

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

  const response = await callSupabaseRpc<LeadHistoryRow[]>("panel_lead_movimientos", {
    body: {
      p_tarjeta_id: tarjetaId,
      p_limit: limit,
      p_offset: offset,
    },
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error ?? "No se pudo cargar el historial." },
      { status: response.status ?? 400 },
    );
  }

  return NextResponse.json({ data: response.data });
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

  const response = await callSupabaseRpc<LeadHistoryRow[]>("panel_lead_add_nota", {
    body: {
      p_tarjeta_id: tarjetaId,
      p_texto: texto,
      p_metadata: metadata,
    },
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error ?? "No se pudo guardar la nota." },
      { status: response.status ?? 400 },
    );
  }

  return NextResponse.json({ data: response.data });
}
