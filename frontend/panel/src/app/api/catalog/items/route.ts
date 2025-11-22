import { NextResponse } from "next/server";

import { getPanelApiBaseUrl } from "@/lib/api/panel";
import { resolvePanelApiToken } from "@/lib/auth/panel-token";

export async function GET(request: Request) {
  const baseUrl = getPanelApiBaseUrl();
  const { searchParams } = new URL(request.url);
  const limit = searchParams.get("limit") ?? "500";
  const includeInactive = searchParams.get("include_inactive");
  const search = searchParams.get("search");
  const tipo = searchParams.get("tipo");

  let token: string;
  try {
    token = await resolvePanelApiToken();
  } catch (error) {
    const detail = error instanceof Error ? error.message : "No se encontró token del panel.";
    return NextResponse.json({ error: detail }, { status: 500 });
  }

  const params = new URLSearchParams({ limit });
  if (includeInactive === "true") params.set("include_inactive", "true");
  if (search) params.set("search", search);
  if (tipo) params.set("tipo", tipo);

  const response = await fetch(`${baseUrl}/catalog/items?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  const text = await response.text();
  const payload = text ? safeJson(text) : null;
  if (!response.ok) {
    return NextResponse.json(
      {
        error:
          (payload && typeof payload.detail === "string" && payload.detail) ||
          (payload && typeof payload.error === "string" && payload.error) ||
          text ||
          "No se pudo consultar el catálogo.",
      },
      { status: response.status },
    );
  }

  return NextResponse.json(payload ?? { items: [] });
}

function safeJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
