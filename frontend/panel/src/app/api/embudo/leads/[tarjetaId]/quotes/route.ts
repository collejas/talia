"use server";

import { NextResponse } from "next/server";

import { getPanelApiBaseUrl } from "@/lib/api/panel";
import { resolvePanelApiToken } from "@/lib/auth/panel-token";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tarjetaId: string }> },
) {
  const { tarjetaId } = await params;
  if (!tarjetaId) {
    return NextResponse.json({ error: "Falta tarjetaId." }, { status: 400 });
  }

  let token: string;
  try {
    token = await resolvePanelApiToken();
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se encontró token del panel.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const baseUrl = getPanelApiBaseUrl();
  const response = await fetch(`${baseUrl}/leads/${tarjetaId}/quotes`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  const text = await response.text();
  if (!response.ok) {
    const parsed = text ? safeJson(text) : null;
    const error =
      (parsed && typeof parsed.error === "string" && parsed.error) ||
      (parsed && typeof parsed.detail === "string" && parsed.detail) ||
      (text && !text.startsWith("<") ? text : null) ||
      "No se pudieron cargar las cotizaciones.";
    return NextResponse.json({ error }, { status: response.status });
  }

  const payload = text ? safeJson(text) : null;
  return NextResponse.json(payload ?? { quotes: [] });
}

function safeJson(payload: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(payload);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
