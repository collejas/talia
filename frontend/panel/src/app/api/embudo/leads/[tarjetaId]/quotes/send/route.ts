"use server";

import { NextResponse } from "next/server";

import { getPanelApiBaseUrl } from "@/lib/api/panel";
import { resolvePanelApiToken } from "@/lib/auth/panel-token";

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

  let token: string;
  try {
    token = await resolvePanelApiToken();
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se encontró token del panel.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const baseUrl = getPanelApiBaseUrl();
  const response = await fetch(`${baseUrl}/leads/${tarjetaId}/quotes/send`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  if (!response.ok) {
    const parsed = text ? safeJson(text) : null;
    const error =
      (parsed && typeof parsed.detail === "string" && parsed.detail) ||
      (parsed && typeof parsed.error === "string" && parsed.error) ||
      (text && !text.startsWith("<") ? text : null) ||
      "No se pudo enviar la cotización.";
    return NextResponse.json({ error }, { status: response.status });
  }

  const body = text ? safeJson(text) : null;
  return NextResponse.json(body ?? {});
}

function safeJson(payload: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(payload);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
