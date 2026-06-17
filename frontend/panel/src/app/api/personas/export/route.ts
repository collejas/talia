import { NextResponse } from "next/server";

import { getPanelApiBaseUrl } from "@/lib/api/panel";
import { resolvePanelApiToken } from "@/lib/auth/panel-token";

export async function GET(request: Request) {
  const baseUrl = getPanelApiBaseUrl();
  let token: string;
  try {
    token = await resolvePanelApiToken();
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se encontró token del panel.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const url = new URL(request.url);
  const backendUrl = new URL(`${baseUrl}/crm/personas/export`);
  url.searchParams.forEach((value, key) => {
    backendUrl.searchParams.append(key, value);
  });

  let response: Response;
  try {
    response = await fetch(backendUrl.toString(), {
      method: "GET",
      headers: {
        Accept: "text/csv",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "backend_unreachable";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const buffer = await response.arrayBuffer();
  if (!response.ok) {
    const text = new TextDecoder().decode(buffer);
    const message = text || `Error ${response.status}`;
    return NextResponse.json({ error: message }, { status: response.status });
  }

  const headers = new Headers();
  headers.set("Content-Type", "text/csv; charset=utf-8");
  headers.set(
    "Content-Disposition",
    response.headers.get("Content-Disposition") ?? 'attachment; filename="contactos.csv"',
  );

  return new NextResponse(buffer, { status: 200, headers });
}
