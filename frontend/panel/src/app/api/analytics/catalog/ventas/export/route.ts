import { NextResponse } from "next/server";

import { getPanelApiBaseUrl } from "@/lib/api/panel";
import { resolvePanelApiToken } from "@/lib/auth/panel-token";
import { resolveOrganizacionId } from "@/lib/settings/org";

export async function GET(request: Request) {
  const baseUrl = getPanelApiBaseUrl();
  const organizacionId = await resolveOrganizacionId();
  let token: string;
  try {
    token = await resolvePanelApiToken();
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se encontró token del panel.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const url = new URL(request.url);
  const search = url.search ? url.search : "";
  const response = await fetch(`${baseUrl}/crm/analytics/catalog/ventas/export${search}`, {
    headers: {
      Accept: "text/csv",
      Authorization: `Bearer ${token}`,
      ...(organizacionId ? { "X-Organizacion-Id": organizacionId } : {}),
    },
    cache: "no-store",
  });

  const buffer = await response.arrayBuffer();
  if (!response.ok) {
    const text = new TextDecoder().decode(buffer);
    const message = text || `Error ${response.status}`;
    return NextResponse.json({ error: message }, { status: response.status });
  }

  const nextHeaders = new Headers();
  nextHeaders.set("Content-Type", "text/csv; charset=utf-8");
  const disposition = response.headers.get("Content-Disposition") ?? "attachment; filename=ventas-productos.csv";
  nextHeaders.set("Content-Disposition", disposition);

  return new NextResponse(buffer, { status: 200, headers: nextHeaders });
}
