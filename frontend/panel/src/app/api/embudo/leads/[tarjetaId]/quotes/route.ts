"use server";

import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tarjetaId: string }> },
) {
  const { tarjetaId } = await params;
  if (!tarjetaId) {
    return NextResponse.json({ error: "Falta tarjetaId." }, { status: 400 });
  }

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status")?.toLowerCase() ?? null;

  const response = await callCrmApi<{ quotes: unknown[] }>(`/crm/leads/${tarjetaId}/quotes`, {
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
