"use server";

import { NextResponse } from "next/server";

import { getPanelApiBaseUrl } from "@/lib/api/panel";
import { resolvePanelApiToken } from "@/lib/auth/panel-token";

function safeJson(payload: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(payload);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clienteId: string }> },
) {
  const { clienteId } = await params;
  if (!clienteId) {
    return NextResponse.json({ error: "Falta clienteId." }, { status: 400 });
  }

  let token: string;
  try {
    token = await resolvePanelApiToken();
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se encontró token del panel.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  let baseUrl: string;
  try {
    baseUrl = getPanelApiBaseUrl();
  } catch (error) {
    const message = error instanceof Error ? error.message : "backend_not_configured";
    return NextResponse.json({ error: message }, { status: 500 });
  }
  const response = await fetch(`${baseUrl}/clientes/${clienteId}/portal-links`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body ?? {}),
    cache: "no-store",
  });

  const text = await response.text();
  if (!response.ok) {
    const parsed = text ? safeJson(text) : null;
    const error =
      (parsed && typeof parsed.detail === "string" && parsed.detail) ||
      (parsed && typeof parsed.error === "string" && parsed.error) ||
      (text && !text.startsWith("<") ? text : null) ||
      "No se pudo generar el enlace.";
    return NextResponse.json({ error }, { status: response.status });
  }

  const payload = text ? safeJson(text) : null;
  return NextResponse.json(payload ?? { ok: true });
}
