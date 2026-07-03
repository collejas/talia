"use server";

import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ oportunidadId: string }> },
) {
  const { oportunidadId } = await params;
  if (!oportunidadId) {
    return NextResponse.json({ error: "Falta oportunidadId." }, { status: 400 });
  }

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status")?.toLowerCase() ?? null;

  const response = await callCrmApi<{ quotes: unknown[] }>(`/crm/oportunidades/${oportunidadId}/quotes`, {
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "No se pudieron cargar las cotizaciones." },
      { status: response.status ?? 500 },
    );
  }

  const quotes = Array.isArray(response.data?.quotes) ? response.data.quotes : [];
  if (!statusFilter) {
    return NextResponse.json({ quotes });
  }

  const filtered = quotes.filter(
    (quote) =>
      typeof (quote as { estado?: unknown }).estado === "string" &&
      ((quote as { estado: string }).estado || "").toLowerCase() === statusFilter,
  );
  return NextResponse.json({ quotes: filtered });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ oportunidadId: string }> },
) {
  const { oportunidadId } = await params;
  if (!oportunidadId) {
    return NextResponse.json({ error: "Falta oportunidadId." }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const response = await callCrmApi(`/crm/oportunidades/${oportunidadId}/quotes`, {
    method: "POST",
    body: payload as BodyInit,
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "No se pudo crear la cotización." },
      { status: response.status ?? 500 },
    );
  }

  return NextResponse.json(response.data ?? { ok: true });
}
