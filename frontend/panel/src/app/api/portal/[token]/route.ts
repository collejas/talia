"use server";

import { NextResponse } from "next/server";

import { getPanelApiBaseUrl } from "@/lib/api/panel";

function safeJson(payload: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(payload);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: "Falta token." }, { status: 400 });
  }

  let baseUrl: string;
  try {
    baseUrl = getPanelApiBaseUrl();
  } catch (error) {
    const message = error instanceof Error ? error.message : "backend_not_configured";
    return NextResponse.json({ error: message }, { status: 500 });
  }
  const response = await fetch(`${baseUrl}/crm/portal/clientes/${token}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const text = await response.text();
  if (!response.ok) {
    const parsed = text ? safeJson(text) : null;
    const detail =
      (parsed && typeof parsed.detail === "string" && parsed.detail) ||
      (parsed && typeof parsed.error === "string" && parsed.error);
    const error =
      mapPortalError(detail) ||
      (text && !text.startsWith("<") ? text : null) ||
      "No se pudo cargar el portal.";
    return NextResponse.json({ error }, { status: response.status });
  }

  const payload = text ? safeJson(text) : null;
  return NextResponse.json(payload ?? { ok: true });
}

function mapPortalError(detail: string | null | undefined): string | null {
  if (!detail) return null;
  if (detail === "portal_token_revoked") {
    return "Este enlace fue revocado por el equipo.";
  }
  if (detail === "portal_token_expired") {
    return "Este enlace ya expiró. Solicita uno nuevo a tu ejecutivo.";
  }
  return detail;
}
